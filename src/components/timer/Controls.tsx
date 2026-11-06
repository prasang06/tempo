import { Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import type { TimerSnapshot } from "@/types";
import { cx, Kbd } from "@/components/common/ui";

export function primaryLabel(s: TimerSnapshot | null): string {
  if (!s) return "Start";
  return s.status === "running" ? "Pause" : s.status === "paused" ? "Resume" : "Start";
}

export function TimerControls({
  snapshot,
  onToggle,
  onReset,
  onSkip,
  hints = false,
}: {
  snapshot: TimerSnapshot | null;
  onToggle: () => void;
  onReset: () => void;
  onSkip: () => void;
  hints?: boolean;
}) {
  const running = snapshot?.status === "running";
  const active = snapshot?.status !== "idle";
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onReset}
        disabled={!active}
        title="Reset (R)"
        aria-label="Reset"
        className="grid size-10 place-items-center rounded-sm border border-line text-ink-2 hover:border-line-strong hover:text-ink disabled:opacity-30"
      >
        <RotateCcw size={15} />
      </button>
      <button
        type="button"
        onClick={onToggle}
        className={cx(
          "flex h-10 min-w-[148px] items-center justify-between gap-4 rounded-sm px-4 text-[14px] font-medium transition-colors",
          running ? "border border-accent-line bg-accent-soft text-accent hover:bg-accent/20" : "bg-accent text-accent-ink hover:bg-accent-hover",
        )}
      >
        <span className="flex items-center gap-2">
          {running ? <Pause size={15} fill="currentColor" strokeWidth={0} /> : <Play size={15} fill="currentColor" strokeWidth={0} />}
          {primaryLabel(snapshot)}
        </span>
        {hints && <span className="num text-[10px] opacity-60">space</span>}
      </button>
      <button
        type="button"
        onClick={onSkip}
        title="Skip to next (S)"
        aria-label="Skip"
        className="grid size-10 place-items-center rounded-sm border border-line text-ink-2 hover:border-line-strong hover:text-ink"
      >
        <SkipForward size={15} />
      </button>
      {hints && (
        <span className="ml-2 hidden items-center gap-1 text-[11px] text-ink-3 lg:flex">
          <Kbd>R</Kbd> reset <Kbd>S</Kbd> skip
        </span>
      )}
    </div>
  );
}
