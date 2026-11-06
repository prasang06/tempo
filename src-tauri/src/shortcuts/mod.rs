//! Global shortcuts. These rely on X11 key grabs, so they work on X11 sessions and for
//! XWayland, but native Wayland compositors don't expose global grabs to apps. There the
//! user binds `tempo --action <name>` in their desktop's shortcut settings instead.

use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::actions::{self, Action};
use crate::settings::Shortcuts;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutStatus {
    pub action: Action,
    pub accelerator: String,
    pub registered: bool,
    pub error: Option<String>,
}

pub fn bindings(s: &Shortcuts) -> Vec<(Action, String)> {
    vec![
        (Action::ToggleFloating, s.toggle_floating.clone()),
        (Action::QuickTasks, s.quick_tasks.clone()),
        (Action::PauseResume, s.pause_resume.clone()),
        (Action::NewFocus, s.new_focus.clone()),
        (Action::ToggleOnTop, s.toggle_on_top.clone()),
        (Action::OpenMain, s.open_main.clone()),
    ]
}

/// Re-registers every shortcut and reports each one's outcome, so the settings page can
/// show which accelerators are taken by another program.
pub fn register_all(app: &AppHandle, s: &Shortcuts) -> Vec<ShortcutStatus> {
    let gs = app.global_shortcut();
    if let Err(e) = gs.unregister_all() {
        log::warn!("unregistering shortcuts failed: {e}");
    }
    let mut seen: Vec<Shortcut> = Vec::new();
    bindings(s)
        .into_iter()
        .map(|(action, accel)| {
            let mut status = ShortcutStatus { action, accelerator: accel.clone(), registered: false, error: None };
            if !s.enabled || accel.trim().is_empty() {
                return status;
            }
            let shortcut: Shortcut = match accel.parse() {
                Ok(sc) => sc,
                Err(e) => {
                    status.error = Some(format!("can't read “{accel}”: {e}"));
                    return status;
                }
            };
            if seen.contains(&shortcut) {
                status.error = Some("already used by another tempo action".into());
                return status;
            }
            seen.push(shortcut);
            match gs.on_shortcut(shortcut, move |app, _, event| {
                if event.state == ShortcutState::Pressed {
                    actions::dispatch(app, action);
                }
            }) {
                Ok(()) => status.registered = true,
                Err(e) => status.error = Some(format!("{e}")),
            }
            status
        })
        .collect()
}
