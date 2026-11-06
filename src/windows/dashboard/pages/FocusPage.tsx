import { useMemo, useRef, useState } from "react";
import type { Page } from "@/components/navigation/Sidebar";
import { cx, Kbd, Segmented, Select } from "@/components/common/ui";
import { TickRuler } from "@/components/timer/TickRuler";
import { TimerControls } from "@/components/timer/Controls";
import { QuickAdd } from "@/components/tasks/QuickAdd";
import { TaskList } from "@/components/tasks/TaskList";
import { TaskEditor } from "@/components/tasks/TaskEditor";
import { useTimerView } from "@/hooks/useTimerView";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useSessions } from "@/hooks/useSessions";
import { useToday } from "@/hooks/useNow";
import { useData } from "@/stores/data";
import { useSettings } from "@/stores/settings";
import { timer as timerApi } from "@/services/api";
import { clock, duration, KIND_LABEL } from "@/lib/time";
import { addDays, dayKey, longDate, startOfDay, startOfWeek, timeOfDay, weekday } from "@/lib/dates";
import { isOpen, todayTasks } from "@/lib/tasks";
import type { Profile, SessionKind } from "@/types";

const PROFILES: { value: Profile; label: string; hint: string }[] = [
  { value: "classic", label: "Classic", hint: "25 min focus · 5 min break" },
  { value: "deep", label: "Deep work", hint: "50 min focus · 10 min break" },
  { value: "extended", label: "Extended", hint: "90 min focus · 15 min break" },
  { value: "custom", label: "Custom", hint: "Your own durations (Settings → Timer)" },
];

const KINDS: SessionKind[] = ["focus", "short_break", "long_break"];

