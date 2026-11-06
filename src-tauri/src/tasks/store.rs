use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Deserializer, Serialize};

use crate::database::{new_id, now_ms};
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    pub description: String,
    pub project_id: Option<String>,
    pub priority: u8,
    pub estimate_min: Option<u32>,
    pub due_date: Option<String>,
    pub scheduled_date: Option<String>,
    pub completed_at: Option<i64>,
    pub position: f64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub color: String,
    pub position: f64,
    pub archived: bool,
    pub created_at: i64,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct NewTask {
    pub title: String,
    pub description: String,
    pub project_id: Option<String>,
    pub priority: u8,
    pub estimate_min: Option<u32>,
    pub due_date: Option<String>,
    pub scheduled_date: Option<String>,
}

/// Distinguishes "field absent" (outer `None`) from "set to null" (`Some(None)`).
fn nullable<'de, D: Deserializer<'de>, T: Deserialize<'de>>(d: D) -> Result<Option<Option<T>>, D::Error> {
    Ok(Some(Option::deserialize(d)?))
}

#[derive(Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct TaskPatch {
    pub title: Option<String>,
    pub description: Option<String>,
    #[serde(deserialize_with = "nullable")]
    pub project_id: Option<Option<String>>,
    pub priority: Option<u8>,
    #[serde(deserialize_with = "nullable")]
    pub estimate_min: Option<Option<u32>>,
    #[serde(deserialize_with = "nullable")]
    pub due_date: Option<Option<String>>,
    #[serde(deserialize_with = "nullable")]
    pub scheduled_date: Option<Option<String>>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct NewProject {
    pub name: String,
    pub color: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ProjectPatch {
    pub name: Option<String>,
    pub color: Option<String>,
    pub archived: Option<bool>,
}

const TASK_COLS: &str = "id, title, description, project_id, priority, estimate_min, due_date,
    scheduled_date, completed_at, position, created_at, updated_at";

fn task_from_row(r: &Row) -> rusqlite::Result<Task> {
    Ok(Task {
        id: r.get(0)?,
        title: r.get(1)?,
        description: r.get(2)?,
        project_id: r.get(3)?,
        priority: r.get(4)?,
        estimate_min: r.get(5)?,
        due_date: r.get(6)?,
        scheduled_date: r.get(7)?,
        completed_at: r.get(8)?,
        position: r.get(9)?,
        created_at: r.get(10)?,
        updated_at: r.get(11)?,
    })
}

fn project_from_row(r: &Row) -> rusqlite::Result<Project> {
    Ok(Project {
        id: r.get(0)?,
        name: r.get(1)?,
        color: r.get(2)?,
        position: r.get(3)?,
        archived: r.get(4)?,
        created_at: r.get(5)?,
    })
}

fn clean_title(title: &str) -> AppResult<String> {
    let t = title.trim();
    if t.is_empty() {
        return Err(AppError::invalid("title cannot be empty"));
    }
    if t.chars().count() > 500 {
        return Err(AppError::invalid("title is too long"));
    }
    Ok(t.to_string())
}

fn check_date(d: &Option<String>) -> AppResult<()> {
    if let Some(d) = d {
        chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").map_err(|_| AppError::invalid(format!("invalid date: {d}")))?;
    }
    Ok(())
}

fn check_priority(p: u8) -> AppResult<()> {
    if p > 3 {
        return Err(AppError::invalid("priority must be 0–3"));
    }
    Ok(())
}

fn check_estimate(e: Option<u32>) -> AppResult<()> {
    if matches!(e, Some(0)) || e.is_some_and(|m| m > 24 * 60) {
        return Err(AppError::invalid("estimate must be between 1 minute and 24 hours"));
    }
    Ok(())
}

pub fn list_tasks(conn: &Connection) -> AppResult<Vec<Task>> {
    let mut stmt = conn.prepare(&format!("SELECT {TASK_COLS} FROM tasks ORDER BY position, created_at"))?;
    let rows = stmt.query_map([], task_from_row)?.collect::<Result<_, _>>()?;
    Ok(rows)
}

pub fn get_task(conn: &Connection, id: &str) -> AppResult<Task> {
    conn.query_row(&format!("SELECT {TASK_COLS} FROM tasks WHERE id = ?1"), [id], task_from_row)
        .optional()?
        .ok_or_else(|| AppError::NotFound(format!("task {id}")))
}

pub fn create_task(conn: &Connection, input: NewTask) -> AppResult<Task> {
    let title = clean_title(&input.title)?;
    check_priority(input.priority)?;
    check_estimate(input.estimate_min)?;
    check_date(&input.due_date)?;
    check_date(&input.scheduled_date)?;
    let now = now_ms();
    let id = new_id();
    // New tasks go to the end of the list.
    let position: f64 = conn.query_row("SELECT coalesce(max(position), 0) + 1 FROM tasks", [], |r| r.get(0))?;
    conn.execute(
        "INSERT INTO tasks (id, title, description, project_id, priority, estimate_min, due_date,
            scheduled_date, position, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)",
        params![
            id,
            title,
            input.description.trim(),
            input.project_id,
            input.priority,
            input.estimate_min,
            input.due_date,
            input.scheduled_date,
            position,
            now
        ],
    )?;
    get_task(conn, &id)
}

