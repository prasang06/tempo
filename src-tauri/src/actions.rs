//! Things the user can trigger from outside the main window: global shortcuts, the tray
//! menu, and CLI flags forwarded to the running instance (the Wayland-friendly route).

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::AppState;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Action {
    ToggleFloating,
    QuickTasks,
    MiniSession,
    PauseResume,
    NewFocus,
    ToggleOnTop,
    OpenMain,
}

impl Action {
    pub const ALL: [Action; 7] = [
        Action::ToggleFloating,
        Action::QuickTasks,
        Action::MiniSession,
        Action::PauseResume,
        Action::NewFocus,
        Action::ToggleOnTop,
        Action::OpenMain,
    ];

    pub fn name(self) -> &'static str {
        match self {
            Action::ToggleFloating => "toggle-floating",
            Action::QuickTasks => "quick-tasks",
            Action::MiniSession => "mini-session",
            Action::PauseResume => "pause-resume",
            Action::NewFocus => "new-focus",
            Action::ToggleOnTop => "toggle-on-top",
            Action::OpenMain => "open-main",
        }
    }

    pub fn parse(s: &str) -> Option<Action> {
        Self::ALL.into_iter().find(|a| a.name() == s)
    }

    /// Reads `--action <name>` (or `--action=<name>`) from argv.
    pub fn from_args<S: AsRef<str>>(args: &[S]) -> Option<Action> {
        let mut it = args.iter().map(AsRef::as_ref);
        while let Some(a) = it.next() {
            if a == "--action" {
                return it.next().and_then(Self::parse);
            }
            if let Some(v) = a.strip_prefix("--action=") {
                return Self::parse(v);
            }
        }
        None
    }
}

pub fn dispatch(app: &AppHandle, action: Action) {
    let state = app.state::<AppState>();
    let result = match action {
        Action::ToggleFloating => crate::windows::toggle(app, "floating-timer").map(drop),
        Action::QuickTasks => crate::windows::toggle(app, "quick-tasks").map(drop),
        Action::MiniSession => crate::windows::toggle(app, "mini-session").map(drop),
        Action::PauseResume => crate::timer::toggle(app, &state).map(drop),
        Action::NewFocus => crate::timer::start_focus(app, &state).map(drop),
        Action::ToggleOnTop => crate::windows::toggle_on_top(app),
        Action::OpenMain => {
            crate::windows::show_main(app);
            Ok(())
        }
    };
    if let Err(e) = result {
        log::warn!("action {} failed: {e}", action.name());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_cli_actions() {
        assert_eq!(Action::from_args(&["tempo", "--action", "pause-resume"]), Some(Action::PauseResume));
        assert_eq!(Action::from_args(&["tempo", "--action=toggle-floating"]), Some(Action::ToggleFloating));
        assert_eq!(Action::from_args(&["tempo", "--action", "nope"]), None);
        assert_eq!(Action::from_args(&["tempo"]), None);
    }
}