export function FocusPage({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const { snapshot, remaining, progress, toggle, reset, skip, run } = useTimerView();
  const { settings, update } = useSettings();
  const tasks = useData((s) => s.tasks);
  const todayStamp = useToday();
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const addRef = useRef<HTMLInputElement>(null);

  const { today, dayStart, weekStart } = useMemo(() => {
    const d = startOfDay();
    return { today: dayKey(d), dayStart: d.getTime(), weekStart: startOfWeek(d).getTime() };
  }, [todayStamp]);
  const { rows: weekSessions } = useSessions(weekStart, weekStart + 7 * 86_400_000);

  const list = useMemo(() => todayTasks(tasks, today, dayStart), [tasks, today, dayStart]);
  const openToday = list.filter(isOpen);
  const editingTask = tasks.find((t) => t.id === editing);

  const focus = weekSessions.filter((s) => s.kind === "focus");
  const todayFocus = focus.filter((s) => s.endedAt >= dayStart);
  const todayMs = todayFocus.reduce((a, s) => a + s.actualMs, 0);
  const todayCount = todayFocus.filter((s) => s.outcome === "completed").length;
  const goalMs = (settings?.timer.dailyGoalMin ?? 0) * 60_000;
  const week = Array.from({ length: 7 }, (_, i) => {
    const from = weekStart + i * 86_400_000;
    const ms = focus.filter((s) => s.endedAt >= from && s.endedAt < from + 86_400_000).reduce((a, s) => a + s.actualMs, 0);
    return { day: weekday(addDays(new Date(weekStart), i)), ms, isToday: from === dayStart };
  });
  const weekMax = Math.max(...week.map((d) => d.ms), 1);

  useHotkeys(
    {
      space: toggle,
      r: reset,
      s: skip,
      n: () => addRef.current?.focus(),
    },
    editing === null,
  );

  const idle = snapshot?.status === "idle";
  const interval = settings?.timer.longBreakInterval ?? 4;
  const cyclePos = snapshot ? snapshot.cycle % interval : 0;

  return (
    <div className="flex min-h-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-end justify-between gap-4 px-10 pb-2 pt-8">
          <div>
            <h1 className="display text-[26px]">{longDate(new Date(dayStart))}</h1>
            <p className="mt-1 text-[13px] text-ink-3">
              {todayCount} session{todayCount === 1 ? "" : "s"} · {duration(todayMs)} focused
            </p>
          </div>
          {settings && (
            <Segmented
              size="sm"
              value={settings.timer.profile}
              options={PROFILES}
              onChange={(profile) => void update((s) => ({ ...s, timer: { ...s.timer, profile } }))}
            />
          )}
        </header>

        <div className="flex flex-1 flex-col justify-center px-10">
          <div className="mx-auto w-full max-w-[540px]">
            <div className="flex gap-5" role="tablist" aria-label="Session type">
              {KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={snapshot?.kind === k}
                  disabled={!idle && snapshot?.kind !== k}
                  title={!idle ? "Reset or skip to change session type" : undefined}
                  onClick={() => idle && void run(() => timerApi.selectKind(k))}
                  className={cx(
                    "border-b pb-1 text-[12.5px] transition-colors disabled:cursor-not-allowed",
                    snapshot?.kind === k ? "border-accent text-ink" : "border-transparent text-ink-3 hover:text-ink-2 disabled:hover:text-ink-3",
                  )}
                >
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>

            <div className="mt-6 flex items-baseline justify-between">
              <div
                className={cx("num font-light leading-none tracking-[-0.06em]", snapshot?.status === "paused" ? "text-ink-2" : "text-ink")}
                style={{ fontSize: remaining >= 3_600_000 ? 84 : 108 }}
                aria-live="off"
              >
                {clock(remaining)}
              </div>
            </div>
            <div className="mt-3 flex h-5 items-center gap-2 text-[12.5px] text-ink-3">
              {snapshot?.status === "running" && snapshot.targetEnd && <span>ends at {timeOfDay(snapshot.targetEnd)}</span>}
              {snapshot?.status === "paused" && <span className="text-accent">paused</span>}
              {idle && <span>{clock(snapshot?.durationMs ?? 0)} session</span>}
            </div>

            <TickRuler className="mt-5" progress={progress} active={snapshot?.status === "running"} ticks={Math.min(60, Math.max(25, Math.round((snapshot?.durationMs ?? 0) / 60_000)))} />

            <div className="mt-7 flex items-center gap-3">
              <span className="text-[12.5px] text-ink-3">Working on</span>
              <Select
                className="max-w-[340px] flex-1"
                value={snapshot?.taskId ?? ""}
                onChange={(e) => void run(() => timerApi.setTask(e.target.value || null))}
                aria-label="Task for this session"
              >
                <option value="">Nothing in particular</option>
                {snapshot?.taskId && !openToday.some((t) => t.id === snapshot.taskId) && (
                  <option value={snapshot.taskId}>{snapshot.taskTitle ?? "(removed task)"}</option>
                )}
                {openToday.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </Select>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <TimerControls snapshot={snapshot} onToggle={toggle} onReset={reset} onSkip={skip} hints />
              <div className="flex items-center gap-1.5" title={`Long break after ${interval} focus sessions`}>
                {Array.from({ length: interval }, (_, i) => (
                  <span key={i} className={cx("size-[7px] rounded-full border", i < cyclePos ? "border-accent bg-accent" : "border-line-strong")} />
                ))}
              </div>
            </div>
          </div>
        </div>

        <footer className="grid grid-cols-[1.4fr_0.7fr_1.3fr] border-t border-line">
          <div className="border-r border-line px-10 py-4">
            <div className="label">Focus today</div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="num text-[20px]">{duration(todayMs)}</span>
              {goalMs > 0 && <span className="text-[12px] text-ink-3">of {duration(goalMs)}</span>}
            </div>
            {goalMs > 0 && (
              <div className="mt-2 h-[3px] w-full max-w-[260px] bg-line">
                <div className="h-full bg-accent" style={{ width: `${Math.min(100, (todayMs / goalMs) * 100)}%` }} />
              </div>
            )}
          </div>
          <div className="border-r border-line px-6 py-4">
            <div className="label">Sessions</div>
            <div className="num mt-1.5 text-[20px]">{todayCount}</div>
          </div>
          <button type="button" onClick={() => onNavigate("insights")} className="group px-6 py-4 text-left hover:bg-hover/50">
            <div className="label group-hover:text-ink-2">This week →</div>
            <div className="mt-2 flex h-[34px] items-end gap-2">
              {week.map((d, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1" title={`${d.day}: ${duration(d.ms)}`}>
                  <div className="flex h-[22px] w-full items-end justify-center">
                    <div className={cx("w-full max-w-[14px]", d.isToday ? "bg-accent" : "bg-ink-3/50")} style={{ height: d.ms ? Math.max(2, (d.ms / weekMax) * 22) : 1 }} />
                  </div>
                  <span className={cx("text-[9.5px]", d.isToday ? "text-ink" : "text-ink-3")}>{d.day.slice(0, 2)}</span>
                </div>
              ))}
            </div>
          </button>
        </footer>
      </section>

      {editingTask ? (
        <TaskEditor task={editingTask} onClose={() => setEditing(null)} />
      ) : (
        <aside className="flex w-[360px] shrink-0 flex-col border-l border-line" aria-label="Today's tasks">
          <div className="flex items-baseline justify-between px-5 pb-1 pt-8">
            <h2 className="display text-[17px]">Today</h2>
            <span className="num text-[11px] text-ink-3">
              {list.length - openToday.length} / {list.length}
            </span>
          </div>
          <div className="px-5">
            <QuickAdd ref={addRef} defaults={{ scheduledDate: today }} placeholder="Add a task for today" />
          </div>
          <div className="flex-1 overflow-y-auto px-3 pt-1">
            <TaskList
              tasks={list}
              today={today}
              selectedId={selected}
              onSelect={setSelected}
              onEdit={setEditing}
              dense
              keyboard={editing === null}
              empty={
                <p className="px-2 py-6 text-[12.5px] leading-relaxed text-ink-3">
                  Nothing planned. Press <Kbd>N</Kbd> to add a task, or pull some in from{" "}
                  <button type="button" className="text-ink-2 underline decoration-line-strong underline-offset-2 hover:text-ink" onClick={() => onNavigate("planning")}>
                    Planning
                  </button>
                  .
                </p>
              }
            />
          </div>
        </aside>
      )}
    </div>
  );
}
