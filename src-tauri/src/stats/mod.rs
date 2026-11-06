use rusqlite::{params, Connection};
use serde::Serialize;
use tauri::State;

use crate::error::AppResult;
use crate::AppState;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionRow {
    pub id: String,
    pub kind: String,
    pub task_id: Option<String>,
    pub task_title: Option<String>,
    pub project_id: Option<String>,
    pub started_at: i64,
    pub ended_at: i64,
    pub planned_ms: i64,
    pub actual_ms: i64,
    pub outcome: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskActual {
    pub task_id: String,
    pub focus_ms: i64,
    pub sessions: i64,
}

pub fn sessions_between(conn: &Connection, from: i64, to: i64) -> AppResult<Vec<SessionRow>> {
    let mut stmt = conn.prepare(
        "SELECT s.id, s.kind, s.task_id, t.title, t.project_id, s.started_at, s.ended_at,
                s.planned_ms, s.actual_ms, s.outcome
         FROM sessions s LEFT JOIN tasks t ON t.id = s.task_id
         WHERE s.ended_at >= ?1 AND s.started_at < ?2
         ORDER BY s.started_at DESC",
    )?;
    let rows = stmt
        .query_map(params![from, to], |r| {
            Ok(SessionRow {
                id: r.get(0)?,
                kind: r.get(1)?,
                task_id: r.get(2)?,
                task_title: r.get(3)?,
                project_id: r.get(4)?,
                started_at: r.get(5)?,
                ended_at: r.get(6)?,
                planned_ms: r.get(7)?,
                actual_ms: r.get(8)?,
                outcome: r.get(9)?,
            })
        })?
        .collect::<Result<_, _>>()?;
    Ok(rows)
}

pub fn task_actuals(conn: &Connection) -> AppResult<Vec<TaskActual>> {
    let mut stmt = conn.prepare(
        "SELECT task_id, sum(actual_ms), count(*) FROM sessions
         WHERE kind = 'focus' AND task_id IS NOT NULL GROUP BY task_id",
    )?;
    let rows = stmt
        .query_map([], |r| Ok(TaskActual { task_id: r.get(0)?, focus_ms: r.get(1)?, sessions: r.get(2)? }))?
        .collect::<Result<_, _>>()?;
    Ok(rows)
}

#[tauri::command]
pub fn sessions_list(state: State<'_, AppState>, from: i64, to: i64) -> AppResult<Vec<SessionRow>> {
    sessions_between(&state.db.conn(), from, to)
}

#[tauri::command]
pub fn sessions_delete(app: tauri::AppHandle, state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.db.conn().execute("DELETE FROM sessions WHERE id = ?1", [id])?;
    let _ = tauri::Emitter::emit(&app, crate::timer::SESSIONS_EVENT, ());
    Ok(())
}

#[tauri::command]
pub fn tasks_actuals(state: State<'_, AppState>) -> AppResult<Vec<TaskActual>> {
    task_actuals(&state.db.conn())
}
