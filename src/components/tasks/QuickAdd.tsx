import { CornerDownLeft } from "lucide-react";
import { forwardRef, useMemo, useState } from "react";
import { projects as projectApi, tasks as taskApi } from "@/services/api";
import { mutate, useData } from "@/stores/data";
import { parseQuickAdd } from "@/lib/quickadd";
import { relativeDay } from "@/lib/dates";
import { minutesLabel } from "@/lib/time";
import { PRIORITY_LABEL } from "@/lib/tasks";
import { cx } from "@/components/common/ui";
import type { Task } from "@/types";

interface Props {
  /** Defaults applied when the line doesn't say otherwise. */
  defaults?: { scheduledDate?: string | null; projectId?: string | null };
  placeholder?: string;
  compact?: boolean;
  onCreated?: (t: Task) => void;
}

export const QuickAdd = forwardRef<HTMLInputElement, Props>(function QuickAdd(
  { defaults, placeholder = "Add a task", compact, onCreated },
  ref,
) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(() => parseQuickAdd(value), [value]);
  const projects = useData((s) => s.projects);

  const submit = async () => {
    if (!parsed.title || busy) return;
    setBusy(true);
    let projectId = defaults?.projectId ?? null;
    if (parsed.project) {
      const name = parsed.project.toLowerCase();
      const found = projects.find((p) => !p.archived && p.name.toLowerCase() === name);
      projectId = found?.id ?? (await mutate(() => projectApi.create(parsed.project!)))?.id ?? projectId;
    }
    const task = await mutate(() =>
      taskApi.create({
        title: parsed.title,
        estimateMin: parsed.estimateMin,
        priority: parsed.priority ?? 0,
        projectId,
        scheduledDate: parsed.scheduledDate ?? defaults?.scheduledDate ?? null,
      }),
    );
    setBusy(false);
    if (task) {
      setValue("");
      onCreated?.(task);
    }
  };

  const chips = [
    parsed.estimateMin && `~${minutesLabel(parsed.estimateMin)}`,
    parsed.priority && `${PRIORITY_LABEL[parsed.priority]} priority`,
    parsed.project && `#${parsed.project}`,
    parsed.scheduledDate && relativeDay(parsed.scheduledDate),
  ].filter(Boolean) as string[];

  return (
    <div className={cx("group", compact ? "" : "border-b border-line")}>
      <div className="flex items-center gap-2">
        <span className={cx("text-accent", compact ? "text-[14px]" : "text-[16px]")}>+</span>
        <input
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
            if (e.key === "Escape") {
              setValue("");
              e.currentTarget.blur();
            }
          }}
          placeholder={placeholder}
          aria-label="New task"
          className={cx("min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-3", compact ? "h-8 text-[12.5px]" : "h-10 text-[13.5px]")}
        />
        {value && (
          <span className="flex items-center gap-1 text-[10px] text-ink-3">
            <CornerDownLeft size={11} />
          </span>
        )}
      </div>
      {!compact && (
        <div className="flex h-6 items-center gap-1.5 overflow-hidden whitespace-nowrap pb-1.5 pl-5 text-[11px] text-ink-3">
          {chips.length > 0 ? (
            chips.map((c) => (
              <span key={c} className="rounded-[3px] bg-accent-soft px-1.5 py-px text-accent">
                {c}
              </span>
            ))
          ) : (
            <span className="num truncate text-[10px] opacity-0 transition-opacity group-focus-within:opacity-100" title="~45m estimate · !h/!m/!l priority · #project · @tomorrow or @mon">
              ~45m · !h · #project · @tomorrow
            </span>
          )}
        </div>
      )}
    </div>
  );
});