pub fn update_task(conn: &Connection, id: &str, patch: TaskPatch) -> AppResult<Task> {
    let mut t = get_task(conn, id)?;
    if let Some(title) = patch.title {
        t.title = clean_title(&title)?;
    }
    if let Some(d) = patch.description {
        t.description = d.trim().to_string();
    }
    if let Some(p) = patch.project_id {
        t.project_id = p;
    }
    if let Some(p) = patch.priority {
        check_priority(p)?;
        t.priority = p;
    }
    if let Some(e) = patch.estimate_min {
        check_estimate(e)?;
        t.estimate_min = e;
    }
    if let Some(d) = patch.due_date {
        check_date(&d)?;
        t.due_date = d;
    }
    if let Some(d) = patch.scheduled_date {
        check_date(&d)?;
        t.scheduled_date = d;
    }
    conn.execute(
        "UPDATE tasks SET title = ?2, description = ?3, project_id = ?4, priority = ?5,
            estimate_min = ?6, due_date = ?7, scheduled_date = ?8, updated_at = ?9
         WHERE id = ?1",
        params![id, t.title, t.description, t.project_id, t.priority, t.estimate_min, t.due_date, t.scheduled_date, now_ms()],
    )?;
    get_task(conn, id)
}

pub fn set_completed(conn: &Connection, id: &str, completed: bool) -> AppResult<Task> {
    let now = now_ms();
    let n = conn.execute(
        "UPDATE tasks SET completed_at = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, completed.then_some(now), now],
    )?;
    if n == 0 {
        return Err(AppError::NotFound(format!("task {id}")));
    }
    get_task(conn, id)
}

pub fn delete_task(conn: &Connection, id: &str) -> AppResult<()> {
    if conn.execute("DELETE FROM tasks WHERE id = ?1", [id])? == 0 {
        return Err(AppError::NotFound(format!("task {id}")));
    }
    Ok(())
}

/// Assigns positions to `ids` in the given order, keeping them in the slots the same tasks
/// occupied before, so reordering a filtered view doesn't disturb tasks outside it.
pub fn reorder_tasks(conn: &mut Connection, ids: &[String]) -> AppResult<()> {
    let tx = conn.transaction()?;
    let mut slots = Vec::with_capacity(ids.len());
    for id in ids {
        let pos: f64 = tx
            .query_row("SELECT position FROM tasks WHERE id = ?1", [id], |r| r.get(0))
            .optional()?
            .ok_or_else(|| AppError::NotFound(format!("task {id}")))?;
        slots.push(pos);
    }
    slots.sort_by(f64::total_cmp);
    // Duplicate positions would make the order ambiguous; nudge them apart.
    for i in 1..slots.len() {
        if slots[i] <= slots[i - 1] {
            slots[i] = slots[i - 1] + 1e-6;
        }
    }
    for (id, pos) in ids.iter().zip(slots) {
        tx.execute("UPDATE tasks SET position = ?2 WHERE id = ?1", params![id, pos])?;
    }
    tx.commit()?;
    Ok(())
}

pub fn list_projects(conn: &Connection) -> AppResult<Vec<Project>> {
    let mut stmt =
        conn.prepare("SELECT id, name, color, position, archived, created_at FROM projects ORDER BY position, created_at")?;
    let rows = stmt.query_map([], project_from_row)?.collect::<Result<_, _>>()?;
    Ok(rows)
}

fn get_project(conn: &Connection, id: &str) -> AppResult<Project> {
    conn.query_row("SELECT id, name, color, position, archived, created_at FROM projects WHERE id = ?1", [id], project_from_row)
        .optional()?
        .ok_or_else(|| AppError::NotFound(format!("project {id}")))
}

