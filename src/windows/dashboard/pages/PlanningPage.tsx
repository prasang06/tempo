import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import type { Task } from "@/types";
import { Button, Checkbox, cx, IconButton, Kbd } from "@/components/common/ui";
import { TaskEditor } from "@/components/tasks/TaskEditor";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useToday } from "@/hooks/useNow";
import { mutate, useData } from "@/stores/data";
import { tasks as taskApi } from "@/services/api";
import { addDays, dayKey, parseDay, shortDate, startOfWeek, weekday } from "@/lib/dates";
import { duration, minutesLabel } from "@/lib/time";
import { isOpen } from "@/lib/tasks";

const BACKLOG = "backlog";

function PlanCard({
  task,
  color,
  selected,
  onSelect,
  onOpen,
}: {
  task: Task;
  color?: string;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const done = !isOpen(task);
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/tempo-task", task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onSelect}
      onDoubleClick={onOpen}
      className={cx(
        "group flex cursor-grab items-start gap-2 rounded-sm border px-2 py-1.5 active:cursor-grabbing",
        selected ? "border-accent-line bg-accent-soft" : "border-line bg-surface hover:border-line-strong",
      )}
    >
      <Checkbox className="mt-[2px]" checked={done} onChange={(v) => void mutate(() => taskApi.setCompleted(task.id, v))} label="Done" />
      <div className="min-w-0 flex-1">
        <div className={cx("text-[12.5px] leading-snug", done && "text-ink-3 line-through")}>{task.title}</div>
        {(task.estimateMin || color) && (
          <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-ink-3">
            {color && <span className="size-[5px] rounded-full" style={{ background: color }} />}
            {task.estimateMin ? <span className="num">{minutesLabel(task.estimateMin)}</span> : null}
          </div>
        )}
      </div>
    </div>
  );
}

export function PlanningPage() {
  const { tasks, projects } = useData();
  const todayStamp = useToday();
  const today = useMemo(() => dayKey(), [todayStamp]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const weekStart = useMemo(() => addDays(startOfWeek(parseDay(today)), weekOffset * 7), [today, weekOffset]);
  const days = Array.from({ length: 7 }, (_, i) => dayKey(addDays(weekStart, i)));
  const color = (t: Task) => projects.find((p) => p.id === t.projectId)?.color;

  const byDay = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.scheduledDate) continue;
      if (!isOpen(t) && t.scheduledDate < today) continue;
      m.set(t.scheduledDate, [...(m.get(t.scheduledDate) ?? []), t]);
    }
    return m;
  }, [tasks, today]);
  const unscheduled = tasks.filter((t) => isOpen(t) && !t.scheduledDate);
  const unfinished = tasks.filter((t) => isOpen(t) && t.scheduledDate !== null && t.scheduledDate < today);

  const schedule = (id: string, date: string | null) => void mutate(() => taskApi.update(id, { scheduledDate: date }));
  const sel = tasks.find((t) => t.id === selected);
  const editingTask = tasks.find((t) => t.id === editing);

  useHotkeys(
    {
      arrowleft: () => sel?.scheduledDate && schedule(sel.id, dayKey(addDays(parseDay(sel.scheduledDate), -1))),
      arrowright: () => sel && schedule(sel.id, dayKey(addDays(parseDay(sel.scheduledDate ?? today), sel.scheduledDate ? 1 : 0))),
      t: () => sel && schedule(sel.id, today),
      u: () => sel && schedule(sel.id, null),
      "[": () => setWeekOffset((w) => w - 1),
      "]": () => setWeekOffset((w) => w + 1),
      enter: () => sel && setEditing(sel.id),
      escape: () => setSelected(null),
    },
    editing === null,
  );

  const dropProps = (target: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (e.dataTransfer.types.includes("text/tempo-task")) {
        e.preventDefault();
        setDropTarget(target);
      }
    },
    onDragLeave: () => setDropTarget((d) => (d === target ? null : d)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDropTarget(null);
      const id = e.dataTransfer.getData("text/tempo-task");
      if (id) schedule(id, target === BACKLOG ? null : target);
    },
  });

  const card = (t: Task) => (
    <PlanCard key={t.id} task={t} color={color(t)} selected={t.id === selected} onSelect={() => setSelected(t.id)} onOpen={() => setEditing(t.id)} />
  );

  return (
    <div className="relative flex min-h-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-line px-6 pb-4 pt-7 xl:px-8">
          <div>
            <h1 className="display text-[26px]">Planning</h1>
            <p className="mt-1 hidden items-center gap-1.5 text-[12.5px] text-ink-3 lg:flex">
              Drag tasks onto a day, or select one and use <Kbd>←</Kbd>
              <Kbd>→</Kbd> <Kbd>T</Kbd> today <Kbd>U</Kbd> unschedule
            </p>
          </div>
          <div className="flex items-center gap-1">
            <IconButton label="Previous week ([)" onClick={() => setWeekOffset((w) => w - 1)}>
              <ChevronLeft size={15} />
            </IconButton>
            <Button size="sm" variant="ghost" onClick={() => setWeekOffset(0)} disabled={weekOffset === 0}>
              This week
            </Button>
            <IconButton label="Next week (])" onClick={() => setWeekOffset((w) => w + 1)}>
              <ChevronRight size={15} />
            </IconButton>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <div className={cx("flex w-[180px] shrink-0 flex-col overflow-y-auto border-r border-line px-3 py-4 xl:w-[220px]", dropTarget === BACKLOG && "bg-accent-soft")} {...dropProps(BACKLOG)}>
            {unfinished.length > 0 && (
              <div className="mb-5">
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="label text-danger/80">Unfinished</span>
                  <button type="button" className="text-[11px] text-ink-3 hover:text-ink" onClick={() => unfinished.forEach((t) => schedule(t.id, today))}>
                    Move all to today
                  </button>
                </div>
                <div className="space-y-1.5">{unfinished.map(card)}</div>
              </div>
            )}
            <div className="mb-2 px-1">
              <span className="label">Unscheduled</span>
            </div>
            <div className="space-y-1.5">
              {unscheduled.length ? unscheduled.map(card) : <p className="px-1 text-[12px] text-ink-3">Everything has a day.</p>}
            </div>
          </div>

          <div className="grid min-w-0 flex-1 grid-cols-[repeat(7,minmax(118px,1fr))] overflow-x-auto">
            {days.map((d) => {
              const list = byDay.get(d) ?? [];
              const est = list.filter(isOpen).reduce((a, t) => a + (t.estimateMin ?? 0), 0);
              const isToday = d === today;
              const past = d < today;
              return (
                <div
                  key={d}
                  {...dropProps(d)}
                  className={cx("flex min-w-0 flex-col border-r border-line last:border-r-0", dropTarget === d && "bg-accent-soft", past && "opacity-60")}
                >
                  <div className={cx("border-b px-2.5 pb-2 pt-3", isToday ? "border-accent" : "border-line")}>
                    <div className={cx("text-[12px]", isToday ? "text-accent" : "text-ink-3")}>{weekday(parseDay(d))}</div>
                    <div className="flex items-baseline justify-between">
                      <span className={cx("text-[15px] font-medium", isToday ? "text-ink" : "text-ink-2")}>{shortDate(parseDay(d))}</span>
                      {est > 0 && <span className="num text-[10px] text-ink-3">{duration(est * 60_000)}</span>}
                    </div>
                  </div>
                  <div className="flex-1 space-y-1.5 overflow-y-auto p-1.5">{list.map(card)}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
      {editingTask && <TaskEditor task={editingTask} onClose={() => setEditing(null)} />}
    </div>
  );
}
