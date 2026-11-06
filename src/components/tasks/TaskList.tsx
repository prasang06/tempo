import { useEffect, useRef } from "react";
import type { Task } from "@/types";
import { tasks as taskApi, timer as timerApi } from "@/services/api";
import { mutate, useData } from "@/stores/data";
import { useTimer } from "@/stores/timer";
import { useHotkeys } from "@/hooks/useHotkeys";
import { TaskRow } from "./TaskRow";

interface Props {
  tasks: Task[];
  today: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onEdit?: (id: string) => void;
  showDate?: boolean;
  dense?: boolean;
  /** Allow Alt+↑/↓ reordering within this list. */
  reorderable?: boolean;
  keyboard?: boolean;
  empty?: React.ReactNode;
}

/**
 * Keyboard: j/k or ↑/↓ move, x toggles done, f sets focus task, e/enter edits,
 * delete removes, alt+↑/↓ reorders.
 */
export function TaskList({ tasks, today, selectedId, onSelect, onEdit, showDate, dense, reorderable, keyboard = true, empty }: Props) {
  const { projects, actuals } = useData();
  const currentTask = useTimer((s) => s.snapshot?.taskId ?? null);
  const run = useTimer((s) => s.run);
  const rows = useRef(new Map<string, HTMLDivElement>());
  const index = tasks.findIndex((t) => t.id === selectedId);
  const selected = index >= 0 ? tasks[index] : undefined;

  useEffect(() => {
    if (selectedId) rows.current.get(selectedId)?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  const move = (delta: number) => {
    if (tasks.length === 0) return;
    const next = index < 0 ? 0 : Math.min(tasks.length - 1, Math.max(0, index + delta));
    onSelect(tasks[next]?.id ?? null);
  };

  const reorder = (delta: number) => {
    if (!reorderable || index < 0) return;
    const target = index + delta;
    if (target < 0 || target >= tasks.length) return;
    const ids = tasks.map((t) => t.id);
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    void mutate(() => taskApi.reorder(ids));
  };

  const focusTask = (t: Task) => run(() => timerApi.setTask(currentTask === t.id ? null : t.id));

  useHotkeys(
    {
      j: () => move(1),
      k: () => move(-1),
      arrowdown: () => move(1),
      arrowup: () => move(-1),
      "alt+arrowdown": () => reorder(1),
      "alt+arrowup": () => reorder(-1),
      x: () => selected && void mutate(() => taskApi.setCompleted(selected.id, selected.completedAt === null)),
      f: () => selected && void focusTask(selected),
      e: () => selected && onEdit?.(selected.id),
      enter: () => selected && onEdit?.(selected.id),
      delete: () => {
        if (!selected) return;
        const next = tasks[index + 1] ?? tasks[index - 1];
        void mutate(() => taskApi.remove(selected.id));
        onSelect(next?.id ?? null);
      },
      escape: () => onSelect(null),
    },
    keyboard,
  );

  if (tasks.length === 0) return <>{empty}</>;

  return (
    <div role="listbox" aria-label="Tasks">
      {tasks.map((t) => (
        <TaskRow
          key={t.id}
          ref={(el) => {
            if (el) rows.current.set(t.id, el);
            else rows.current.delete(t.id);
          }}
          task={t}
          project={projects.find((p) => p.id === t.projectId)}
          actual={actuals[t.id]}
          today={today}
          dense={dense}
          showDate={showDate}
          selected={t.id === selectedId}
          current={t.id === currentTask}
          onSelect={() => (t.id === selectedId && onEdit ? onEdit(t.id) : onSelect(t.id))}
          onToggle={(done) => void mutate(() => taskApi.setCompleted(t.id, done))}
          onFocus={() => void focusTask(t)}
        />
      ))}
    </div>
  );
}
