import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  NewTask,
  OverlayLabel,
  OverlayPrefs,
  Project,
  SessionInfo,
  SessionKind,
  SessionRow,
  Settings,
  ShortcutStatus,
  Task,
  TaskActual,
  TaskPatch,
  TimerSnapshot,
} from "@/types";

export const EVENTS = {
  timer: "timer://state",
  sessions: "sessions://changed",
  tasks: "tasks://changed",
  settings: "settings://changed",
  overlays: "overlays://changed",
} as const;

export function on<T>(event: string, handler: (payload: T) => void): Promise<UnlistenFn> {
  return listen<T>(event, (e) => handler(e.payload));
}

export const timer = {
  get: () => invoke<TimerSnapshot>("timer_get"),
  start: () => invoke<TimerSnapshot>("timer_start"),
  pause: () => invoke<TimerSnapshot>("timer_pause"),
  resume: () => invoke<TimerSnapshot>("timer_resume"),
  toggle: () => invoke<TimerSnapshot>("timer_toggle"),
  reset: () => invoke<TimerSnapshot>("timer_reset"),
  skip: () => invoke<TimerSnapshot>("timer_skip"),
  selectKind: (kind: SessionKind) => invoke<TimerSnapshot>("timer_select_kind", { kind }),
  setTask: (taskId: string | null) => invoke<TimerSnapshot>("timer_set_task", { taskId }),
};

export const tasks = {
  list: () => invoke<Task[]>("tasks_list"),
  create: (input: NewTask) => invoke<Task>("tasks_create", { input }),
  update: (id: string, patch: TaskPatch) => invoke<Task>("tasks_update", { id, patch }),
  setCompleted: (id: string, completed: boolean) => invoke<Task>("tasks_set_completed", { id, completed }),
  remove: (id: string) => invoke<void>("tasks_delete", { id }),
  reorder: (ids: string[]) => invoke<void>("tasks_reorder", { ids }),
  actuals: () => invoke<TaskActual[]>("tasks_actuals"),
};

export const projects = {
  list: () => invoke<Project[]>("projects_list"),
  create: (name: string, color?: string) => invoke<Project>("projects_create", { input: { name, color } }),
  update: (id: string, patch: Partial<Pick<Project, "name" | "color" | "archived">>) =>
    invoke<Project>("projects_update", { id, patch }),
  remove: (id: string) => invoke<void>("projects_delete", { id }),
};

export const sessions = {
  list: (from: number, to: number) => invoke<SessionRow[]>("sessions_list", { from, to }),
  remove: (id: string) => invoke<void>("sessions_delete", { id }),
};

export const settings = {
  get: () => invoke<Settings>("settings_get"),
  update: (next: Settings) => invoke<Settings>("settings_update", { settings: next }),
  shortcutStatus: () => invoke<ShortcutStatus[]>("shortcuts_status"),
};

export const overlays = {
  list: () => invoke<OverlayPrefs[]>("overlays_list"),
  setVisible: (label: OverlayLabel, visible: boolean) => invoke<OverlayPrefs>("overlay_set_visible", { label, visible }),
  update: (label: OverlayLabel, patch: { alwaysOnTop?: boolean; opacity?: number }) =>
    invoke<OverlayPrefs>("overlay_update", { label, patch }),
  resetPosition: (label: OverlayLabel) => invoke<OverlayPrefs>("overlay_reset_position", { label }),
  contextMenu: (label: OverlayLabel) => invoke<void>("overlay_context_menu", { label }),
};

export const system = {
  info: () => invoke<SessionInfo>("session_info"),
  testNotification: () => invoke<void>("notifications_test"),
  exportData: () => invoke<string | null>("data_export"),
  importData: () => invoke<boolean>("data_import"),
  quit: () => invoke<void>("app_quit"),
};

/** Errors from commands arrive as plain strings. */
export function errorMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return "Something went wrong";
}
