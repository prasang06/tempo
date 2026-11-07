export type SessionKind = "focus" | "short_break" | "long_break";
export type TimerStatus = "idle" | "running" | "paused";
export type Outcome = "completed" | "skipped" | "abandoned";

export interface TimerSnapshot {
  sessionId: string | null;
  kind: SessionKind;
  status: TimerStatus;
  durationMs: number;
  startedAt: number | null;
  targetEnd: number | null;
  pausedAt: number | null;
  remainingMs: number;
  taskId: string | null;
  cycle: number;
  revision: number;
  nowMs: number;
  taskTitle: string | null;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  projectId: string | null;
  priority: number;
  estimateMin: number | null;
  dueDate: string | null;
  scheduledDate: string | null;
  completedAt: number | null;
  position: number;
  createdAt: number;
  updatedAt: number;
}

export interface NewTask {
  title: string;
  description?: string;
  projectId?: string | null;
  priority?: number;
  estimateMin?: number | null;
  dueDate?: string | null;
  scheduledDate?: string | null;
}

export type TaskPatch = Partial<Omit<NewTask, "title">> & { title?: string };

export interface Project {
  id: string;
  name: string;
  color: string;
  position: number;
  archived: boolean;
  createdAt: number;
}

export interface SessionRow {
  id: string;
  kind: SessionKind;
  taskId: string | null;
  taskTitle: string | null;
  projectId: string | null;
  startedAt: number;
  endedAt: number;
  plannedMs: number;
  actualMs: number;
  outcome: Outcome;
}

export interface TaskActual {
  taskId: string;
  focusMs: number;
  sessions: number;
}

export type Theme = "dark" | "light" | "system";
export type Profile = "classic" | "deep" | "extended" | "custom";

export interface Settings {
  appearance: { theme: Theme };
  timer: {
    profile: Profile;
    focusMin: number;
    shortBreakMin: number;
    longBreakMin: number;
    longBreakInterval: number;
    autoStartBreaks: boolean;
    autoStartFocus: boolean;
    dailyGoalMin: number;
  };
  notifications: { enabled: boolean; sound: boolean; soundName: string };
  shortcuts: {
    enabled: boolean;
    toggleFloating: string;
    quickTasks: string;
    pauseResume: string;
    newFocus: string;
    toggleOnTop: string;
    openMain: string;
  };
  system: { autostart: boolean; closeToTray: boolean; startHidden: boolean };
  claude: { notify: boolean; autoFocus: boolean };
}

export type ActionName =
  | "toggle-floating"
  | "quick-tasks"
  | "mini-session"
  | "pause-resume"
  | "new-focus"
  | "toggle-on-top"
  | "open-main";

export interface ShortcutStatus {
  action: ActionName;
  accelerator: string;
  registered: boolean;
  error: string | null;
}

export type OverlayLabel = "floating-timer" | "quick-tasks" | "mini-session";

export interface OverlayPrefs {
  label: OverlayLabel;
  visible: boolean;
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
  alwaysOnTop: boolean;
  opacity: number;
}

export interface SessionInfo {
  platform: "linux" | "windows" | "macos" | string;
  wayland: boolean;
  desktop: string;
}

export type AgentStatus = "idle" | "working" | "waiting" | "done";

export interface AgentSession {
  id: string;
  project: string;
  cwd: string;
  title: string | null;
  status: AgentStatus;
  since: number;
  updated: number;
}

export interface HookStatus {
  path: string;
  installed: boolean;
  current: boolean;
}
