//! Independent overlay windows and their persisted preferences.

use std::collections::HashMap;
use std::sync::Mutex;

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

use crate::database::Db;
use crate::error::{AppError, AppResult};
use crate::AppState;

pub const PREFS_EVENT: &str = "overlays://changed";

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct OverlaySpec {
    pub label: &'static str,
    pub title: &'static str,
    pub width: f64,
    pub height: f64,
    pub resizable: bool,
}

pub const OVERLAYS: [OverlaySpec; 3] = [
    OverlaySpec { label: "floating-timer", title: "tempo — timer", width: 230.0, height: 145.0, resizable: false },
    OverlaySpec { label: "quick-tasks", title: "tempo — tasks", width: 280.0, height: 260.0, resizable: true },
    OverlaySpec { label: "mini-session", title: "tempo — mini", width: 190.0, height: 85.0, resizable: false },
];

pub fn spec(label: &str) -> AppResult<OverlaySpec> {
    OVERLAYS.iter().copied().find(|s| s.label == label).ok_or_else(|| AppError::NotFound(format!("overlay {label}")))
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OverlayPrefs {
    pub label: String,
    pub visible: bool,
    pub x: Option<i32>,
    pub y: Option<i32>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub always_on_top: bool,
    pub opacity: f64,
}

impl OverlayPrefs {
    fn default_for(label: &str) -> Self {
        Self {
            label: label.into(),
            visible: false,
            x: None,
            y: None,
            width: None,
            height: None,
            always_on_top: false,
            opacity: 0.96,
        }
    }
}

#[derive(Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct OverlayPatch {
    pub always_on_top: Option<bool>,
    pub opacity: Option<f64>,
}

pub fn load_prefs(conn: &Connection, label: &str) -> AppResult<OverlayPrefs> {
    let row = conn
        .query_row(
            "SELECT visible, x, y, width, height, always_on_top, opacity FROM overlay_prefs WHERE label = ?1",
            [label],
            |r| {
                Ok(OverlayPrefs {
                    label: label.into(),
                    visible: r.get(0)?,
                    x: r.get(1)?,
                    y: r.get(2)?,
                    width: r.get(3)?,
                    height: r.get(4)?,
                    always_on_top: r.get(5)?,
                    opacity: r.get(6)?,
                })
            },
        )
        .optional()?;
    Ok(row.unwrap_or_else(|| OverlayPrefs::default_for(label)))
}

pub fn save_prefs(conn: &Connection, p: &OverlayPrefs) -> AppResult<()> {
    conn.execute(
        "INSERT INTO overlay_prefs (label, visible, x, y, width, height, always_on_top, opacity)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(label) DO UPDATE SET visible = excluded.visible, x = excluded.x, y = excluded.y,
            width = excluded.width, height = excluded.height,
            always_on_top = excluded.always_on_top, opacity = excluded.opacity",
        params![p.label, p.visible, p.x, p.y, p.width, p.height, p.always_on_top, p.opacity.clamp(0.3, 1.0)],
    )?;
    Ok(())
}

/// Buffers geometry from move/resize events (which fire continuously while dragging);
/// the ticker writes them out at most four times a second.
#[derive(Default)]
pub struct OverlayManager {
    pending: Mutex<HashMap<String, Geometry>>,
}

#[derive(Default, Clone, Copy)]
struct Geometry {
    pos: Option<(i32, i32)>,
    size: Option<(u32, u32)>,
}

impl OverlayManager {
    fn record(&self, label: &str, pos: Option<(i32, i32)>, size: Option<(u32, u32)>) {
        let mut pending = self.pending.lock().unwrap_or_else(|e| e.into_inner());
        let g = pending.entry(label.to_string()).or_default();
        if pos.is_some() {
            g.pos = pos;
        }
        if size.is_some() {
            g.size = size;
        }
    }

    pub fn flush(&self, db: &Db) {
        let pending: Vec<_> = self.pending.lock().unwrap_or_else(|e| e.into_inner()).drain().collect();
        if pending.is_empty() {
            return;
        }
        let conn = db.conn();
        for (label, g) in pending {
            let result = load_prefs(&conn, &label).and_then(|mut p| {
                if let Some((x, y)) = g.pos {
                    (p.x, p.y) = (Some(x), Some(y));
                }
                if let Some((w, h)) = g.size {
                    (p.width, p.height) = (Some(w), Some(h));
                }
                save_prefs(&conn, &p)
            });
            if let Err(e) = result {
                log::warn!("could not save overlay geometry for {label}: {e}");
            }
        }
    }
}

/// Wayland does not let clients position themselves or learn their position.
pub fn is_wayland() -> bool {
    std::env::var_os("WAYLAND_DISPLAY").is_some() && std::env::var("GDK_BACKEND").map_or(true, |b| !b.contains("x11"))
}

