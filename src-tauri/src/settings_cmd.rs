use tauri::{AppHandle, Emitter, State};
use tauri_plugin_autostart::ManagerExt;

use crate::error::{AppError, AppResult};
use crate::settings::{self, Settings};
use crate::shortcuts::{self, ShortcutStatus};
use crate::AppState;

pub const CHANGED_EVENT: &str = "settings://changed";

/// Persist settings and push them into every subsystem that depends on them.
pub fn apply(app: &AppHandle, state: &AppState, next: Settings) -> AppResult<Settings> {
    next.validate()?;
    let prev = state.settings();
    settings::save(&state.db.conn(), &next)?;
    *state.settings.lock().unwrap_or_else(|e| e.into_inner()) = next.clone();

    if prev.timer != next.timer {
        let snap = state.timer.set_config(next.timer.to_config())?;
        crate::timer::publish(app, &snap, None, false);
    }
    if prev.shortcuts != next.shortcuts {
        let status = shortcuts::register_all(app, &next.shortcuts);
        *state.shortcut_status.lock().unwrap_or_else(|e| e.into_inner()) = status;
    }
    sync_autostart(app, next.system.autostart)?;
    let _ = app.emit(CHANGED_EVENT, &next);
    Ok(next)
}

pub fn sync_autostart(app: &AppHandle, wanted: bool) -> AppResult<()> {
    let launcher = app.autolaunch();
    let enabled = launcher.is_enabled().unwrap_or(false);
    let r = match (wanted, enabled) {
        (true, false) => launcher.enable(),
        (false, true) => launcher.disable(),
        _ => Ok(()),
    };
    r.map_err(|e| AppError::invalid(format!("could not change start-on-login: {e}")))
}

#[tauri::command]
pub fn settings_get(state: State<'_, AppState>) -> Settings {
    state.settings()
}

#[tauri::command]
pub fn settings_update(app: AppHandle, state: State<'_, AppState>, settings: Settings) -> AppResult<Settings> {
    apply(&app, &state, settings)
}

#[tauri::command]
pub fn shortcuts_status(state: State<'_, AppState>) -> Vec<ShortcutStatus> {
    state.shortcut_status.lock().unwrap_or_else(|e| e.into_inner()).clone()
}

#[tauri::command]
pub fn app_quit(app: AppHandle) {
    app.exit(0);
}
