pub mod engine;
pub mod service;

use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, State};

use crate::database::new_id;
use crate::error::AppResult;
use crate::AppState;
use engine::{SessionKind, SessionRecord, Status};
use service::TimerSnapshot;

pub const STATE_EVENT: &str = "timer://state";
pub const SESSIONS_EVENT: &str = "sessions://changed";

/// Broadcast a change to every window and update the tray. `finished` is set only when
/// a session ran to completion, which is the one case that notifies the user.
pub fn publish(app: &AppHandle, snap: &TimerSnapshot, record: Option<&SessionRecord>, finished: bool) {
    if let Err(e) = app.emit(STATE_EVENT, snap) {
        log::error!("failed to emit timer state: {e}");
    }
    if record.is_some() {
        let _ = app.emit(SESSIONS_EVENT, ());
    }
    if finished {
        if let Some(r) = record {
            crate::notifications::session_finished(app, r, snap);
        }
    }
    crate::tray::refresh(app, snap);
}

/// Completes sessions on time and flushes buffered overlay geometry. Uses the wall clock,
/// so suspend/resume is handled by the first tick after wake.
pub fn spawn_ticker(app: AppHandle) {
    std::thread::Builder::new()
        .name("tempo-ticker".into())
        .spawn(move || loop {
            std::thread::sleep(Duration::from_millis(250));
            let state = app.state::<AppState>();
            match state.timer.tick() {
                Ok(Some((snap, record))) => publish(&app, &snap, Some(&record), true),
                Ok(None) => {}
                Err(e) => log::error!("timer tick failed: {e}"),
            }
            state.overlays.flush(&state.db);
        })
        .expect("spawn ticker thread");
}

fn run(
    app: &AppHandle,
    state: &AppState,
    f: impl FnOnce(&mut engine::TimerState, &engine::TimerConfig, i64) -> engine::Transition,
) -> AppResult<TimerSnapshot> {
    let (snap, record) = state.timer.apply(f)?;
    publish(app, &snap, record.as_ref(), false);
    Ok(snap)
}

/// Start/pause/resume in one gesture — what the space bar and the tray do.
pub fn toggle(app: &AppHandle, state: &AppState) -> AppResult<TimerSnapshot> {
    run(app, state, |s, _, now| match s.status {
        Status::Idle => s.start(now, new_id()),
        Status::Running => s.pause(now),
        Status::Paused => s.resume(now),
    })
}

/// Begin a fresh focus session, ending whatever is in progress.
pub fn start_focus(app: &AppHandle, state: &AppState) -> AppResult<TimerSnapshot> {
    run(app, state, |s, c, now| {
        let record = if s.status == Status::Idle { None } else { s.reset(now, c)? };
        if s.kind != SessionKind::Focus {
            s.select_kind(SessionKind::Focus, c)?;
        }
        s.start(now, new_id())?;
        Ok(record)
    })
}

#[tauri::command]
pub fn timer_get(state: State<'_, AppState>) -> TimerSnapshot {
    state.timer.snapshot()
}

#[tauri::command]
pub fn timer_start(app: AppHandle, state: State<'_, AppState>) -> AppResult<TimerSnapshot> {
    run(&app, &state, |s, _, now| s.start(now, new_id()))
}

#[tauri::command]
pub fn timer_pause(app: AppHandle, state: State<'_, AppState>) -> AppResult<TimerSnapshot> {
    run(&app, &state, |s, _, now| s.pause(now))
}

#[tauri::command]
pub fn timer_resume(app: AppHandle, state: State<'_, AppState>) -> AppResult<TimerSnapshot> {
    run(&app, &state, |s, _, now| s.resume(now))
}

#[tauri::command]
pub fn timer_toggle(app: AppHandle, state: State<'_, AppState>) -> AppResult<TimerSnapshot> {
    toggle(&app, &state)
}

#[tauri::command]
pub fn timer_reset(app: AppHandle, state: State<'_, AppState>) -> AppResult<TimerSnapshot> {
    run(&app, &state, |s, c, now| s.reset(now, c))
}

#[tauri::command]
pub fn timer_skip(app: AppHandle, state: State<'_, AppState>) -> AppResult<TimerSnapshot> {
    run(&app, &state, |s, c, now| s.skip(now, c))
}

#[tauri::command]
pub fn timer_select_kind(app: AppHandle, state: State<'_, AppState>, kind: SessionKind) -> AppResult<TimerSnapshot> {
    run(&app, &state, |s, c, _| s.select_kind(kind, c))
}

#[tauri::command]
pub fn timer_set_task(app: AppHandle, state: State<'_, AppState>, task_id: Option<String>) -> AppResult<TimerSnapshot> {
    run(&app, &state, |s, _, _| {
        s.set_task(task_id);
        Ok(None)
    })
}
