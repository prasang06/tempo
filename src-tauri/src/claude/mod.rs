//! Claude Code activity. Claude Code's hooks run `tempo --claude-hook <port file>`,
//! which forwards a few fields of the hook's JSON to the running app over localhost.
//! Nothing here talks to Anthropic or reads prompts, so it costs no tokens.

pub mod hooks;

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_notification::NotificationExt;

use crate::error::AppResult;
use crate::timer::engine::Status;
use crate::AppState;

pub const ACTIVITY_EVENT: &str = "claude://activity";
pub const HOOK_FLAG: &str = "--claude-hook";
/// First line of every message. HTTP requests (a web page probing localhost) never match it.
const MAGIC: &str = "tempo-claude/1";
const MAX_MESSAGE: u64 = 16 * 1024;
/// Sessions that end without a SessionEnd (a killed terminal) drop out after this.
const STALE_MS: i64 = 6 * 60 * 60_000;
/// Short replies don't deserve a "finished" notification.
const NOTIFY_AFTER_MS: i64 = 30_000;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AgentStatus {
    /// Session open, nothing asked yet.
    Idle,
    Working,
    /// Blocked on a permission prompt or a question.
    Waiting,
    /// Finished its turn.
    Done,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgentSession {
    pub id: String,
    /// Last path component of the working directory.
    pub project: String,
    pub cwd: String,
    pub title: Option<String>,
    pub status: AgentStatus,
    /// When the current status began.
    pub since: i64,
    pub updated: i64,
}

/// What the hook process sends: the hook's event plus the fields tempo uses.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HookMessage {
    pub event: String,
    pub session_id: String,
    #[serde(default)]
    pub cwd: String,
    #[serde(default)]
    pub notification_type: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    /// When the hook fired. Hooks run async, so messages can arrive out of order.
    pub at: i64,
}

/// A transition worth telling the user about.
#[derive(Debug, Clone, PartialEq)]
pub enum Change {
    NeedsYou(AgentSession),
    Finished(AgentSession),
    Started(AgentSession),
}

#[derive(Default)]
pub struct Activity {
    sessions: Mutex<HashMap<String, AgentSession>>,
}

impl Activity {
    pub fn list(&self, now: i64) -> Vec<AgentSession> {
        let mut map = self.sessions.lock().unwrap_or_else(|e| e.into_inner());
        map.retain(|_, s| now - s.updated < STALE_MS);
        let mut list: Vec<_> = map.values().cloned().collect();
        list.sort_by_key(|s| std::cmp::Reverse(s.updated));
        list
    }

    /// Applies one hook message. Returns `None` when nothing visible changed.
    pub fn apply(&self, msg: &HookMessage) -> Option<Option<Change>> {
        let mut map = self.sessions.lock().unwrap_or_else(|e| e.into_inner());
        if msg.event == "SessionEnd" {
            return map.remove(&msg.session_id).map(|_| None);
        }
        let next = match (msg.event.as_str(), msg.notification_type.as_deref()) {
            ("SessionStart", _) => AgentStatus::Idle,
            ("UserPromptSubmit" | "PostToolUse", _) => AgentStatus::Working,
            ("Stop", _) => AgentStatus::Done,
            ("Notification", Some("permission_prompt" | "elicitation_dialog" | "agent_needs_input")) => AgentStatus::Waiting,
            _ => return None,
        };
        let entry = map.entry(msg.session_id.clone()).or_insert_with(|| AgentSession {
            id: msg.session_id.clone(),
            project: project_name(&msg.cwd),
            cwd: msg.cwd.clone(),
            title: None,
            status: AgentStatus::Idle,
            since: msg.at,
            updated: i64::MIN,
        });
        if msg.at < entry.updated {
            return None; // a late async hook from before the latest event
        }
        if msg.title.is_some() {
            entry.title.clone_from(&msg.title);
        }
        if !msg.cwd.is_empty() && msg.cwd != entry.cwd {
            entry.cwd.clone_from(&msg.cwd);
            entry.project = project_name(&msg.cwd);
        }
        let prev = entry.status;
        let prev_since = entry.since;
        entry.updated = msg.at;
        if prev == next {
            return Some(None);
        }
        entry.status = next;
        entry.since = msg.at;
        let change = match next {
            AgentStatus::Waiting => Some(Change::NeedsYou(entry.clone())),
            // A turn's length runs from the prompt, through any permission waits.
            AgentStatus::Done if msg.at - prev_since >= NOTIFY_AFTER_MS && prev == AgentStatus::Working => {
                Some(Change::Finished(entry.clone()))
            }
            AgentStatus::Working if msg.event == "UserPromptSubmit" => Some(Change::Started(entry.clone())),
            _ => None,
        };
        Some(change)
    }
}