fn build(app: &AppHandle, spec: OverlaySpec, prefs: &OverlayPrefs) -> AppResult<WebviewWindow> {
    let (w, h) = match (prefs.width, prefs.height, spec.resizable) {
        (Some(w), Some(h), true) => (f64::from(w), f64::from(h)),
        _ => (spec.width, spec.height),
    };
    let mut b = WebviewWindowBuilder::new(app, spec.label, WebviewUrl::App("index.html".into()))
        .title(spec.title)
        .inner_size(w, h)
        .min_inner_size(spec.width.min(180.0), spec.height.min(80.0))
        .resizable(spec.resizable)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .skip_taskbar(true)
        .always_on_top(prefs.always_on_top)
        .focused(false)
        .visible(true)
        .disable_drag_drop_handler();
    if let (Some(x), Some(y), false) = (prefs.x, prefs.y, is_wayland()) {
        b = b.position(f64::from(x), f64::from(y));
    }
    let win = b.build()?;
    if let (Some(x), Some(y), false) = (prefs.x, prefs.y, is_wayland()) {
        // Builder position is logical; re-apply physical to survive scale factors.
        let _ = win.set_position(PhysicalPosition::new(x, y));
    }

    #[cfg(target_os = "linux")]
    native_window_menu(&win);

    let handle = app.clone();
    let label = spec.label.to_string();
    win.on_window_event(move |event| {
        let state = handle.state::<AppState>();
        match event {
            WindowEvent::Moved(p) if !is_wayland() => state.overlays.record(&label, Some((p.x, p.y)), None),
            WindowEvent::Resized(s) if spec.resizable && s.width > 0 => {
                // Store logical size so it restores correctly on other scale factors.
                let scale = handle.get_webview_window(&label).and_then(|w| w.scale_factor().ok()).unwrap_or(1.0);
                let l = s.to_logical::<f64>(scale);
                state.overlays.record(&label, None, Some((l.width.round() as u32, l.height.round() as u32)));
            }
            _ => {}
        }
    });
    Ok(win)
}

/// Right-click opens the window manager's own menu for the overlay. On Wayland apps can't
/// make themselves always-on-top, but the compositor's menu ("Keep Above Others" on KDE)
/// can. Needs the real button event, since the compositor checks its serial. If the WM
/// has no such menu, the click falls through to the webview, which shows tempo's menu.
#[cfg(target_os = "linux")]
fn native_window_menu(win: &WebviewWindow) {
    use gtk::gdk;
    use gtk::glib::Propagation;
    use gtk::prelude::*;
    let result = win.with_webview(|wv| {
        wv.inner().connect_button_press_event(|widget, event| {
            if event.button() != 3 || event.event_type() != gdk::EventType::ButtonPress {
                return Propagation::Proceed;
            }
            let shown = widget
                .toplevel()
                .and_then(|top| top.window())
                .is_some_and(|gw| gw.show_window_menu(&mut (**event).clone()));
            if shown {
                Propagation::Stop
            } else {
                Propagation::Proceed
            }
        });
    });
    if let Err(e) = result {
        log::warn!("could not hook overlay right-click: {e}");
    }
}

pub const MENU_PREFIX: &str = "overlay:";

/// tempo's own right-click menu, used where the window manager has none.
pub fn popup_menu(app: &AppHandle, label: &str) -> AppResult<()> {
    use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
    let spec = spec(label)?;
    let win = app.get_webview_window(label).ok_or_else(|| AppError::NotFound(format!("overlay {label}")))?;
    let prefs = load_prefs(&app.state::<AppState>().db.conn(), label)?;
    let on_top = CheckMenuItem::with_id(app, format!("{MENU_PREFIX}top:{label}"), "Always on top", true, prefs.always_on_top, None::<&str>)?;
    let hide = MenuItem::with_id(app, format!("{MENU_PREFIX}hide:{label}"), format!("Hide {}", spec.title.trim_start_matches("tempo — ")), true, None::<&str>)?;
    let open = MenuItem::with_id(app, format!("{MENU_PREFIX}main:{label}"), "Open tempo", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&on_top, &PredefinedMenuItem::separator(app)?, &open, &hide])?;
    win.popup_menu(&menu)?;
    Ok(())
}

/// Handles clicks from [`popup_menu`]. Returns false for ids that aren't ours.
pub fn handle_menu_event(app: &AppHandle, id: &str) -> bool {
    let Some(rest) = id.strip_prefix(MENU_PREFIX) else { return false };
    let Some((what, label)) = rest.split_once(':') else { return false };
    let result = match what {
        "top" => {
            let current = load_prefs(&app.state::<AppState>().db.conn(), label).map(|p| p.always_on_top).unwrap_or(false);
            update(app, label, OverlayPatch { always_on_top: Some(!current), opacity: None }).map(drop)
        }
        "hide" => set_visible(app, label, false).map(drop),
        "main" => {
            show_main(app);
            Ok(())
        }
        _ => Ok(()),
    };
    if let Err(e) = result {
        log::warn!("overlay menu action failed: {e}");
    }
    true
}

#[tauri::command]
pub fn overlay_context_menu(app: AppHandle, label: String) -> AppResult<()> {
    popup_menu(&app, &label)
}

