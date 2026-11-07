/// Ordered schema migrations. The index + 1 is the `user_version` after applying it.
/// Never edit a migration that has shipped; append a new one.
pub const MIGRATIONS: &[&str] = &[
    // 1 — initial schema
    r#"
    CREATE TABLE projects (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        color       TEXT NOT NULL DEFAULT '#9B7CFF',
        position    REAL NOT NULL DEFAULT 0,
        archived    INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
        created_at  INTEGER NOT NULL
    );

    CREATE TABLE tasks (
        id              TEXT PRIMARY KEY,
        title           TEXT NOT NULL CHECK (length(trim(title)) > 0),
        description     TEXT NOT NULL DEFAULT '',
        project_id      TEXT REFERENCES projects(id) ON DELETE SET NULL,
        priority        INTEGER NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 3),
        estimate_min    INTEGER CHECK (estimate_min IS NULL OR estimate_min > 0),
        due_date        TEXT,
        scheduled_date  TEXT,
        completed_at    INTEGER,
        position        REAL NOT NULL DEFAULT 0,
        created_at      INTEGER NOT NULL,
        updated_at      INTEGER NOT NULL
    );
    CREATE INDEX idx_tasks_project ON tasks(project_id);
    CREATE INDEX idx_tasks_scheduled ON tasks(scheduled_date);

    CREATE TABLE sessions (
        id          TEXT PRIMARY KEY,
        kind        TEXT NOT NULL CHECK (kind IN ('focus', 'short_break', 'long_break')),
        task_id     TEXT REFERENCES tasks(id) ON DELETE SET NULL,
        started_at  INTEGER NOT NULL,
        ended_at    INTEGER NOT NULL,
        planned_ms  INTEGER NOT NULL,
        actual_ms   INTEGER NOT NULL,
        outcome     TEXT NOT NULL CHECK (outcome IN ('completed', 'skipped', 'abandoned'))
    );
    CREATE INDEX idx_sessions_started ON sessions(started_at);
    CREATE INDEX idx_sessions_task ON sessions(task_id);

    CREATE TABLE settings (
        key    TEXT PRIMARY KEY,
        value  TEXT NOT NULL
    );

    CREATE TABLE overlay_prefs (
        label          TEXT PRIMARY KEY,
        visible        INTEGER NOT NULL DEFAULT 0,
        x              INTEGER,
        y              INTEGER,
        width          INTEGER,
        height         INTEGER,
        always_on_top  INTEGER NOT NULL DEFAULT 0,
        opacity        REAL NOT NULL DEFAULT 0.96 CHECK (opacity BETWEEN 0.3 AND 1.0)
    );

    CREATE TABLE timer_state (
        id     INTEGER PRIMARY KEY CHECK (id = 1),
        state  TEXT NOT NULL
    );
    "#,
    // 2 — tempo tasks made from Claude Code prompts and Claude's own task list
    r#"
    CREATE TABLE claude_links (
        key         TEXT PRIMARY KEY,
        session_id  TEXT NOT NULL,
        kind        TEXT NOT NULL CHECK (kind IN ('prompt', 'task')),
        task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE
    );
    CREATE INDEX idx_claude_links_session ON claude_links(session_id);
    "#,
];