fn check_color(c: &str) -> AppResult<()> {
    let ok = c.len() == 7 && c.starts_with('#') && c[1..].chars().all(|ch| ch.is_ascii_hexdigit());
    if !ok {
        return Err(AppError::invalid("color must be #RRGGBB"));
    }
    Ok(())
}

pub fn create_project(conn: &Connection, input: NewProject) -> AppResult<Project> {
    let name = clean_title(&input.name)?;
    let color = input.color.unwrap_or_else(|| "#9B7CFF".into());
    check_color(&color)?;
    let id = new_id();
    let position: f64 = conn.query_row("SELECT coalesce(max(position), 0) + 1 FROM projects", [], |r| r.get(0))?;
    conn.execute(
        "INSERT INTO projects (id, name, color, position, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, name, color, position, now_ms()],
    )?;
    get_project(conn, &id)
}

pub fn update_project(conn: &Connection, id: &str, patch: ProjectPatch) -> AppResult<Project> {
    let mut p = get_project(conn, id)?;
    if let Some(n) = patch.name {
        p.name = clean_title(&n)?;
    }
    if let Some(c) = patch.color {
        check_color(&c)?;
        p.color = c;
    }
    if let Some(a) = patch.archived {
        p.archived = a;
    }
    conn.execute(
        "UPDATE projects SET name = ?2, color = ?3, archived = ?4 WHERE id = ?1",
        params![id, p.name, p.color, p.archived],
    )?;
    Ok(p)
}

pub fn delete_project(conn: &Connection, id: &str) -> AppResult<()> {
    if conn.execute("DELETE FROM projects WHERE id = ?1", [id])? == 0 {
        return Err(AppError::NotFound(format!("project {id}")));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::Db;

    fn task(conn: &Connection, title: &str) -> Task {
        create_task(conn, NewTask { title: title.into(), ..Default::default() }).unwrap()
    }

    #[test]
    fn create_update_complete_delete() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn();
        let t = task(&conn, "  Write report  ");
        assert_eq!(t.title, "Write report");

        let patch: TaskPatch = serde_json::from_str(r#"{"estimateMin": 45, "scheduledDate": "2026-11-07"}"#).unwrap();
        let t = update_task(&conn, &t.id, patch).unwrap();
        assert_eq!(t.estimate_min, Some(45));

        // explicit null clears; absent leaves alone
        let patch: TaskPatch = serde_json::from_str(r#"{"estimateMin": null}"#).unwrap();
        let t = update_task(&conn, &t.id, patch).unwrap();
        assert_eq!(t.estimate_min, None);
        assert_eq!(t.scheduled_date.as_deref(), Some("2026-11-07"));

        assert!(set_completed(&conn, &t.id, true).unwrap().completed_at.is_some());
        assert!(set_completed(&conn, &t.id, false).unwrap().completed_at.is_none());
        delete_task(&conn, &t.id).unwrap();
        assert!(list_tasks(&conn).unwrap().is_empty());
    }

    #[test]
    fn validation() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn();
        assert!(create_task(&conn, NewTask { title: "   ".into(), ..Default::default() }).is_err());
        assert!(create_task(&conn, NewTask { title: "x".into(), priority: 9, ..Default::default() }).is_err());
        assert!(create_task(&conn, NewTask { title: "x".into(), due_date: Some("tomorrow".into()), ..Default::default() }).is_err());
        assert!(create_task(&conn, NewTask { title: "x".into(), project_id: Some("nope".into()), ..Default::default() }).is_err(), "foreign key enforced");
    }

    #[test]
    fn reorder_subset_keeps_other_slots() {
        let db = Db::open_in_memory().unwrap();
        let mut conn = db.conn();
        let a = task(&conn, "a");
        let b = task(&conn, "b");
        let c = task(&conn, "c");
        reorder_tasks(&mut conn, &[c.id.clone(), a.id.clone()]).unwrap();
        let order: Vec<_> = list_tasks(&conn).unwrap().into_iter().map(|t| t.title).collect();
        assert_eq!(order, vec!["c", "b", "a"]);
        let _ = b;
    }

    #[test]
    fn deleting_project_unlinks_tasks() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn();
        let p = create_project(&conn, NewProject { name: "Thesis".into(), color: None }).unwrap();
        let t = create_task(&conn, NewTask { title: "x".into(), project_id: Some(p.id.clone()), ..Default::default() }).unwrap();
        delete_project(&conn, &p.id).unwrap();
        assert_eq!(get_task(&conn, &t.id).unwrap().project_id, None);
    }
}
