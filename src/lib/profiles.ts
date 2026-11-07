import type { Profile, SessionKind, Settings } from "@/types";

/** Focus / short break / long break minutes per preset. Mirrors `TimerSettings::durations` in Rust. */
export const PRESETS: Record<Exclude<Profile, "custom">, [number, number, number]> = {
  classic: [25, 5, 15],
  deep: [50, 10, 20],
  extended: [90, 15, 30],
};

export function profileMinutes(t: Settings["timer"]): [number, number, number] {
  return t.profile === "custom" ? [t.focusMin, t.shortBreakMin, t.longBreakMin] : PRESETS[t.profile];
}

/** Length a session of `kind` gets under the current settings. */
export function profileMs(t: Settings["timer"], kind: SessionKind): number {
  const [f, s, l] = profileMinutes(t);
  return (kind === "focus" ? f : kind === "short_break" ? s : l) * 60_000;
}
