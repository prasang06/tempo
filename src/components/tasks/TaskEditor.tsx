import { Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { Task, TaskPatch } from "@/types";
import { tasks as taskApi, timer as timerApi } from "@/services/api";
import { mutate, useData } from "@/stores/data";
import { useTimer } from "@/stores/timer";
import { Button, Checkbox, IconButton, Select, Segmented } from "@/components/common/ui";
import { duration } from "@/lib/time";
import { timeOfDay, relativeDay, dayKey } from "@/lib/dates";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid grid-cols-[92px_1fr] items-center gap-3 py-1.5">
      <span className="text-[12px] text-ink-3">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "h-8 w-full rounded-sm border border-line-strong bg-surface px-2 text-[13px] outline-none hover:border-ink-3 focus:border-accent";

export function TaskEditor({ task, onClose }: { task: Task; onClose: () => void }) {
  const { projects, actuals } = useData();
  const currentTask = useTimer((s) => s.snapshot?.taskId);
  const run = useTimer((s) => s.run);
  const [title, setTitle] = useState(task.title);
  const [desc, setDesc] = useState(task.description);

  useEffect(() => {
    setTitle(task.title);
    setDesc(task.description);
  }, [task.id, task.title, task.description]);

  const save = (patch: TaskPatch) => void mutate(() => taskApi.update(task.id, patch));
  const actual = actuals[task.id];
  const done = task.completedAt !== null;

  return (
    <aside className="flex h-full w-[340px] shrink-0 flex-col border-l border-line bg-surface" aria-label="Task details">
      <div className="flex h-11 items-center justify-between border-b border-line px-4">
        <span className="label">Task</span>
        <IconButton label="Close (Esc)" onClick={onClose}>
          <X size={15} />
        </IconButton>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="flex items-start gap-3">
          <Checkbox className="mt-[7px]" checked={done} onChange={(v) => void mutate(() => taskApi.setCompleted(task.id, v))} label="Done" />
          <textarea
            value={title}
            rows={2}
            onChange={(e) => setTitle(e.target.value.replace(/\n/g, ""))}
            onBlur={() => title.trim() && title !== task.title && save({ title })}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setTitle(task.title);
                e.currentTarget.blur();
              }
            }}
            aria-label="Title"
            className="display w-full resize-none bg-transparent text-[18px] outline-none"
          />
        </div>
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onBlur={() => desc !== task.description && save({ description: desc })}
          placeholder="Notes"
          aria-label="Description"
          rows={4}
          className="mt-2 w-full resize-y rounded-sm border border-transparent bg-transparent px-0 text-[13px] leading-relaxed text-ink-2 outline-none placeholder:text-ink-3 focus:border-line-strong focus:px-2 focus:py-1"
        />

        <div className="mt-4 border-t border-line pt-3">
          <Field label="Project">
            <Select value={task.projectId ?? ""} onChange={(e) => save({ projectId: e.target.value || null })}>
              <option value="">No project</option>
              {projects
                .filter((p) => !p.archived || p.id === task.projectId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Priority">
            <Segmented
              size="sm"
              value={String(task.priority)}
              onChange={(v) => save({ priority: Number(v) })}
              options={[
                { value: "0", label: "None" },
                { value: "1", label: "Low" },
                { value: "2", label: "Med" },
                { value: "3", label: "High" },
              ]}
            />
          </Field>
          <Field label="Estimate">
            <div className="flex items-center gap-2">
              <input
                key={task.estimateMin ?? "none"}
                defaultValue={task.estimateMin ?? ""}
                inputMode="numeric"
                placeholder="—"
                aria-label="Estimate in minutes"
                className={`${inputCls} num w-20 text-[12px]`}
                onBlur={(e) => {
                  const n = Number(e.target.value);
                  const next = e.target.value.trim() === "" ? null : Number.isFinite(n) && n > 0 ? Math.round(n) : task.estimateMin;
                  if (next !== task.estimateMin) save({ estimateMin: next });
                }}
              />
              <span className="text-[12px] text-ink-3">min</span>
            </div>
          </Field>
          <Field label="Scheduled">
            <div className="flex items-center gap-1.5">
              <input type="date" className={`${inputCls} num text-[11.5px]`} value={task.scheduledDate ?? ""} onChange={(e) => save({ scheduledDate: e.target.value || null })} />
              {task.scheduledDate !== dayKey() && (
                <Button size="sm" variant="ghost" onClick={() => save({ scheduledDate: dayKey() })}>
                  Today
                </Button>
              )}
            </div>
          </Field>
          <Field label="Due">
            <input type="date" className={`${inputCls} num text-[11.5px]`} value={task.dueDate ?? ""} onChange={(e) => save({ dueDate: e.target.value || null })} />
          </Field>
        </div>

        <div className="mt-4 border-t border-line pt-3">
          <div className="flex items-baseline justify-between">
            <span className="label">Focus</span>
            <span className="num text-[11px] text-ink-3">
              {actual ? `${duration(actual.focusMs)} · ${actual.sessions} session${actual.sessions === 1 ? "" : "s"}` : "none yet"}
              {task.estimateMin ? ` · est ${duration(task.estimateMin * 60_000)}` : ""}
            </span>
          </div>
          {!done && (
            <Button
              className="mt-3 w-full"
              variant={currentTask === task.id ? "outline" : "primary"}
              onClick={() => void run(() => timerApi.setTask(currentTask === task.id ? null : task.id))}
            >
              {currentTask === task.id ? "Unlink from timer" : "Focus on this task"}
            </Button>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-line px-4 py-3 text-[11px] text-ink-3">
        <span>
          Created {relativeDay(dayKey(new Date(task.createdAt)))} {timeOfDay(task.createdAt)}
        </span>
        <Button
          size="sm"
          variant="danger"
          onClick={() => {
            onClose();
            void mutate(() => taskApi.remove(task.id));
          }}
        >
          <Trash2 size={13} /> Delete
        </Button>
      </div>
    </aside>
  );
}
