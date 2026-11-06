import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { OverlayFrame, startDrag } from "@/components/common/OverlayFrame";
import { Checkbox, cx } from "@/components/common/ui";
import { QuickAdd } from "@/components/tasks/QuickAdd";
import { useToday } from "@/hooks/useNow";
import { mutate, useData } from "@/stores/data";
import { useTimer } from "@/stores/timer";
import { tasks as taskApi } from "@/services/api";
import { dayKey, startOfDay } from "@/lib/dates";
import { minutesLabel } from "@/lib/time";
import { isOpen, todayTasks } from "@/lib/tasks";

export default function QuickTasks() {
  const { tasks, error, setError } = useData();
  const currentTask = useTimer((s) => s.snapshot?.taskId);
  const todayStamp = useToday();
  const [showDone, setShowDone] = useState(false);
  const [adding, setAdding] = useState(false);
  const addRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void useData.getState().init();
    void useTimer.getState().init();
  }, []);
  useEffect(() => {
    if (adding) addRef.current?.focus();
  }, [adding]);

  const { today, dayStart } = useMemo(() => {
    const d = startOfDay();
    return { today: dayKey(d), dayStart: d.getTime() };
  }, [todayStamp]);
  const list = todayTasks(tasks, today, dayStart);
  const open = list.filter(isOpen);
  const done = list.filter((t) => !isOpen(t));

  const row = (t: (typeof list)[number]) => (
    <li key={t.id} className="flex h-7 items-center gap-2.5 px-3">
      <Checkbox checked={!isOpen(t)} onChange={(v) => void mutate(() => taskApi.setCompleted(t.id, v))} label="Done" />
      <span className={cx("min-w-0 flex-1 truncate text-[12.5px]", !isOpen(t) && "text-ink-3 line-through", t.id === currentTask && "text-accent")}>{t.title}</span>
      {t.estimateMin && <span className="num text-[9.5px] text-ink-3">{minutesLabel(t.estimateMin)}</span>}
    </li>
  );

  return (
    <OverlayFrame label="quick-tasks">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line pl-3 pr-8" onMouseDown={startDrag}>
        <span className="text-[13px] font-semibold tracking-[-0.01em]">Today</span>
        <span className="num text-[10px] text-ink-3">
          {done.length}/{list.length}
        </span>
        <button
          type="button"
          aria-label="Add task"
          title="Add task"
          onClick={() => setAdding((v) => !v)}
          className={cx("ml-auto grid size-6 place-items-center rounded-sm hover:bg-hover", adding ? "text-accent" : "text-ink-3 hover:text-ink")}
        >
          <Plus size={14} />
        </button>
      </div>
      {adding && (
        <div className="border-b border-line px-3" onKeyDown={(e) => e.key === "Escape" && setAdding(false)}>
          <QuickAdd ref={addRef} compact defaults={{ scheduledDate: today }} placeholder="Task  ~30m  #project" />
        </div>
      )}
      {error && (
        <button type="button" className="px-3 py-1 text-left text-[11px] text-danger" onClick={() => setError(null)}>
          {error}
        </button>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto py-1" onMouseDown={startDrag}>
        {list.length === 0 && <p className="px-3 py-3 text-[12px] text-ink-3">Nothing for today. Press + to add.</p>}
        <ul>{open.map(row)}</ul>
        {done.length > 0 && (
          <>
            <button type="button" onClick={() => setShowDone((v) => !v)} className="flex h-6 items-center gap-1 px-3 text-[10.5px] text-ink-3 hover:text-ink-2">
              {showDone ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              {done.length} done
            </button>
            {showDone && <ul>{done.map(row)}</ul>}
          </>
        )}
      </div>
    </OverlayFrame>
  );
}