pub fn set_visible(app: &AppHandle, label: &str, visible: bool) -> AppResult<OverlayPrefs> {
    let spec = spec(label)?;
    let state = app.state::<AppState>();
    let mut prefs = load_prefs(&state.db.conn(), label)?;
    match (app.get_webview_window(label), visible) {
        (Some(w), true) => {
            w.show()?;
            w.set_always_on_top(prefs.always_on_top)?;
        }
        (None, true) => {
            build(app, spec, &prefs)?;
        }
        (Some(w), false) => {
            // Flush the latest geometry before the window goes away.
            state.overlays.flush(&state.db);
            prefs = load_prefs(&state.db.conn(), label)?;
            w.destroy()?;
        }
        (None, false) => {}
    }
    prefs.visible = visible;
    save_prefs(&state.db.conn(), &prefs)?;
    let _ = app.emit(PREFS_EVENT, &prefs);
    Ok(prefs)
}

pub fn toggle(app: &AppHandle, label: &str) -> AppResult<OverlayPrefs> {
    let open = app.get_webview_window(label).is_some_and(|w| w.is_visible().unwrap_or(false));
    set_visible(app, label, !open)
}

pub fn update(app: &AppHandle, label: &str, patch: OverlayPatch) -> AppResult<OverlayPrefs> {
    spec(label)?;
    let state = app.state::<AppState>();
    let mut prefs = load_prefs(&state.db.conn(), label)?;
    if let Some(top) = patch.always_on_top {
        prefs.always_on_top = top;
        if let Some(w) = app.get_webview_window(label) {
            w.set_always_on_top(top)?;
        }
    }
    if let Some(o) = patch.opacity {
        if !(0.3..=1.0).contains(&o) {
            return Err(AppError::invalid("opacity must be between 0.3 and 1"));
        }
        prefs.opacity = o;
    }
    save_prefs(&state.db.conn(), &prefs)?;
    let _ = app.emit(PREFS_EVENT, &prefs);
    Ok(prefs)
}

/// Flip always-on-top for every open overlay together (on if any is currently off).
pub fn toggle_on_top(app: &AppHandle) -> AppResult<()> {
    let state = app.state::<AppState>();
    let open: Vec<_> = OVERLAYS.iter().filter(|s| app.get_webview_window(s.label).is_some()).collect();
    if open.is_empty() {
        return Ok(());
    }
    let all_on = open.iter().all(|s| load_prefs(&state.db.conn(), s.label).map(|p| p.always_on_top).unwrap_or(false));
    for s in open {
        update(app, s.label, OverlayPatch { always_on_top: Some(!all_on), opacity: None })?;
    }
    Ok(())
}

/// Reopen the overlays that were visible when the app last quit.
pub fn restore(app: &AppHandle) {
    for s in OVERLAYS {
        let visible = load_prefs(&app.state::<AppState>().db.conn(), s.label).map(|p| p.visible).unwrap_or(false);
        if visible {
            if let Err(e) = set_visible(app, s.label, true) {
                log::warn!("could not restore {}: {e}", s.label);
            }
        }
    }
}

pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[tauri::command]
pub fn overlays_list(state: State<'_, AppState>) -> AppResult<Vec<OverlayPrefs>> {
    let conn = state.db.conn();
    OVERLAYS.iter().map(|s| load_prefs(&conn, s.label)).collect()
}

#[tauri::command]
pub async fn overlay_set_visible(app: AppHandle, label: String, visible: bool) -> AppResult<OverlayPrefs> {
    set_visible(&app, &label, visible)
}

#[tauri::command]
pub fn overlay_update(app: AppHandle, label: String, patch: OverlayPatch) -> AppResult<OverlayPrefs> {
    update(&app, &label, patch)
}

#[tauri::command]
pub fn overlay_reset_position(app: AppHandle, state: State<'_, AppState>, label: String) -> AppResult<OverlayPrefs> {
    let spec = spec(&label)?;
    let mut prefs = load_prefs(&state.db.conn(), &label)?;
    (prefs.x, prefs.y, prefs.width, prefs.height) = (None, None, None, None);
    save_prefs(&state.db.conn(), &prefs)?;
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.set_size(LogicalSize::new(spec.width, spec.height));
        let _ = w.center();
    }
    Ok(prefs)
}

#[tauri::command]
pub fn session_info() -> serde_json::Value {
    serde_json::json!({
        "platform": std::env::consts::OS,
        "wayland": is_wayland(),
        "desktop": std::env::var("XDG_CURRENT_DESKTOP").unwrap_or_default(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefs_default_and_roundtrip() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn();
        let mut p = load_prefs(&conn, "floating-timer").unwrap();
        assert!(!p.always_on_top, "always-on-top is off by default");
        p.x = Some(10);
        p.opacity = 5.0;
        save_prefs(&conn, &p).unwrap();
        let back = load_prefs(&conn, "floating-timer").unwrap();
        assert_eq!(back.x, Some(10));
        assert_eq!(back.opacity, 1.0, "opacity is clamped");
    }
}
