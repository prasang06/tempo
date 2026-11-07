import { useEffect } from "react";
import { Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { OverlayFrame, startDrag } from "@/components/common/OverlayFrame";
import { cx, Wordmark } from "@/components/common/ui";
import { ProgressLine } from "@/components/timer/TickRuler";
import { useTimerView } from "@/hooks/useTimerView";
import { clock, KIND_LABEL } from "@/lib/time";
import { byUrgency, useClaude } from "@/stores/claude";
import type { AgentSession, TimerSnapshot } from "@/types";

/** The task, unless Claude Code is blocked on you: that's the more urgent line. */
function Subtitle({ snapshot, agent }: { snapshot: TimerSnapshot | null; agent: AgentSession | undefined }) {
  const name = agent && (agent.title ?? agent.project);
  if (agent?.status === "waiting") return <span className="text-accent">Claude needs you · {name}</span>;
  if (snapshot?.taskTitle) return <>{snapshot.taskTitle}</>;
  if (agent?.status === "working") return <>Claude working · {name}</>;
  return <>{snapshot?.status === "paused" ? "Paused" : "No task"}</>;
}

export default function FloatingTimer() {
  const { snapshot, remaining, progress, toggle, reset, skip } = useTimerView(250);
  const agent = byUrgency(useClaude((s) => s.sessions))[0];
  useEffect(() => void useClaude.getState().init(), []);
  const running = snapshot?.status === "running";
  const btn = "grid size-7 place-items-center rounded-sm text-ink-2 hover:bg-hover hover:text-ink";

  return (
    <OverlayFrame label="floating-timer">
      <div className="flex h-full flex-col px-3.5 pb-2.5 pt-2.5" onMouseDown={startDrag}>
        <div className="flex items-center gap-2 pr-5">
          <Wordmark size={12} />
          <span className="label ml-auto truncate">{snapshot ? KIND_LABEL[snapshot.kind] : ""}</span>
        </div>
        <div className={cx("num mt-1.5 text-[38px] font-light leading-none tracking-[-0.06em]", snapshot?.status === "paused" && "text-ink-2")}>
          {clock(remaining)}
        </div>
        <div className="mt-1 truncate text-[11.5px] text-ink-3"><Subtitle snapshot={snapshot} agent={agent} /></div>
        <ProgressLine progress={progress} className="mt-auto" />
        <div className="mt-1.5 flex items-center justify-between">
          <button type="button" className={btn} onClick={reset} aria-label="Reset" title="Reset" disabled={snapshot?.status === "idle"}>
            <RotateCcw size={13} />
          </button>
          <button
            type="button"
            onClick={toggle}
            aria-label={running ? "Pause" : "Start"}
            className={cx("grid h-7 w-12 place-items-center rounded-sm", running ? "bg-accent-soft text-accent" : "bg-accent text-accent-ink hover:bg-accent-hover")}
          >
            {running ? <Pause size={13} fill="currentColor" strokeWidth={0} /> : <Play size={13} fill="currentColor" strokeWidth={0} />}
          </button>
          <button type="button" className={btn} onClick={skip} aria-label="Skip" title="Skip">
            <SkipForward size={13} />
          </button>
        </div>
      </div>
    </OverlayFrame>
  );
}
