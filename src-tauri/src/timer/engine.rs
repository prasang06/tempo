//! Pure timer state machine. Every transition takes `now` (wall-clock epoch ms) so the
//! logic is deterministic and testable; the service layer supplies the real clock.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SessionKind {
    Focus,
    ShortBreak,
    LongBreak,
}

impl SessionKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Focus => "focus",
            Self::ShortBreak => "short_break",
            Self::LongBreak => "long_break",
        }
    }

    pub fn is_break(self) -> bool {
        !matches!(self, Self::Focus)
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    Idle,
    Running,
    Paused,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Outcome {
    Completed,
    Skipped,
    Abandoned,
}

impl Outcome {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Completed => "completed",
            Self::Skipped => "skipped",
            Self::Abandoned => "abandoned",
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct TimerConfig {
    pub focus_ms: i64,
    pub short_break_ms: i64,
    pub long_break_ms: i64,
    pub long_break_interval: u32,
    pub auto_start_breaks: bool,
    pub auto_start_focus: bool,
}

impl TimerConfig {
    pub fn duration(&self, kind: SessionKind) -> i64 {
        match kind {
            SessionKind::Focus => self.focus_ms,
            SessionKind::ShortBreak => self.short_break_ms,
            SessionKind::LongBreak => self.long_break_ms,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TimerState {
    pub session_id: Option<String>,
    pub kind: SessionKind,
    pub status: Status,
    pub duration_ms: i64,
    pub started_at: Option<i64>,
    pub target_end: Option<i64>,
    pub paused_at: Option<i64>,
    /// Authoritative while idle or paused. While running, derive from `target_end`.
    pub remaining_ms: i64,
    pub task_id: Option<String>,
    /// Focus sessions completed since the last long break.
    pub cycle: u32,
    pub revision: u64,
}

/// A finished (or cut-short) session that should be written to history.
#[derive(Debug, Clone, PartialEq)]
pub struct SessionRecord {
    pub id: String,
    pub kind: SessionKind,
    pub task_id: Option<String>,
    pub started_at: i64,
    pub ended_at: i64,
    pub planned_ms: i64,
    pub actual_ms: i64,
    pub outcome: Outcome,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TimerError {
    InvalidTransition(&'static str),
}

impl std::fmt::Display for TimerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidTransition(m) => write!(f, "{m}"),
        }
    }
}

pub type Transition = Result<Option<SessionRecord>, TimerError>;

/// Sessions cut short before this much time has run are not recorded.
pub const MIN_RECORDED_MS: i64 = 60_000;

impl TimerState {
    pub fn new(config: &TimerConfig) -> Self {
        let duration_ms = config.duration(SessionKind::Focus);
        Self {
            session_id: None,
            kind: SessionKind::Focus,
            status: Status::Idle,
            duration_ms,
            started_at: None,
            target_end: None,
            paused_at: None,
            remaining_ms: duration_ms,
            task_id: None,
            cycle: 0,
            revision: 0,
        }
    }

    pub fn remaining_at(&self, now: i64) -> i64 {
        match (self.status, self.target_end) {
            (Status::Running, Some(end)) => (end - now).max(0),
            _ => self.remaining_ms,
        }
    }

    fn bump(&mut self) {
        self.revision += 1;
    }

    /// Start the idle session. `id` is supplied by the caller so tests can be deterministic.
    pub fn start(&mut self, now: i64, id: String) -> Transition {
        if self.status != Status::Idle {
            return Err(TimerError::InvalidTransition("timer is already active"));
        }
        self.session_id = Some(id);
        self.status = Status::Running;
        self.started_at = Some(now);
        self.target_end = Some(now + self.remaining_ms);
        self.paused_at = None;
        self.bump();
        Ok(None)
    }

    pub fn pause(&mut self, now: i64) -> Transition {
        if self.status != Status::Running {
            return Err(TimerError::InvalidTransition("timer is not running"));
        }
        self.remaining_ms = self.remaining_at(now);
        self.status = Status::Paused;
        self.target_end = None;
        self.paused_at = Some(now);
        self.bump();
        Ok(None)
    }

    pub fn resume(&mut self, now: i64) -> Transition {
        if self.status != Status::Paused {
            return Err(TimerError::InvalidTransition("timer is not paused"));
        }
        self.status = Status::Running;
        self.target_end = Some(now + self.remaining_ms);
        self.paused_at = None;
        self.bump();
        Ok(None)
    }

    /// Stop the current session and restore its full duration. Records the time spent.
    pub fn reset(&mut self, now: i64, config: &TimerConfig) -> Transition {
        let record = self.cut_short(now, Outcome::Abandoned);
        self.to_idle(self.kind, config);
        Ok(record)
    }

    /// Abandon the current session and move to the next one in the cycle (idle).
    pub fn skip(&mut self, now: i64, config: &TimerConfig) -> Transition {
        let record = self.cut_short(now, Outcome::Skipped);
        let next = self.next_kind(config, false);
        if self.kind == SessionKind::LongBreak {
            self.cycle = 0;
        }
        self.to_idle(next, config);
        Ok(record)
    }

    /// Switch to a different session type. Only allowed while idle.
    pub fn select_kind(&mut self, kind: SessionKind, config: &TimerConfig) -> Transition {
        if self.status != Status::Idle {
            return Err(TimerError::InvalidTransition("stop the timer before switching session type"));
        }
        self.to_idle(kind, config);
        Ok(None)
    }

    pub fn set_task(&mut self, task_id: Option<String>) {
        if self.task_id != task_id {
            self.task_id = task_id;
            self.bump();
        }
    }

    /// Settings changed: an idle timer adopts the new duration; an active one keeps its own.
    pub fn apply_config(&mut self, config: &TimerConfig) {
        if self.status == Status::Idle {
            let d = config.duration(self.kind);
            if d != self.duration_ms || d != self.remaining_ms {
                self.duration_ms = d;
                self.remaining_ms = d;
                self.bump();
            }
        }
    }

    /// Advance time. Completes the session if its end has passed (including while the
    /// machine was asleep or the app was closed) and moves to the next session.
    /// `next_id` is only used if the next session auto-starts.
    pub fn tick(&mut self, now: i64, config: &TimerConfig, next_id: impl FnOnce() -> String) -> Option<SessionRecord> {
        let end = match (self.status, self.target_end) {
            (Status::Running, Some(end)) if now >= end => end,
            _ => return None,
        };
        let record = SessionRecord {
            id: self.session_id.clone().unwrap_or_default(),
            kind: self.kind,
            task_id: self.task_id.clone(),
            started_at: self.started_at.unwrap_or(end - self.duration_ms),
            ended_at: end,
            planned_ms: self.duration_ms,
            actual_ms: self.duration_ms,
            outcome: Outcome::Completed,
        };

        let finished = self.kind;
        let next = self.next_kind(config, true);
        match finished {
            SessionKind::Focus => self.cycle += 1,
            SessionKind::LongBreak => self.cycle = 0,
            SessionKind::ShortBreak => {}
        }
        self.to_idle(next, config);

        let auto = if next.is_break() { config.auto_start_breaks } else { config.auto_start_focus };
        if auto {
            // Starts from `now`, not from the old end, so waking from suspend doesn't
            // replay a chain of sessions that never happened.
            let _ = self.start(now, next_id());
        }
        Some(record)
    }

    /// The kind that follows the current one. `completing` is true when the current focus
    /// session counts toward the long-break cycle.
    fn next_kind(&self, config: &TimerConfig, completing: bool) -> SessionKind {
        match self.kind {
            SessionKind::Focus => {
                let done = self.cycle + u32::from(completing);
                if completing && done > 0 && done % config.long_break_interval.max(1) == 0 {
                    SessionKind::LongBreak
                } else {
                    SessionKind::ShortBreak
                }
            }
            SessionKind::ShortBreak | SessionKind::LongBreak => SessionKind::Focus,
        }
    }

    fn cut_short(&self, now: i64, outcome: Outcome) -> Option<SessionRecord> {
        let (id, started_at) = match (&self.session_id, self.started_at) {
            (Some(id), Some(s)) if self.status != Status::Idle => (id.clone(), s),
            _ => return None,
        };
        let actual = (self.duration_ms - self.remaining_at(now)).max(0);
        // A start that's undone within a minute is a misclick, not history.
        if actual < MIN_RECORDED_MS {
            return None;
        }
        Some(SessionRecord {
            id,
            kind: self.kind,
            task_id: self.task_id.clone(),
            started_at,
            ended_at: now,
            planned_ms: self.duration_ms,
            actual_ms: actual,
            outcome,
        })
    }

    fn to_idle(&mut self, kind: SessionKind, config: &TimerConfig) {
        let d = config.duration(kind);
        self.session_id = None;
        self.kind = kind;
        self.status = Status::Idle;
        self.duration_ms = d;
        self.remaining_ms = d;
        self.started_at = None;
        self.target_end = None;
        self.paused_at = None;
        self.bump();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MIN: i64 = 60_000;

    fn cfg() -> TimerConfig {
        TimerConfig {
            focus_ms: 25 * MIN,
            short_break_ms: 5 * MIN,
            long_break_ms: 15 * MIN,
            long_break_interval: 4,
            auto_start_breaks: false,
            auto_start_focus: false,
        }
    }

    fn id(n: u32) -> String {
        format!("s{n}")
    }

    #[test]
    fn remaining_is_derived_from_timestamps() {
        let c = cfg();
        let mut t = TimerState::new(&c);
        t.start(1_000, id(1)).unwrap();
        assert_eq!(t.remaining_at(1_000), 25 * MIN);
        assert_eq!(t.remaining_at(1_000 + 10 * MIN), 15 * MIN);
        assert_eq!(t.remaining_at(1_000 + 99 * MIN), 0);
    }

    #[test]
    fn pause_freezes_and_resume_shifts_end() {
        let c = cfg();
        let mut t = TimerState::new(&c);
        t.start(0, id(1)).unwrap();
        t.pause(10 * MIN).unwrap();
        assert_eq!(t.remaining_at(10 * MIN), 15 * MIN);
        assert_eq!(t.remaining_at(500 * MIN), 15 * MIN, "paused time must not elapse");
        t.resume(20 * MIN).unwrap();
        assert_eq!(t.target_end, Some(35 * MIN));
        assert!(t.tick(34 * MIN, &c, || id(2)).is_none());
        let rec = t.tick(35 * MIN, &c, || id(2)).unwrap();
        assert_eq!(rec.outcome, Outcome::Completed);
        assert_eq!(rec.actual_ms, 25 * MIN);
        assert_eq!(rec.ended_at, 35 * MIN);
    }

    #[test]
    fn invalid_transitions_are_rejected_without_changes() {
        let c = cfg();
        let mut t = TimerState::new(&c);
        let before = t.clone();
        assert!(t.pause(0).is_err());
        assert!(t.resume(0).is_err());
        assert_eq!(t, before);
        t.start(0, id(1)).unwrap();
        assert!(t.start(1, id(2)).is_err());
        assert!(t.select_kind(SessionKind::ShortBreak, &c).is_err());
        assert_eq!(t.session_id.as_deref(), Some("s1"));
    }

    #[test]
    fn cycle_reaches_long_break_after_interval() {
        let c = cfg();
        let mut t = TimerState::new(&c);
        let mut now = 0;
        let mut kinds = vec![];
        for n in 0..9 {
            t.start(now, id(n)).unwrap();
            now = t.target_end.unwrap();
            t.tick(now, &c, || unreachable!()).unwrap();
            kinds.push(t.kind);
        }
        use SessionKind::*;
        assert_eq!(kinds, vec![ShortBreak, Focus, ShortBreak, Focus, ShortBreak, Focus, LongBreak, Focus, ShortBreak]);
        assert_eq!(t.cycle, 1, "long break resets the cycle");
    }

    #[test]
    fn auto_start_begins_from_now_after_sleep() {
        let mut c = cfg();
        c.auto_start_breaks = true;
        let mut t = TimerState::new(&c);
        t.start(0, id(1)).unwrap();
        // Machine slept for two hours, far past the end.
        let wake = 120 * MIN;
        let rec = t.tick(wake, &c, || id(2)).unwrap();
        assert_eq!(rec.ended_at, 25 * MIN, "session ends at its target, not at wake time");
        assert_eq!(t.kind, SessionKind::ShortBreak);
        assert_eq!(t.status, Status::Running);
        assert_eq!(t.target_end, Some(wake + 5 * MIN));
        // auto_start_focus is off: the break completes and stops.
        t.tick(wake + 5 * MIN, &c, || unreachable!()).unwrap();
        assert_eq!((t.kind, t.status), (SessionKind::Focus, Status::Idle));
    }

    #[test]
    fn reset_records_partial_focus_and_restores_duration() {
        let c = cfg();
        let mut t = TimerState::new(&c);
        t.set_task(Some("task".into()));
        t.start(0, id(1)).unwrap();
        let rec = t.reset(7 * MIN, &c).unwrap().unwrap();
        assert_eq!(rec.outcome, Outcome::Abandoned);
        assert_eq!(rec.actual_ms, 7 * MIN);
        assert_eq!(rec.task_id.as_deref(), Some("task"));
        assert_eq!((t.status, t.remaining_ms, t.kind), (Status::Idle, 25 * MIN, SessionKind::Focus));
        assert_eq!(t.task_id.as_deref(), Some("task"), "task link survives a reset");
        assert!(t.reset(8 * MIN, &c).unwrap().is_none(), "resetting idle records nothing");
    }

    #[test]
    fn misclick_starts_are_not_recorded() {
        let c = cfg();
        let mut t = TimerState::new(&c);
        t.start(0, id(1)).unwrap();
        assert!(t.reset(MIN_RECORDED_MS - 1, &c).unwrap().is_none());
        assert_eq!(t.status, Status::Idle);
    }

    #[test]
    fn skip_moves_on_without_counting_focus() {
        let c = cfg();
        let mut t = TimerState::new(&c);
        t.start(0, id(1)).unwrap();
        t.pause(3 * MIN).unwrap();
        let rec = t.skip(9 * MIN, &c).unwrap().unwrap();
        assert_eq!(rec.outcome, Outcome::Skipped);
        assert_eq!(rec.actual_ms, 3 * MIN, "paused time is not focus time");
        assert_eq!((t.kind, t.cycle), (SessionKind::ShortBreak, 0));
        // Skipping an idle break just moves to focus.
        assert!(t.skip(10 * MIN, &c).unwrap().is_none());
        assert_eq!(t.kind, SessionKind::Focus);
    }

    #[test]
    fn config_change_only_affects_idle_timer() {
        let mut c = cfg();
        let mut t = TimerState::new(&c);
        c.focus_ms = 50 * MIN;
        t.apply_config(&c);
        assert_eq!(t.remaining_ms, 50 * MIN);
        t.start(0, id(1)).unwrap();
        c.focus_ms = 10 * MIN;
        t.apply_config(&c);
        assert_eq!(t.remaining_at(0), 50 * MIN);
    }

    #[test]
    fn revision_increases_on_every_change() {
        let c = cfg();
        let mut t = TimerState::new(&c);
        let mut last = t.revision;
        let mut check = |t: &TimerState| {
            assert!(t.revision > last);
            last = t.revision;
        };
        t.start(0, id(1)).unwrap();
        check(&t);
        t.pause(1).unwrap();
        check(&t);
        t.resume(2).unwrap();
        check(&t);
        t.set_task(Some("x".into()));
        check(&t);
        t.reset(3, &c).unwrap();
        check(&t);
    }

    #[test]
    fn state_survives_serialization() {
        let c = cfg();
        let mut t = TimerState::new(&c);
        t.start(42, id(1)).unwrap();
        let json = serde_json::to_string(&t).unwrap();
        let back: TimerState = serde_json::from_str(&json).unwrap();
        assert_eq!(back, t);
    }
}
