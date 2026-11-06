//! JSON export/import of everything the user owns.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_dialog::DialogExt;

use crate::database::now_ms;
use crate::error::{AppError, AppResult};
use crate::settings::{self, Settings};
use crate::tasks::store::{self, Project, Task};
use crate::AppState;

const FORMAT_VERSION: u32 = 1;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Backup {
    pub format: String,
    pub version: u32,
    pub exported_at: i64,
    pub settings: Settings,
    pub projects: Vec<Project>,
    pub tasks: Vec<Task>,
    pub sessions: Vec<StoredSession>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredSession {
    pub id: String,
    pub kind: String,
    pub task_id: Option<String>,
    pub started_at: i64,
    pub ended_at: i64,
    pub planned_ms: i64,
    pub actual_ms: i64,
    pub outcome: String,
}

pub fn export(conn: &Connection) -> AppResult<Backup> {
    let mut stmt = conn.prepare(
        "SELECT id, kind, task_id, started_at, ended_at, planned_ms, actual_ms, outcome FROM sessions ORDER BY started_at",
    )?;
    let sessions = stmt
        .query_map([], |r| {
            Ok(StoredSession {
                id: r.get(0)?,
                kind: r.get(1)?,
                task_id: r.get(2)?,
                started_at: r.get(3)?,
                ended_at: r.get(4)?,
                planned_ms: r.get(5)?,
                actual_ms: r.get(6)?,
                outcome: r.get(7)?,
            })
        })?
        .collect::<Result<_, _>>()?;
    Ok(Backup {
        format: "tempo-backup".into(),
        version: FORMAT_VERSION,
        exported_at: now_ms(),
        settings: settings::load(conn)?,
        projects: store::list_projects(conn)?,
        tasks: store::list_tasks(conn)?,
        sessions,
    })
}

/// Replaces all user data with the backup, in one transaction.
pub fn import(conn: &mut Connection, b: &Backup) -> AppResult<()> {
    if b.format != "tempo-backup" || b.version > FORMAT_VERSION {
        return Err(AppError::invalid("not a tempo backup, or made by a newer version"));
    }
    b.settings.validate()?;
    let tx = conn.transaction()?;
    tx.execute_batch("DELETE FROM sessions; DELETE FROM tasks; DELETE FROM projects;")?;
    for p in &b.projects {
        tx.execute(
            "INSERT INTO projects (id, name, color, position, archived, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![p.id, p.name, p.color, p.position, p.archived, p.created_at],
        )?;
    }
    for t in &b.tasks {
        tx.execute(
            "INSERT INTO tasks (id, title, description, project_id, priority, estimate_min, due_date,
                scheduled_date, completed_at, position, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                t.id, t.title, t.description, t.project_id, t.priority, t.estimate_min, t.due_date,
                t.scheduled_date, t.completed_at, t.position, t.created_at, t.updated_at
            ],
        )?;
    }
    for s in &b.sessions {
        tx.execute(
            "INSERT INTO sessions (id, kind, task_id, started_at, ended_at, planned_ms, actual_ms, outcome)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![s.id, s.kind, s.task_id, s.started_at, s.ended_at, s.planned_ms, s.actual_ms, s.outcome],
        )?;
    }
    settings::save(&tx, &b.settings)?;
    tx.commit()?;
    Ok(())
}

fn default_name() -> String {
    format!("tempo-backup-{}.json", chrono::Local::now().format("%Y-%m-%d"))
}

/// Returns the written path, or `None` if the user cancelled the dialog.
#[tauri::command]
pub async fn data_export(app: AppHandle, state: State<'_, AppState>) -> AppResult<Option<String>> {
    let Some(path) = app.dialog().file().add_filter("JSON", &["json"]).set_file_name(default_name()).blocking_save_file() else {
        return Ok(None);
    };
    let path = path.into_path().map_err(|e| AppError::invalid(e.to_string()))?;
    let backup = export(&state.db.conn())?;
    std::fs::write(&path, serde_json::to_vec_pretty(&backup)?)?;
    Ok(Some(path.display().to_string()))
}

#[tauri::command]
pub async fn data_import(app: AppHandle, state: State<'_, AppState>) -> AppResult<bool> {
    let Some(path) = app.dialog().file().add_filter("JSON", &["json"]).blocking_pick_file() else {
        return Ok(false);
    };
    let path = path.into_path().map_err(|e| AppError::invalid(e.to_string()))?;
    let backup: Backup = serde_json::from_slice(&std::fs::read(path)?)
        .map_err(|e| AppError::invalid(format!("could not read backup: {e}")))?;
    import(&mut state.db.conn(), &backup)?;
    crate::settings_cmd::apply(&app, &state, backup.settings)?;
    let _ = app.emit(crate::tasks::CHANGED_EVENT, ());
    let _ = app.emit(crate::timer::SESSIONS_EVENT, ());
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::Db;
    use crate::tasks::store::{NewProject, NewTask};

    #[test]
    fn export_import_roundtrip() {
        let db = Db::open_in_memory().unwrap();
        {
            let conn = db.conn();
            let p = store::create_project(&conn, NewProject { name: "Lab".into(), color: None }).unwrap();
            store::create_task(&conn, NewTask { title: "Run".into(), project_id: Some(p.id), ..Default::default() }).unwrap();
        }
        let backup = export(&db.conn()).unwrap();
        let json = serde_json::to_string(&backup).unwrap();

        let other = Db::open_in_memory().unwrap();
        store::create_task(&other.conn(), NewTask { title: "will be replaced".into(), ..Default::default() }).unwrap();
        import(&mut other.conn(), &serde_json::from_str(&json).unwrap()).unwrap();
        let tasks = store::list_tasks(&other.conn()).unwrap();
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].title, "Run");
        assert!(tasks[0].project_id.is_some());
    }
}
