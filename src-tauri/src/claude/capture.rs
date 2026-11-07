//! Turns what you hand Claude Code into tempo tasks: each prompt becomes a task that
//! completes when Claude finishes the turn, and tasks Claude adds to its own task list
//! (TaskCreated / TaskCompleted) are mirrored. Both land in a project named after the
//! repository, scheduled for today.

use rusqlite::{params, Connection, OptionalExtension};

use super::HookMessage;
use crate::error::AppResult;
use crate::tasks::store::{self, NewProject, NewTask};

/// Shorter prompts ("yes", "how long") are conversation, not work.
const MIN_WORDS: usize = 4;
const MAX_TITLE: usize = 90;

/// A task title from a prompt, or `None` when the prompt isn't worth a task.
pub fn prompt_title(prompt: &str) -> Option<String> {
    let line = prompt.lines().map(str::trim).find(|l| !l.is_empty())?;
    // Slash commands and `!` shell commands aren't requests.
    if line.starts_with('/') || line.starts_with('!') {
        return None;
    }
    let words: Vec<&str> = line.split_whitespace().collect();
    if words.len() < MIN_WORDS {
        return None;
    }
    let title = words.join(" ");
    if title.chars().count() <= MAX_TITLE {
        return Some(title);
    }
    let cut: String = title.chars().take(MAX_TITLE - 1).collect();
    // Break at a word when one is close.
    let cut = match cut.rfind(' ') {
        Some(i) if i > MAX_TITLE / 2 => &cut[..i],
        _ => &cut[..],
    };
    Some(format!("{}…", cut.trim_end_matches([',', '.', ';', ':', ' '])))
}

fn project_for(conn: &Connection, name: &str) -> AppResult<String> {
    let found: Option<String> = conn
        .query_row(
            "SELECT id FROM projects WHERE archived = 0 AND lower(name) = lower(?1) ORDER BY position LIMIT 1",
            [name],
            |r| r.get(0),
        )
        .optional()?;
    match found {
        Some(id) => Ok(id),
        None => Ok(store::create_project(conn, NewProject { name: name.into(), color: None })?.id),
    }
}

fn create(conn: &Connection, msg: &HookMessage, key: &str, kind: &str, title: String, description: String, today: &str) -> AppResult<()> {
    let exists: bool = conn.query_row("SELECT count(*) > 0 FROM claude_links WHERE key = ?1", [key], |r| r.get(0))?;
    if exists {
        return Ok(());
    }
    let project = super::project_name(&msg.cwd);
    let task = store::create_task(
        conn,
        NewTask {
            title,
            description,
            project_id: Some(project_for(conn, &project)?),
            scheduled_date: Some(today.into()),
            ..Default::default()
        },
    )?;
    conn.execute(
        "INSERT INTO claude_links (key, session_id, kind, task_id) VALUES (?1, ?2, ?3, ?4)",
        params![key, msg.session_id, kind, task.id],
    )?;
    Ok(())
}

fn complete(conn: &Connection, sql: &str, args: impl rusqlite::Params) -> AppResult<bool> {
    let ids: Vec<String> = conn.prepare(sql)?.query_map(args, |r| r.get(0))?.collect::<Result<_, _>>()?;
    for id in &ids {
        store::set_completed(conn, id, true)?;
    }
    Ok(!ids.is_empty())
}

