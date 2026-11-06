use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Wry};

use crate::actions::{self, Action};
use crate::timer::engine::{SessionKind, Status};
use crate::timer::service::TimerSnapshot;
use crate::AppState;

pub struct TrayMenu {
    status: MenuItem<Wry>,
    toggle: MenuItem<Wry>,
}

fn kind_label(k: SessionKind) -> &'static str {
    match k {
        SessionKind::Focus => "Focus",
        SessionKind::ShortBreak => "Short break",
        SessionKind::LongBreak => "Long break",
    }
}

fn labels(s: &TimerSnapshot) -> (String, &'static str) {
    let mins = (s.remaining_ms + 59_999) / 60_000;
    let kind = kind_label(s.state.kind);
    match s.state.status {
        Status::Idle => (format!("{kind} · ready"), "Start"),
        Status::Running => (format!("{kind} · ends in {mins} min"), "Pause"),
        Status::Paused => (format!("{kind} · paused, {mins} min left"), "Resume"),
    }
}

pub fn create(app: &AppHandle, snap: &TimerSnapshot) -> tauri::Result<TrayMenu> {
    let (status_text, toggle_text) = labels(snap);
    let status = MenuItem::with_id(app, "status", status_text, false, None::<&str>)?;
    let toggle = MenuItem::with_id(app, Action::PauseResume.name(), toggle_text, true, None::<&str>)?;
    let item = |a: Action, text: &str| MenuItem::with_id(app, a.name(), text, true, None::<&str>);
    let menu = Menu::with_items(
        app,
        &[
            &status,
            &toggle,
            &item(Action::NewFocus, "New focus session")?,
            &PredefinedMenuItem::separator(app)?,
            &item(Action::ToggleFloating, "Floating timer")?,
            &item(Action::QuickTasks, "Quick tasks")?,
            &item(Action::MiniSession, "Mini session")?,
            &PredefinedMenuItem::separator(app)?,
            &item(Action::OpenMain, "Open tempo")?,
            &MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?,
        ],
    )?;

    let mut builder = TrayIconBuilder::with_id("tempo")
        .tooltip("tempo")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "quit" => app.exit(0),
            id => {
                if let Some(a) = Action::parse(id) {
                    actions::dispatch(app, a);
                }
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                actions::dispatch(tray.app_handle(), Action::OpenMain);
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(TrayMenu { status, toggle })
}

/// Called on every timer change. Menu text only — cheap enough to run each time.
pub fn refresh(app: &AppHandle, snap: &TimerSnapshot) {
    let state = app.state::<AppState>();
    let guard = state.tray.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(menu) = guard.as_ref() {
        let (status, toggle) = labels(snap);
        let _ = menu.status.set_text(status);
        let _ = menu.toggle.set_text(toggle);
    }
}
