import type { SessionKind, TimerSnapshot } from "@/types";

/** mm:ss, or h:mm:ss past an hour. Rounds up so 0:00 only shows when time is truly up. */
export function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** "2h 15m", "45m", "0m" */
export function duration(ms: number): string {
  const mins = Math.round(ms / 60_000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function minutesLabel(min: number | null | undefined): string {
  if (!min) return "";
  return duration(min * 60_000);
}

export const KIND_LABEL: Record<SessionKind, string> = {
  focus: "Focus",
  short_break: "Short break",
  long_break: "Long break",
};

export function remainingAt(s: TimerSnapshot, now: number): number {
  if (s.status === "running" && s.targetEnd !== null) return Math.max(0, s.targetEnd - now);
  return s.remainingMs;
}

export function progressAt(s: TimerSnapshot, now: number): number {
  if (s.durationMs <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - remainingAt(s, now) / s.durationMs));
}