/// Applies one hook message to the task list. Returns whether any task changed.
pub fn apply(conn: &Connection, msg: &HookMessage, today: &str) -> AppResult<bool> {
    match msg.event.as_str() {
        "UserPromptSubmit" => {
            let Some(prompt) = msg.prompt.as_deref() else { return Ok(false) };
            let Some(title) = prompt_title(prompt) else { return Ok(false) };
            let key = format!("prompt:{}:{}", msg.session_id, msg.at);
            create(conn, msg, &key, "prompt", title, prompt.trim().to_string(), today)?;
            Ok(true)
        }
        "TaskCreated" => {
            let (Some(id), Some(subject)) = (&msg.task_id, &msg.task_subject) else { return Ok(false) };
            if subject.trim().is_empty() {
                return Ok(false);
            }
            let key = format!("task:{}:{id}", msg.session_id);
            create(conn, msg, &key, "task", subject.trim().to_string(), msg.task_description.clone().unwrap_or_default(), today)?;
            Ok(true)
        }
        "TaskCompleted" => {
            let Some(id) = &msg.task_id else { return Ok(false) };
            complete(
                conn,
                "SELECT l.task_id FROM claude_links l JOIN tasks t ON t.id = l.task_id
                 WHERE l.key = ?1 AND t.completed_at IS NULL",
                [format!("task:{}:{id}", msg.session_id)],
            )
        }
        // The turn is over, so whatever was asked in it is done.
        "Stop" => complete(
            conn,
            "SELECT l.task_id FROM claude_links l JOIN tasks t ON t.id = l.task_id
             WHERE l.session_id = ?1 AND l.kind = 'prompt' AND t.completed_at IS NULL",
            [&msg.session_id],
        ),
        _ => Ok(false),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::Db;

    fn msg(event: &str, at: i64) -> HookMessage {
        HookMessage {
            event: event.into(),
            session_id: "s1".into(),
            cwd: "/home/me/code/tempo".into(),
            notification_type: None,
            title: None,
            prompt: None,
            task_id: None,
            task_subject: None,
            task_description: None,
            at,
        }
    }

    #[test]
    fn titles_from_prompts() {
        assert_eq!(prompt_title("how long"), None);
        assert_eq!(prompt_title("/review the diff please now"), None);
        assert_eq!(prompt_title("\n  add a dark   mode toggle to settings\nmore"), Some("add a dark mode toggle to settings".into()));
        let long = "make this public then and can you add this project to my website also as part of engineering and deploy it";
        let t = prompt_title(long).unwrap();
        assert!(t.ends_with('…') && t.chars().count() <= MAX_TITLE, "{t}");
    }

    #[test]
    fn prompts_complete_when_the_turn_ends() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn();
        let mut m = msg("UserPromptSubmit", 1);
        m.prompt = Some("fix the overlay sizing on wayland".into());
        assert!(apply(&conn, &m, "2026-11-07").unwrap());
        m.prompt = Some("ok".into());
        m.at = 2;
        assert!(!apply(&conn, &m, "2026-11-07").unwrap());

        let tasks = store::list_tasks(&conn).unwrap();
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].scheduled_date.as_deref(), Some("2026-11-07"));
        let projects = store::list_projects(&conn).unwrap();
        assert_eq!((projects.len(), projects[0].name.as_str()), (1, "tempo"));
        assert_eq!(tasks[0].project_id.as_deref(), Some(projects[0].id.as_str()));

        assert!(apply(&conn, &msg("Stop", 3), "2026-11-07").unwrap());
        assert!(store::list_tasks(&conn).unwrap()[0].completed_at.is_some());
        assert!(!apply(&conn, &msg("Stop", 4), "2026-11-07").unwrap(), "nothing left open");
    }

    #[test]
    fn mirrors_claudes_task_list() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn();
        let mut m = msg("TaskCreated", 1);
        m.task_id = Some("task-1".into());
        m.task_subject = Some("Write migration".into());
        apply(&conn, &m, "2026-11-07").unwrap();
        apply(&conn, &m, "2026-11-07").unwrap(); // a repeated hook doesn't duplicate
        assert_eq!(store::list_tasks(&conn).unwrap().len(), 1);

        // A turn ending doesn't complete Claude's own tasks; TaskCompleted does.
        assert!(!apply(&conn, &msg("Stop", 2), "2026-11-07").unwrap());
        m.event = "TaskCompleted".into();
        assert!(apply(&conn, &m, "2026-11-07").unwrap());
        assert!(store::list_tasks(&conn).unwrap()[0].completed_at.is_some());
    }

    #[test]
    fn deleting_a_task_drops_its_link() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn();
        let mut m = msg("UserPromptSubmit", 1);
        m.prompt = Some("rename the project to something else".into());
        apply(&conn, &m, "2026-11-07").unwrap();
        let id = store::list_tasks(&conn).unwrap()[0].id.clone();
        store::delete_task(&conn, &id).unwrap();
        assert!(!apply(&conn, &msg("Stop", 2), "2026-11-07").unwrap());
    }
}
