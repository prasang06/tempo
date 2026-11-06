import { Crosshair } from "lucide-react";
import { forwardRef } from "react";
import type { Project, Task, TaskActual } from "@/types";
import { Checkbox, cx } from "@/components/common/ui";
import { duration, minutesLabel } from "@/lib/time";
import { relativeDay } from "@/lib/dates";
import { isOverdue } from "@/lib/tasks";

export function PriorityMark({ priority }: { priority: number }) {
  if (priority === 0) return null;
  return (
    <span className="inline-flex items-end gap-px" title={["", "Low", "Medium", "High"][priority] + " priority"}>
      {[1, 2, 3].map((n) => (
        <span key={n} className={cx("w-[2px] rounded-[1px]", n <= priority ? (priority === 3 ? "bg-accent" : "bg-ink-2") : "bg-line-strong")} style={{ height: 3 + n * 2 }} />
      ))}
    </span>
  );
}

interface Props {
  task: Task;
  project?: Project;
  actual?: TaskActual;
  today: string;
  selected?: boolean;
  current?: boolean;
  showDate?: boolean;
  dense?: boolean;
  onToggle: (done: boolean) => void;
  onSelect?: () => void;
  onFocus?: () => void;
}

export const TaskRow = forwardRef<HTMLDivElement, Props>(function TaskRow(
  { task, project, actual, today, selected, current, showDate, dense, onToggle, onSelect, onFocus },
  ref,
) {
  const done = task.completedAt !== null;
  const overdue = isOverdue(task, today);
  const date = task.scheduledDate ?? task.dueDate;
  return (
    <div
      ref={ref}
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      onClick={onSelect}
      className={cx(
        "group relative flex items-center gap-3 border-b border-line/70 pr-2 transition-colors",
        dense ? "h-9 pl-2" : "h-11 pl-3",
        selected ? "bg-hover" : "hover:bg-hover/60",
      )}
    >
      {current && <span className="absolute inset-y-2 left-0 w-[2px] bg-accent" aria-label="current focus task" />}
      <Checkbox checked={done} onChange={onToggle} label={done ? "Mark as not done" : "Mark as done"} />
      <span className={cx("min-w-0 flex-1 truncate", dense ? "text-[13px]" : "text-[13.5px]", done && "text-ink-3 line-through decoration-ink-3")}>
        {task.title}
      </span>
      <span className="flex shrink-0 items-center gap-3 text-[11.5px] text-ink-3">
        {project && (
          <span className="flex items-center gap-1.5">
            <span className="size-[6px] rounded-full" style={{ background: project.color }} />
            <span className="max-w-[110px] truncate">{project.name}</span>
          </span>
        )}
        {showDate && date && <span className={cx(overdue && "text-danger")}>{relativeDay(date, today)}</span>}
        {!showDate && overdue && task.dueDate && <span className="text-danger">due {relativeDay(task.dueDate, today)}</span>}
        <PriorityMark priority={task.priority} />
        {(task.estimateMin || actual) && (
          <span className="num w-[76px] text-right text-[10.5px]">
            {actual && actual.focusMs > 0 ? <span className="text-ink-2">{duration(actual.focusMs)}</span> : null}
            {actual && actual.focusMs > 0 && task.estimateMin ? " / " : ""}
            {task.estimateMin ? minutesLabel(task.estimateMin) : ""}
          </span>
        )}
        {onFocus && !done && (
          <button
            type="button"
            aria-label="Focus on this task"
            title="Focus on this task (F)"
            onClick={(e) => {
              e.stopPropagation();
              onFocus();
            }}
            className={cx("grid size-6 place-items-center rounded-sm hover:bg-elevated hover:text-ink", current ? "text-accent" : "opacity-0 group-hover:opacity-100")}
          >
            <Crosshair size={13} />
          </button>
        )}
      </span>
    </div>
  );
});
