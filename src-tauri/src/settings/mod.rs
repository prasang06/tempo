use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::timer::engine::TimerConfig;

const KEY: &str = "app";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub appearance: Appearance,
    pub timer: TimerSettings,
    pub notifications: Notifications,
    pub shortcuts: Shortcuts,
    pub system: System,
    pub claude: ClaudeSettings,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            appearance: Appearance::default(),
            timer: TimerSettings::default(),
            notifications: Notifications::default(),
            shortcuts: Shortcuts::default(),
            system: System::default(),
            claude: ClaudeSettings::default(),
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    #[default]
    Dark,
    Light,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Appearance {
    pub theme: Theme,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum Profile {
    #[default]
    Classic,
    Deep,
    Extended,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct TimerSettings {
    pub profile: Profile,
    /// Durations used when `profile == Custom`.
    pub focus_min: u32,
    pub short_break_min: u32,
    pub long_break_min: u32,
    pub long_break_interval: u32,
    pub auto_start_breaks: bool,
    pub auto_start_focus: bool,
    pub daily_goal_min: u32,
}

impl Default for TimerSettings {
    fn default() -> Self {
        Self {
            profile: Profile::Classic,
            focus_min: 25,
            short_break_min: 5,
            long_break_min: 15,
            long_break_interval: 4,
            auto_start_breaks: false,
            auto_start_focus: false,
            daily_goal_min: 240,
        }
    }
}

impl TimerSettings {
    /// (focus, short break, long break) in minutes for the active profile.
    pub fn durations(&self) -> (u32, u32, u32) {
        match self.profile {
            Profile::Classic => (25, 5, 15),
            Profile::Deep => (50, 10, 20),
            Profile::Extended => (90, 15, 30),
            Profile::Custom => (self.focus_min, self.short_break_min, self.long_break_min),
        }
    }

    pub fn to_config(&self) -> TimerConfig {
        let (f, s, l) = self.durations();
        let min = |m: u32| i64::from(m) * 60_000;
        TimerConfig {
            focus_ms: min(f),
            short_break_ms: min(s),
            long_break_ms: min(l),
            long_break_interval: self.long_break_interval.max(1),
            auto_start_breaks: self.auto_start_breaks,
            auto_start_focus: self.auto_start_focus,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Notifications {
    pub enabled: bool,
    pub sound: bool,
    /// Platform sound name; see [`DEFAULT_SOUND`].
    pub sound_name: String,
}

/// Linux takes a freedesktop sound-theme name; Windows takes a toast sound
/// (Default, IM, Mail, Reminder, SMS) and silently ignores anything else.
pub const DEFAULT_SOUND: &str = if cfg!(windows) { "Reminder" } else { "complete" };

impl Default for Notifications {
    fn default() -> Self {
        Self { enabled: true, sound: true, sound_name: DEFAULT_SOUND.into() }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Shortcuts {
    pub enabled: bool,
    pub toggle_floating: String,
    pub quick_tasks: String,
    pub pause_resume: String,
    pub new_focus: String,
    pub toggle_on_top: String,
    pub open_main: String,
}

impl Default for Shortcuts {
    fn default() -> Self {
        Self {
            enabled: true,
            toggle_floating: "Ctrl+Alt+T".into(),
            quick_tasks: "Ctrl+Alt+Q".into(),
            pause_resume: "Ctrl+Alt+P".into(),
            new_focus: "Ctrl+Alt+N".into(),
            toggle_on_top: "Ctrl+Alt+O".into(),
            open_main: "Ctrl+Shift+Space".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct System {
    pub autostart: bool,
    pub close_to_tray: bool,
    pub start_hidden: bool,
}

impl Default for System {
    fn default() -> Self {
        Self { autostart: false, close_to_tray: true, start_hidden: false }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct ClaudeSettings {
    /// Notify when a Claude Code session needs an answer or finishes a long turn.
    pub notify: bool,
    /// Start a focus session when a prompt is sent and the timer is idle.
    pub auto_focus: bool,
}

impl Default for ClaudeSettings {
    fn default() -> Self {
        Self { notify: true, auto_focus: false }
    }
}

impl Settings {
    pub fn validate(&self) -> AppResult<()> {
        let t = &self.timer;
        let in_range = |v: u32, lo: u32, hi: u32| (lo..=hi).contains(&v);
        if !in_range(t.focus_min, 1, 240) || !in_range(t.short_break_min, 1, 120) || !in_range(t.long_break_min, 1, 120) {
            return Err(AppError::invalid("durations must be between 1 and 240 minutes"));
        }
        if !in_range(t.long_break_interval, 1, 12) {
            return Err(AppError::invalid("long break interval must be between 1 and 12"));
        }
        if !in_range(t.daily_goal_min, 0, 24 * 60) {
            return Err(AppError::invalid("daily goal must be under 24 hours"));
        }
        Ok(())
    }
}

pub fn load(conn: &Connection) -> AppResult<Settings> {
    let raw: Option<String> = conn
        .query_row("SELECT value FROM settings WHERE key = ?1", [KEY], |r| r.get(0))
        .optional()?;
    match raw {
        // Unknown or missing fields fall back to defaults, so old files keep loading.
        Some(raw) => Ok(serde_json::from_str(&raw).unwrap_or_else(|e| {
            log::warn!("settings unreadable, using defaults: {e}");
            Settings::default()
        })),
        None => Ok(Settings::default()),
    }
}

pub fn save(conn: &Connection, settings: &Settings) -> AppResult<()> {
    settings.validate()?;
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![KEY, serde_json::to_string(settings)?],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::Db;

    #[test]
    fn roundtrip_and_partial_json() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn();
        assert_eq!(load(&conn).unwrap(), Settings::default());

        let mut s = Settings::default();
        s.timer.profile = Profile::Deep;
        save(&conn, &s).unwrap();
        assert_eq!(load(&conn).unwrap().timer.to_config().focus_ms, 50 * 60_000);

        conn.execute("UPDATE settings SET value = '{\"timer\":{\"focusMin\":42}}'", []).unwrap();
        let s = load(&conn).unwrap();
        assert_eq!(s.timer.focus_min, 42);
        assert!(s.notifications.enabled);
    }

    #[test]
    fn custom_profile_uses_custom_durations() {
        let mut t = TimerSettings { focus_min: 40, short_break_min: 7, long_break_min: 25, ..Default::default() };
        assert_eq!(t.to_config().focus_ms, 25 * 60_000, "presets ignore custom fields");
        t.profile = Profile::Custom;
        let c = t.to_config();
        assert_eq!((c.focus_ms, c.short_break_ms, c.long_break_ms), (40 * 60_000, 7 * 60_000, 25 * 60_000));
    }

    #[test]
    fn rejects_bad_durations() {
        let mut s = Settings::default();
        s.timer.focus_min = 0;
        assert!(s.validate().is_err());
    }
}
