# tempo — architecture

## Shape

```
┌────────────────────────── Rust (single process, single instance) ───────────────────────────┐
│                                                                                              │
│  TimerService ── Mutex<TimerState> ── ticker thread (250 ms) ──► completes sessions          │
│      │  every mutation: persist row → insert session record → emit `timer://state`           │
│      ▼                                                                                       │
│  SQLite (rusqlite, WAL)  projects · tasks · sessions · settings · overlay_prefs · timer_state│
│      ▲                                                                                       │
│  task/project/settings commands ── emit `tasks://changed` / `settings://changed`             │
│                                                                                              │
│  Actions (one enum) ◄── global shortcuts ◄── tray menu ◄── CLI args via single-instance      │
└──────────────────────────────────────────────┬───────────────────────────────────────────────┘
                                               │ invoke() / events (broadcast to all windows)
        ┌──────────────┬───────────────────────┼───────────────────┬─────────────────┐
     main (dashboard)  floating-timer        quick-tasks        mini-session
```

All four windows load the same bundle; `src/main.tsx` picks the view from the window label.

## Timer — one source of truth

The timer lives in Rust (`src-tauri/src/timer/`). `engine.rs` is a pure state machine
(every transition takes `now_ms`, so it is unit-tested without clocks or threads).
`service.rs` wraps it in a mutex, persists it, and broadcasts snapshots.

State:

| field          | meaning                                                         |
|----------------|-----------------------------------------------------------------|
| `session_id`   | id of the session in progress (`None` while idle)               |
| `kind`         | `focus` · `short_break` · `long_break`                          |
| `status`       | `idle` · `running` · `paused`                                   |
| `duration_ms`  | planned length of this session                                  |
| `started_at`   | wall-clock ms when the session first started                    |
| `target_end`   | wall-clock ms when it will end (only while running)             |
| `paused_at`    | when it was paused (only while paused)                          |
| `remaining_ms` | authoritative remaining time while idle/paused                  |
| `task_id`      | linked task                                                     |
| `cycle`        | focus sessions completed since the last long break              |
| `revision`     | increases on every change; windows drop stale snapshots         |

Remaining time while running is always `target_end − now`; nothing counts down.
That makes it correct across window switches, webview reloads, restarts (state row is
reloaded) and suspend (the next tick sees `now ≥ target_end` and completes the session with
`ended_at = target_end`).

Transitions:

```
          start                 pause
  idle ───────────► running ◄──────────► paused
   ▲                 │   resume            │
   │  reset/skip     │ tick: now≥end       │ reset/skip
   └─────────────────┴──── complete ───────┘
                          │
                          ├─ focus  → cycle+1 → long break if cycle % interval == 0 else short
                          └─ break  → focus (long break resets cycle)
                          auto-start next if the config says so, else idle
```

`reset` and `skip` record the session as `abandoned`/`skipped` with the focused time
actually spent; completion records `completed`. Windows never mutate timer state locally —
they call commands (`timer_start`, `timer_pause`, …) and render the snapshot they get back.
Because every command goes through the same mutex, two windows cannot produce conflicting
state, and `tauri-plugin-single-instance` stops a second process from running its own timer.

Frontends render `target_end − Date.now()` on `requestAnimationFrame` for display only.

## Windows

| label            | size      | decorations | notes                                        |
|------------------|-----------|-------------|----------------------------------------------|
| `main`           | 1120×720  | native      | close hides to tray (configurable)           |
| `floating-timer` | 230×145   | none        | transparent, draggable, opacity via CSS      |
| `quick-tasks`    | 280×260   | none        | resizable                                    |
| `mini-session`   | 190×85    | none        |                                              |

Overlays are created on demand by Rust with `focused(false)`, `skip_taskbar(true)`,
`always_on_top` off by default. Per-overlay visibility, position, size, always-on-top and
opacity are stored in `overlay_prefs`; move/resize events are buffered and flushed by the
ticker. Visible overlays are restored at launch.

Wayland: clients cannot place their own windows or read their position, so saved positions
are only applied on X11/XWayland; on Wayland the compositor decides. Always-on-top is a
hint that some compositors ignore. Dragging works everywhere (`startDragging`).

## Actions

`actions.rs` defines `Action` (toggle floating timer, quick tasks, pause/resume, new focus,
toggle always-on-top, open main). Three entry points dispatch it:

1. global shortcuts (`tauri-plugin-global-shortcut`, X11 / XWayland only),
2. the tray menu,
3. CLI flags forwarded by single-instance: `tempo --action pause-resume`.
   This is the Wayland path — bind the command in your compositor/DE.

## Data

SQLite at `$XDG_DATA_HOME/dev.tempo.app/tempo.db`, migrations by `PRAGMA user_version`,
foreign keys on. Settings are one JSON document (serde defaults make it forward-compatible).
JSON export/import covers projects, tasks, sessions and settings.
