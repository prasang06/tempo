pub mod store;

use tauri::{AppHandle, Emitter, State};

use crate::error::AppResult;
use crate::AppState;
use store::{NewProject, NewTask, Project, ProjectPatch, Task, TaskPatch};

pub const CHANGED_EVENT: &str = "tasks://changed";

fn changed(app: &AppHandle) {
    let _ = app.emit(CHANGED_EVENT, ());
}

#[tauri::command]
pub fn tasks_list(state: State<'_, AppState>) -> AppResult<Vec<Task>> {
    store::list_tasks(&state.db.conn())
}

#[tauri::command]
pub fn tasks_create(app: AppHandle, state: State<'_, AppState>, input: NewTask) -> AppResult<Task> {
    let task = store::create_task(&state.db.conn(), input)?;
    changed(&app);
    Ok(task)
}

#[tauri::command]
pub fn tasks_update(app: AppHandle, state: State<'_, AppState>, id: String, patch: TaskPatch) -> AppResult<Task> {
    let task = store::update_task(&state.db.conn(), &id, patch)?;
    changed(&app);
    // The timer shows the linked task's title; refresh it if this was the one.
    if state.timer.state().task_id.as_deref() == Some(id.as_str()) {
        crate::timer::publish(&app, &state.timer.snapshot(), None, false);
    }
    Ok(task)
}

#[tauri::command]
pub fn tasks_set_completed(app: AppHandle, state: State<'_, AppState>, id: String, completed: bool) -> AppResult<Task> {
    let task = store::set_completed(&state.db.conn(), &id, completed)?;
    changed(&app);
    Ok(task)
}

#[tauri::command]
pub fn tasks_delete(app: AppHandle, state: State<'_, AppState>, id: String) -> AppResult<()> {
    store::delete_task(&state.db.conn(), &id)?;
    if state.timer.state().task_id.as_deref() == Some(id.as_str()) {
        let (snap, _) = state.timer.apply(|s, _, _| {
            s.set_task(None);
            Ok(None)
        })?;
        crate::timer::publish(&app, &snap, None, false);
    }
    changed(&app);
    Ok(())
}

#[tauri::command]
pub fn tasks_reorder(app: AppHandle, state: State<'_, AppState>, ids: Vec<String>) -> AppResult<()> {
    store::reorder_tasks(&mut state.db.conn(), &ids)?;
    changed(&app);
    Ok(())
}

#[tauri::command]
pub fn projects_list(state: State<'_, AppState>) -> AppResult<Vec<Project>> {
    store::list_projects(&state.db.conn())
}

#[tauri::command]
pub fn projects_create(app: AppHandle, state: State<'_, AppState>, input: NewProject) -> AppResult<Project> {
    let p = store::create_project(&state.db.conn(), input)?;
    changed(&app);
    Ok(p)
}

#[tauri::command]
pub fn projects_update(app: AppHandle, state: State<'_, AppState>, id: String, patch: ProjectPatch) -> AppResult<Project> {
    let p = store::update_project(&state.db.conn(), &id, patch)?;
    changed(&app);
    Ok(p)
}

#[tauri::command]
pub fn projects_delete(app: AppHandle, state: State<'_, AppState>, id: String) -> AppResult<()> {
    store::delete_project(&state.db.conn(), &id)?;
    changed(&app);
    Ok(())
}
