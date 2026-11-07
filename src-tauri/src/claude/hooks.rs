//! Adds tempo's hooks to Claude Code's user settings (`~/.claude/settings.json`) and
//! takes them out again, leaving everything else in the file as it was.

use std::path::PathBuf;

use serde::Serialize;
use serde_json::{json, Map, Value};
use tauri::{AppHandle, Manager};

use super::HOOK_FLAG;
use crate::error::{AppError, AppResult};

/// The events tempo listens to. PostToolUse is how it sees work resume after a prompt.
const EVENTS: [&str; 8] = [
    "SessionStart",
    "UserPromptSubmit",
    "PostToolUse",
    "Notification",
    "Stop",
    "SessionEnd",
    "TaskCreated",
    "TaskCompleted",
];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HookStatus {
    pub path: String,
    pub installed: bool,
    /// Installed hooks point at this copy of tempo.
    pub current: bool,
}

fn settings_path(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = match std::env::var_os("CLAUDE_CONFIG_DIR") {
        Some(d) if !d.is_empty() => PathBuf::from(d),
        _ => app.path().home_dir()?.join(".claude"),
    };
    Ok(dir.join("settings.json"))
}

fn command(app: &AppHandle) -> AppResult<String> {
    // An AppImage's own path changes on every mount; $APPIMAGE is the file the user runs.
    let exe = match std::env::var_os("APPIMAGE") {
        Some(p) => PathBuf::from(p),
        None => std::env::current_exe()?,
    };
    let port = super::port_file(app)?;
    Ok(format!("\"{}\" {HOOK_FLAG} \"{}\"", exe.display(), port.display()))
}

fn read(path: &PathBuf) -> AppResult<Value> {
    match std::fs::read_to_string(path) {
        Ok(raw) if raw.trim().is_empty() => Ok(json!({})),
        Ok(raw) => {
            let v: Value = serde_json::from_str(&raw)
                .map_err(|e| AppError::invalid(format!("{} isn't valid JSON ({e}); left it alone", path.display())))?;
            if v.is_object() { Ok(v) } else { Err(AppError::invalid(format!("{} isn't a JSON object", path.display()))) }
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(json!({})),
        Err(e) => Err(e.into()),
    }
}

fn write(path: &PathBuf, v: &Value) -> AppResult<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    // Write beside and rename, so Claude Code never reads a half-written file.
    let tmp = path.with_extension("json.tempo-tmp");
    std::fs::write(&tmp, serde_json::to_string_pretty(v)? + "\n")?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}

fn is_ours(hook: &Value) -> bool {
    hook.get("command").and_then(Value::as_str).is_some_and(|c| c.contains(HOOK_FLAG))
}

/// Strips tempo's hooks, dropping matcher groups and events left empty.
fn strip(settings: &mut Value) {
    let Some(hooks) = settings.get_mut("hooks").and_then(Value::as_object_mut) else { return };
    for groups in hooks.values_mut() {
        if let Some(groups) = groups.as_array_mut() {
            for g in groups.iter_mut() {
                if let Some(list) = g.get_mut("hooks").and_then(Value::as_array_mut) {
                    list.retain(|h| !is_ours(h));
                }
            }
            groups.retain(|g| g.get("hooks").and_then(Value::as_array).map_or(true, |l| !l.is_empty()));
        }
    }
    hooks.retain(|_, groups| groups.as_array().map_or(true, |g| !g.is_empty()));
    if hooks.is_empty() {
        settings.as_object_mut().map(|o| o.remove("hooks"));
    }
}

fn add(settings: &mut Value, cmd: &str) {
    let obj = settings.as_object_mut().expect("checked in read");
    let hooks = obj.entry("hooks").or_insert_with(|| Value::Object(Map::new()));
    if !hooks.is_object() {
        *hooks = Value::Object(Map::new());
    }
    let hooks = hooks.as_object_mut().expect("just made an object");
    for event in EVENTS {
        let groups = hooks.entry(event).or_insert_with(|| json!([]));
        if !groups.is_array() {
            *groups = json!([]);
        }
        // Async: Claude Code never waits on tempo.
        groups.as_array_mut().expect("array").push(json!({
            "hooks": [{ "type": "command", "command": cmd, "async": true }]
        }));
    }
}

fn commands(settings: &Value) -> Vec<String> {
    let Some(hooks) = settings.get("hooks").and_then(Value::as_object) else { return vec![] };
    hooks
        .values()
        .filter_map(Value::as_array)
        .flatten()
        .filter_map(|g| g.get("hooks").and_then(Value::as_array))
        .flatten()
        .filter(|h| is_ours(h))
        .filter_map(|h| h.get("command").and_then(Value::as_str).map(str::to_owned))
        .collect()
}

pub fn status(app: &AppHandle) -> AppResult<HookStatus> {
    let path = settings_path(app)?;
    let found = read(&path).map(|v| commands(&v)).unwrap_or_default();
    let cmd = command(app)?;
    Ok(HookStatus {
        path: path.display().to_string(),
        installed: !found.is_empty(),
        current: found.len() == EVENTS.len() && found.iter().all(|c| *c == cmd),
    })
}

pub fn install(app: &AppHandle) -> AppResult<()> {
    let path = settings_path(app)?;
    let mut v = read(&path)?;
    if path.exists() {
        std::fs::copy(&path, path.with_extension("json.tempo-backup"))?;
    }
    strip(&mut v);
    add(&mut v, &command(app)?);
    write(&path, &v)
}

pub fn remove(app: &AppHandle) -> AppResult<()> {
    let path = settings_path(app)?;
    let mut v = read(&path)?;
    if commands(&v).is_empty() {
        return Ok(());
    }
    strip(&mut v);
    write(&path, &v)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn install_and_remove_leave_other_hooks_alone() {
        let mut v = json!({
            "model": "opus",
            "hooks": { "Stop": [{ "hooks": [{ "type": "command", "command": "notify-send done" }] }] }
        });
        let before = v.clone();
        let cmd = format!("\"/usr/bin/tempo\" {HOOK_FLAG} \"/tmp/p\"");
        add(&mut v, &cmd);
        assert_eq!(commands(&v).len(), EVENTS.len());
        assert_eq!(v["hooks"]["Stop"].as_array().unwrap().len(), 2);

        // Reinstalling replaces rather than duplicates.
        strip(&mut v);
        add(&mut v, &cmd);
        assert_eq!(commands(&v).len(), EVENTS.len());

        strip(&mut v);
        assert_eq!(v, before);

        let mut only_ours = json!({});
        add(&mut only_ours, &cmd);
        strip(&mut only_ours);
        assert_eq!(only_ours, json!({}));
    }
}
