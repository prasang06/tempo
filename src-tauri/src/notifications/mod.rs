use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

use crate::timer::engine::{SessionKind, SessionRecord, Status};
use crate::timer::service::TimerSnapshot;
use crate::AppState;

fn minutes(ms: i64) -> i64 {
    (ms + 30_000) / 60_000
}

/// A session ran to completion. Says what just ended and what comes next.
pub fn session_finished(app: &AppHandle, record: &SessionRecord, next: &TimerSnapshot) {
    let prefs = app.state::<AppState>().settings().notifications;
    if !prefs.enabled {
        return;
    }
    let after = if next.state.status == Status::Running { "Started" } else { "Up next" };
    let (title, body) = match record.kind {
        SessionKind::Focus => {
            let what = record.task_id.as_ref().and(next.task_title.clone()).map(|t| format!(" on “{t}”")).unwrap_or_default();
            let brk = if next.state.kind == SessionKind::LongBreak { "long break" } else { "break" };
            (
                format!("{} min of focus{what} done", minutes(record.actual_ms)),
                format!("{after}: {} min {brk}.", minutes(next.state.duration_ms)),
            )
        }
        _ => ("Break's over".to_string(), format!("{after}: {} min focus.", minutes(next.state.duration_ms))),
    };
    let mut n = app.notification().builder().title(title).body(body).icon("dev.tempo.app");
    if prefs.sound && !prefs.sound_name.trim().is_empty() {
        n = n.sound(prefs.sound_name.trim());
    }
    if let Err(e) = n.show() {
        log::warn!("notification failed: {e}");
    }
}

/// Lets the user check that notifications reach their desktop.
#[tauri::command]
pub fn notifications_test(app: AppHandle) -> crate::error::AppResult<()> {
    let prefs = app.state::<AppState>().settings().notifications;
    let mut n = app.notification().builder().title("tempo").body("Notifications are working.").icon("dev.tempo.app");
    if prefs.sound && !prefs.sound_name.trim().is_empty() {
        n = n.sound(prefs.sound_name.trim());
    }
    n.show().map_err(|e| crate::error::AppError::invalid(e.to_string()))
}
