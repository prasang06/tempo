import { Pause, Play } from "lucide-react";
import { OverlayFrame, startDrag } from "@/components/common/OverlayFrame";
import { cx } from "@/components/common/ui";
import { ProgressLine } from "@/components/timer/TickRuler";
import { useTimerView } from "@/hooks/useTimerView";
import { clock, KIND_LABEL } from "@/lib/time";

export default function MiniSession() {
  const { snapshot, remaining, progress, toggle } = useTimerView(250);
  const running = snapshot?.status === "running";
  const state = !snapshot ? "" : snapshot.status === "idle" ? "ready" : snapshot.status === "paused" ? "paused" : KIND_LABEL[snapshot.kind].toLowerCase();

  return (
    <OverlayFrame label="mini-session">
      <div className="flex h-full items-center gap-3 px-3.5" onMouseDown={startDrag}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={cx("size-[6px] rounded-full", running ? "bg-accent" : "bg-ink-3")} />
            <span className="label truncate">{state}</span>
          </div>
          <div className={cx("num mt-1 text-[26px] font-light leading-none tracking-[-0.06em]", !running && "text-ink-2")}>{clock(remaining)}</div>
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-label={running ? "Pause" : "Start"}
          className={cx("mr-3 grid size-8 shrink-0 place-items-center rounded-sm", running ? "bg-accent-soft text-accent" : "bg-accent text-accent-ink hover:bg-accent-hover")}
        >
          {running ? <Pause size={13} fill="currentColor" strokeWidth={0} /> : <Play size={13} fill="currentColor" strokeWidth={0} />}
        </button>
      </div>
      <ProgressLine progress={progress} className="absolute inset-x-0 bottom-0" />
    </OverlayFrame>
  );
}
