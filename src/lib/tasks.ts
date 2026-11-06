import type { Task } from "@/types";

export const PRIORITY_LABEL = ["None", "Low", "Medium", "High"] as const;

export function isOpen(t: Task): boolean {
  return t.completedAt === null;
}

/** Planned for today or earlier, or due by today. */
export function isForToday(t: Task, today: string): boolean {
  return (t.scheduledDate !== null && t.scheduledDate <= today) || (t.dueDate !== null && t.dueDate <= today);
}

export function isOverdue(t: Task, today: string): boolean {
  return isOpen(t) && t.dueDate !== null && t.dueDate < today;
}

export function completedOn(t: Task, dayStartMs: number): boolean {
  return t.completedAt !== null && t.completedAt >= dayStartMs;
}

/** Today's list: open tasks for today, then those finished today. */
export function todayTasks(tasks: Task[], today: string, dayStartMs: number): Task[] {
  const open = tasks.filter((t) => isOpen(t) && isForToday(t, today));
  const done = tasks.filter((t) => completedOn(t, dayStartMs) && (isForToday(t, today) || t.scheduledDate === null));
  return [...open, ...done];
}

export function upcomingTasks(tasks: Task[], today: string): Task[] {
  const key = (t: Task) => [t.scheduledDate, t.dueDate].filter((d): d is string => d !== null).sort()[0] ?? "";
  return tasks
    .filter((t) => isOpen(t) && !isForToday(t, today) && (t.scheduledDate !== null || t.dueDate !== null))
    .sort((a, b) => key(a).localeCompare(key(b)) || a.position - b.position);
}

export function anytimeTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => isOpen(t) && t.scheduledDate === null && t.dueDate === null);
}

export function completedTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => !isOpen(t)).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
}