fn project_name(cwd: &str) -> String {
    Path::new(cwd)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| "Claude Code".into())
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

pub fn port_file(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(app.path().app_data_dir()?.join("claude.port"))
}

/// Listens on an ephemeral localhost port and records it for the hook process.
pub fn spawn_listener(app: AppHandle) -> AppResult<()> {
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))?;
    let port = listener.local_addr()?.port();
    std::fs::write(port_file(&app)?, port.to_string())?;
    log::info!("claude code hooks listening on 127.0.0.1:{port}");
    std::thread::Builder::new().name("tempo-claude".into()).spawn(move || {
        for stream in listener.incoming().flatten() {
            match read_message(stream) {
                Some(msg) => handle(&app, &msg),
                None => log::debug!("ignored a malformed claude hook message"),
            }
        }
    })?;
    Ok(())
}

fn read_message(stream: TcpStream) -> Option<HookMessage> {
    stream.set_read_timeout(Some(Duration::from_secs(2))).ok()?;
    let mut reader = BufReader::new(stream.take(MAX_MESSAGE));
    let mut line = String::new();
    reader.read_line(&mut line).ok()?;
    if line.trim_end() != MAGIC {
        return None;
    }
    line.clear();
    reader.read_line(&mut line).ok()?;
    serde_json::from_str(&line).ok()
}

fn handle(app: &AppHandle, msg: &HookMessage) {
    let state = app.state::<AppState>();
    let Some(change) = state.claude.apply(msg) else { return };
    let _ = app.emit(ACTIVITY_EVENT, state.claude.list(now_ms()));

    let prefs = state.settings().claude;
    match change {
        Some(Change::Started(_)) if prefs.auto_focus && state.timer.snapshot().state.status == Status::Idle => {
            if let Err(e) = crate::timer::start_focus(app, &state) {
                log::warn!("could not start focus for claude: {e}");
            }
        }
        Some(Change::NeedsYou(s)) if prefs.notify => notify(app, "Claude needs you", &s),
        Some(Change::Finished(s)) if prefs.notify => notify(app, "Claude is done", &s),
        _ => {}
    }
}

fn notify(app: &AppHandle, title: &str, session: &AgentSession) {
    let body = session.title.clone().unwrap_or_else(|| session.project.clone());
    if let Err(e) = app.notification().builder().title(title).body(body).icon("dev.tempo.app").show() {
        log::warn!("notification failed: {e}");
    }
}

/// Entry point when Claude Code runs us as a hook: read the hook JSON from stdin, pass
/// it on, exit. Never starts the app, and never fails the hook if tempo isn't running.
pub fn run_hook(port_file: Option<&str>) -> i32 {
    let mut input = String::new();
    if std::io::stdin().take(4 * 1024 * 1024).read_to_string(&mut input).is_err() {
        return 0;
    }
    let Some(msg) = parse_hook_input(&input, now_ms()) else { return 0 };
    let Some(port) = port_file
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| s.trim().parse::<u16>().ok())
    else {
        return 0;
    };
    let addr = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
    if let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(300)) {
        let _ = stream.set_write_timeout(Some(Duration::from_millis(500)));
        if let Ok(json) = serde_json::to_string(&msg) {
            let _ = write!(stream, "{MAGIC}\n{json}\n");
        }
    }
    0
}

