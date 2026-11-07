mod actions;
mod backup;
mod claude;
mod database;
mod error;
mod notifications;
mod settings;
mod settings_cmd;
mod shortcuts;
mod stats;
mod tasks;
mod timer;
mod tray;
mod windows;

use std::sync::{Arc, Mutex};

use tauri::{Manager, WindowEvent};

use actions::Action;
use database::Db;
use settings::Settings;
use shortcuts::ShortcutStatus;
use timer::service::TimerService;
use windows::OverlayManager;

pub struct AppState {
    pub db: Arc<Db>,
    pub timer: TimerService,
    pub overlays: OverlayManager,
    pub settings: Mutex<Settings>,
    pub shortcut_status: Mutex<Vec<ShortcutStatus>>,
    pub tray: Mutex<Option<tray::TrayMenu>>,
    pub claude: claude::Activity,
}

impl AppState {
    pub fn settings(&self) -> Settings {
        self.settings.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }
}

const HIDDEN_FLAG: &str = "--hidden";

/// Runs as a Claude Code hook instead of the app when called with `--claude-hook`.
pub fn run_claude_hook(args: &[String]) -> Option<i32> {
    let i = args.iter().position(|a| a == claude::HOOK_FLAG)?;
    Some(claude::run_hook(args.get(i + 1).map(String::as_str)))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be first: a second launch forwards its argv here and exits, so there is
        // only ever one process and one timer.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(action) = Action::from_args(&argv) {
                actions::dispatch(app, action);
            } else if let Some(page) = actions::page_from_args(&argv) {
                actions::open_page(app, page);
            } else {
                windows::show_main(app);
            }
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::Builder::new().arg(HIDDEN_FLAG).build())
        .on_menu_event(|app, event| {
            windows::handle_menu_event(app, event.id().as_ref());
        })
        .setup(|app| {
            let handle = app.handle().clone();
            let db_path = app.path().app_data_dir()?.join("tempo.db");
            let db = Arc::new(Db::open(&db_path)?);
            let settings = settings::load(&db.conn())?;
            let timer = TimerService::load(db.clone(), settings.timer.to_config())?;
            log::info!("database at {}", db_path.display());

            app.manage(AppState {
                db,
                timer,
                overlays: OverlayManager::default(),
                settings: Mutex::new(settings.clone()),
                shortcut_status: Mutex::new(Vec::new()),
                tray: Mutex::new(None),
                claude: claude::Activity::default(),
            });
            let state = app.state::<AppState>();

            match tray::create(&handle, &state.timer.snapshot()) {
                Ok(menu) => *state.tray.lock().unwrap_or_else(|e| e.into_inner()) = Some(menu),
                // Some desktops (stock GNOME) have no tray; the app still works without it.
                Err(e) => log::warn!("system tray unavailable: {e}"),
            }
            *state.shortcut_status.lock().unwrap_or_else(|e| e.into_inner()) =
                shortcuts::register_all(&handle, &settings.shortcuts);
            if let Err(e) = settings_cmd::sync_autostart(&handle, settings.system.autostart) {
                log::warn!("{e}");
            }

            timer::spawn_ticker(handle.clone());
            windows::restore(&handle);
            if let Err(e) = claude::spawn_listener(handle.clone()) {
                log::warn!("claude code activity unavailable: {e}");
            }

            let args: Vec<String> = std::env::args().collect();
            let hidden = settings.system.start_hidden || args.iter().any(|a| a == HIDDEN_FLAG);
            if let Some(main) = app.get_webview_window("main") {
                let h = handle.clone();
                main.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        let state = h.state::<AppState>();
                        // Without a tray there would be no way back, so really close then.
                        let has_tray = state.tray.lock().map(|t| t.is_some()).unwrap_or(false);
                        if state.settings().system.close_to_tray && has_tray {
                            api.prevent_close();
                            if let Some(w) = h.get_webview_window("main") {
                                let _ = w.hide();
                            }
                        }
                    }
                });
                if !hidden {
                    main.show()?;
                }
                if let Some(page) = actions::page_from_args(&args) {
                    // The webview isn't listening yet at startup; it reads this query instead.
                    let url = main.url()?;
                    let mut url = url.clone();
                    url.set_query(Some(&format!("page={page}")));
                    main.navigate(url)?;
                }
            }
            if let Some(action) = Action::from_args(&args) {
                actions::dispatch(&handle, action);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            timer::timer_get,
            timer::timer_start,
            timer::timer_pause,
            timer::timer_resume,
            timer::timer_toggle,
            timer::timer_reset,
            timer::timer_skip,
            timer::timer_select_kind,
            timer::timer_set_task,
            tasks::tasks_list,
            tasks::tasks_create,
            tasks::tasks_update,
            tasks::tasks_set_completed,
            tasks::tasks_delete,
            tasks::tasks_reorder,
            tasks::projects_list,
            tasks::projects_create,
            tasks::projects_update,
            tasks::projects_delete,
            stats::sessions_list,
            stats::sessions_delete,
            stats::tasks_actuals,
            settings_cmd::settings_get,
            settings_cmd::settings_update,
            settings_cmd::shortcuts_status,
            settings_cmd::app_quit,
            windows::overlays_list,
            windows::overlay_set_visible,
            windows::overlay_update,
            windows::overlay_reset_position,
            windows::overlay_context_menu,
            windows::session_info,
            notifications::notifications_test,
            backup::data_export,
            backup::data_import,
            claude::claude_activity,
            claude::claude_hooks_status,
            claude::claude_hooks_install,
            claude::claude_hooks_remove,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tempo");
}
