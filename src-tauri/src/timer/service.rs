use std::sync::{Arc, Mutex};

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

use super::engine::{SessionRecord, TimerConfig, TimerState, Transition};
use crate::database::{new_id, now_ms, Db};
use crate::error::{AppError, AppResult};

/// What windows receive. `remaining_ms` is computed at `now_ms`; while running, windows
/// render `target_end - Date.now()` themselves and only use this as a fallback.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimerSnapshot {
    #[serde(flatten)]
    pub state: TimerState,
    pub remaining_ms: i64,
    pub now_ms: i64,
    pub task_title: Option<String>,
}

pub struct TimerService {
    db: Arc<Db>,
    inner: Mutex<Inner>,
}

struct Inner {
    state: TimerState,
    config: TimerConfig,
}

impl TimerService {
    pub fn load(db: Arc<Db>, config: TimerConfig) -> AppResult<Self> {
        let state = {
            let conn = db.conn();
            let mut state = load_state(&conn)?.unwrap_or_else(|| TimerState::new(&config));
            state.apply_config(&config);
            save_state(&conn, &state)?;
            state
        };
        Ok(Self { db, inner: Mutex::new(Inner { state, config }) })
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn snapshot(&self) -> TimerSnapshot {
        let inner = self.lock();
        self.make_snapshot(&inner.state, now_ms())
    }

    pub fn state(&self) -> TimerState {
        self.lock().state.clone()
    }

    /// Run a transition atomically: it is applied to a copy, persisted (session record
    /// and new state in one SQLite transaction), and only then becomes the live state.
    /// A failed transition or failed write leaves everything untouched.
    pub fn apply(
        &self,
        f: impl FnOnce(&mut TimerState, &TimerConfig, i64) -> Transition,
    ) -> AppResult<(TimerSnapshot, Option<SessionRecord>)> {
        let mut inner = self.lock();
        let now = now_ms();
        let mut next = inner.state.clone();
        let record = f(&mut next, &inner.config, now).map_err(|e| AppError::invalid(e.to_string()))?;
        self.commit(&next, record.as_ref())?;
        inner.state = next;
        Ok((self.make_snapshot(&inner.state, now), record))
    }

    /// Called by the ticker. Returns a snapshot and the completed session, if any.
    pub fn tick(&self) -> AppResult<Option<(TimerSnapshot, SessionRecord)>> {
        let mut inner = self.lock();
        let now = now_ms();
        let mut next = inner.state.clone();
        let Some(record) = next.tick(now, &inner.config, new_id) else {
            return Ok(None);
        };
        self.commit(&next, Some(&record))?;
        inner.state = next;
        Ok(Some((self.make_snapshot(&inner.state, now), record)))
    }

    pub fn set_config(&self, config: TimerConfig) -> AppResult<TimerSnapshot> {
        let mut inner = self.lock();
        let mut next = inner.state.clone();
        next.apply_config(&config);
        self.commit(&next, None)?;
        inner.state = next;
        inner.config = config;
        Ok(self.make_snapshot(&inner.state, now_ms()))
    }

    pub fn config(&self) -> TimerConfig {
        self.lock().config.clone()
    }

    fn commit(&self, state: &TimerState, record: Option<&SessionRecord>) -> AppResult<()> {
        let mut conn = self.db.conn();
        let tx = conn.transaction()?;
        if let Some(r) = record {
            insert_session(&tx, r)?;
        }
        save_state(&tx, state)?;
        tx.commit()?;
        Ok(())
    }

    fn make_snapshot(&self, state: &TimerState, now: i64) -> TimerSnapshot {
        let task_title = state.task_id.as_ref().and_then(|id| {
            self.db
                .conn()
                .query_row("SELECT title FROM tasks WHERE id = ?1", [id], |r| r.get(0))
                .optional()
                .unwrap_or(None)
        });
        TimerSnapshot { state: state.clone(), remaining_ms: state.remaining_at(now), now_ms: now, task_title }
    }
}

pub fn load_state(conn: &Connection) -> AppResult<Option<TimerState>> {
    let raw: Option<String> =
        conn.query_row("SELECT state FROM timer_state WHERE id = 1", [], |r| r.get(0)).optional()?;
    Ok(match raw {
        Some(raw) => match serde_json::from_str(&raw) {
            Ok(s) => Some(s),
            Err(e) => {
                log::warn!("discarding unreadable timer state: {e}");
                None
            }
        },
        None => None,
    })
}

pub fn save_state(conn: &Connection, state: &TimerState) -> AppResult<()> {
    conn.execute(
        "INSERT INTO timer_state (id, state) VALUES (1, ?1)
         ON CONFLICT(id) DO UPDATE SET state = excluded.state",
        [serde_json::to_string(state)?],
    )?;
    Ok(())
}

pub fn insert_session(conn: &Connection, r: &SessionRecord) -> AppResult<()> {
    // The linked task may have been deleted while the session ran; drop the link then.
    conn.execute(
        "INSERT OR REPLACE INTO sessions
            (id, kind, task_id, started_at, ended_at, planned_ms, actual_ms, outcome)
         VALUES (?1, ?2, (SELECT id FROM tasks WHERE id = ?3), ?4, ?5, ?6, ?7, ?8)",
        params![r.id, r.kind.as_str(), r.task_id, r.started_at, r.ended_at, r.planned_ms, r.actual_ms, r.outcome.as_str()],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::timer::engine::{SessionKind, Status};

    fn cfg() -> TimerConfig {
        TimerConfig {
            focus_ms: 1_000,
            short_break_ms: 500,
            long_break_ms: 800,
            long_break_interval: 4,
            auto_start_breaks: false,
            auto_start_focus: false,
        }
    }

    #[test]
    fn state_persists_across_restart() {
        let db = Arc::new(Db::open_in_memory().unwrap());
        let svc = TimerService::load(db.clone(), cfg()).unwrap();
        svc.apply(|s, _, now| s.start(now, "abc".into())).unwrap();
        let before = svc.state();
        drop(svc);

        let svc = TimerService::load(db, cfg()).unwrap();
        let after = svc.state();
        assert_eq!(after, before);
        assert_eq!(after.status, Status::Running);
    }

    #[test]
    fn restart_after_end_completes_and_records_session() {
        let db = Arc::new(Db::open_in_memory().unwrap());
        {
            let conn = db.conn();
            let mut s = TimerState::new(&cfg());
            s.start(now_ms() - 10_000, "old".into()).unwrap();
            save_state(&conn, &s).unwrap();
        }
        let svc = TimerService::load(db.clone(), cfg()).unwrap();
        let (snap, rec) = svc.tick().unwrap().expect("overdue session completes on first tick");
        assert_eq!(rec.id, "old");
        assert_eq!(snap.state.kind, SessionKind::ShortBreak);
        let n: i64 = db.conn().query_row("SELECT count(*) FROM sessions WHERE outcome = 'completed'", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 1);
        assert!(svc.tick().unwrap().is_none());
    }

    #[test]
    fn failed_transition_leaves_state_untouched() {
        let db = Arc::new(Db::open_in_memory().unwrap());
        let svc = TimerService::load(db, cfg()).unwrap();
        let before = svc.state();
        assert!(svc.apply(|s, _, now| s.pause(now)).is_err());
        assert_eq!(svc.state(), before);
    }

    #[test]
    fn session_for_deleted_task_is_still_recorded() {
        let db = Arc::new(Db::open_in_memory().unwrap());
        let config = TimerConfig { focus_ms: 600_000, ..cfg() };
        let svc = TimerService::load(db.clone(), config).unwrap();
        svc.apply(|s, _, _| {
            s.set_task(Some("missing".into()));
            Ok(None)
        })
        .unwrap();
        svc.apply(|s, _, now| s.start(now - 300_000, "x".into())).unwrap();
        let (_, rec) = svc.apply(|s, c, now| s.reset(now, c)).unwrap();
        assert!(rec.is_some());
        let task: Option<String> =
            db.conn().query_row("SELECT task_id FROM sessions WHERE id = 'x'", [], |r| r.get(0)).unwrap();
        assert_eq!(task, None);
    }
}