/// Keeps only what tempo shows. Prompts and replies are never forwarded.
fn parse_hook_input(input: &str, at: i64) -> Option<HookMessage> {
    let v: serde_json::Value = serde_json::from_str(input).ok()?;
    let s = |k: &str| v.get(k).and_then(|x| x.as_str()).map(str::to_owned);
    Some(HookMessage {
        event: s("hook_event_name")?,
        session_id: s("session_id")?,
        cwd: s("cwd").unwrap_or_default(),
        notification_type: s("notification_type"),
        title: s("session_title"),
        at,
    })
}

#[tauri::command]
pub fn claude_activity(state: State<'_, AppState>) -> Vec<AgentSession> {
    state.claude.list(now_ms())
}

#[tauri::command]
pub fn claude_hooks_status(app: AppHandle) -> AppResult<hooks::HookStatus> {
    hooks::status(&app)
}

#[tauri::command]
pub fn claude_hooks_install(app: AppHandle) -> AppResult<hooks::HookStatus> {
    hooks::install(&app)?;
    hooks::status(&app)
}

#[tauri::command]
pub fn claude_hooks_remove(app: AppHandle) -> AppResult<hooks::HookStatus> {
    hooks::remove(&app)?;
    hooks::status(&app)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn msg(event: &str, at: i64) -> HookMessage {
        HookMessage {
            event: event.into(),
            session_id: "s1".into(),
            cwd: "/home/me/code/tempo".into(),
            notification_type: None,
            title: None,
            at,
        }
    }

    #[test]
    fn a_turn_from_prompt_to_stop() {
        let a = Activity::default();
        assert_eq!(a.apply(&msg("SessionStart", 0)), Some(None));
        assert!(matches!(a.apply(&msg("UserPromptSubmit", 1_000)), Some(Some(Change::Started(_)))));
        assert_eq!(a.list(1_000)[0].project, "tempo");
        assert_eq!(a.apply(&msg("PostToolUse", 2_000)), Some(None), "still working");
        let mut ask = msg("Notification", 3_000);
        ask.notification_type = Some("permission_prompt".into());
        assert!(matches!(a.apply(&ask), Some(Some(Change::NeedsYou(_)))));
        assert_eq!(a.list(3_000)[0].status, AgentStatus::Waiting);
        a.apply(&msg("PostToolUse", 4_000));
        assert!(matches!(a.apply(&msg("Stop", 60_000)), Some(Some(Change::Finished(_)))));
        assert_eq!(a.apply(&msg("SessionEnd", 61_000)), Some(None));
        assert!(a.list(61_000).is_empty());
    }

    #[test]
    fn quick_replies_and_late_hooks_stay_quiet() {
        let a = Activity::default();
        a.apply(&msg("UserPromptSubmit", 0));
        assert_eq!(a.apply(&msg("Stop", 5_000)), Some(None), "too short to notify");
        assert_eq!(a.apply(&msg("PostToolUse", 4_000)), None, "older than the stop");
        assert_eq!(a.list(5_000)[0].status, AgentStatus::Done);
        let mut idle = msg("Notification", 6_000);
        idle.notification_type = Some("idle_prompt".into());
        assert_eq!(a.apply(&idle), None);
    }

    #[test]
    fn stale_sessions_drop_out() {
        let a = Activity::default();
        a.apply(&msg("SessionStart", 0));
        assert!(a.list(STALE_MS + 1).is_empty());
    }

    #[test]
    fn hook_input_drops_prompt_text() {
        let raw = r#"{"session_id":"abc","cwd":"/x/y","hook_event_name":"UserPromptSubmit","prompt":"secret plans"}"#;
        let m = parse_hook_input(raw, 7).unwrap();
        assert_eq!((m.event.as_str(), m.session_id.as_str(), m.at), ("UserPromptSubmit", "abc", 7));
        assert!(!serde_json::to_string(&m).unwrap().contains("secret"));
        assert!(parse_hook_input("not json", 0).is_none());
    }
}
