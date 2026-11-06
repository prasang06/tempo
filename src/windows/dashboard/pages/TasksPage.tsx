import { Archive, ArchiveRestore, Plus, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Button, cx, IconButton } from "@/components/common/ui";
import { QuickAdd } from "@/components/tasks/QuickAdd";
import { TaskList } from "@/components/tasks/TaskList";
import { TaskEditor } from "@/components/tasks/TaskEditor";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useToday } from "@/hooks/useNow";
import { mutate, useData } from "@/stores/data";
import { projects as projectApi } from "@/services/api";
import { dayKey, startOfDay } from "@/lib/dates";
import { anytimeTasks, completedTasks, isOpen, todayTasks, upcomingTasks } from "@/lib/tasks";

type View = { kind: "today" } | { kind: "upcoming" } | { kind: "anytime" } | { kind: "completed" } | { kind: "project"; id: string };

const COLORS = ["#9B7CFF", "#7FB4E8", "#8FCFA4", "#E8C27F", "#EF7D84", "#C79BE8", "#A0A0AA"];

export function TasksPage() {
  const { tasks, projects } = useData();
  const todayStamp = useToday();
  const [view, setView] = useState<View>({ kind: "today" });
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [newProject, setNewProject] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const addRef = useRef<HTMLInputElement>(null);

  const { today, dayStart } = useMemo(() => {
    const d = startOfDay();
    return { today: dayKey(d), dayStart: d.getTime() };
  }, [todayStamp]);

  const lists = useMemo(
    () => ({
      today: todayTasks(tasks, today, dayStart),
      upcoming: upcomingTasks(tasks, today),
      anytime: anytimeTasks(tasks),
      completed: completedTasks(tasks),
    }),
    [tasks, today, dayStart],
  );

  const shown =
    view.kind === "project"
      ? [...tasks.filter((t) => t.projectId === view.id && isOpen(t)), ...completedTasks(tasks.filter((t) => t.projectId === view.id))]
      : lists[view.kind];

  const project = view.kind === "project" ? projects.find((p) => p.id === view.id) : undefined;
  const editingTask = tasks.find((t) => t.id === editing);

  useHotkeys({ n: () => addRef.current?.focus() }, editing === null);

  const views: { view: View; label: string; count: number }[] = [
    { view: { kind: "today" }, label: "Today", count: lists.today.filter(isOpen).length },
    { view: { kind: "upcoming" }, label: "Upcoming", count: lists.upcoming.length },
    { view: { kind: "anytime" }, label: "Anytime", count: lists.anytime.length },
    { view: { kind: "completed" }, label: "Completed", count: lists.completed.length },
  ];
  const same = (a: View, b: View) => a.kind === b.kind && (a.kind !== "project" || (b.kind === "project" && a.id === b.id));
  const choose = (v: View) => {
    setView(v);
    setSelected(null);
    setEditing(null);
  };

  const title = project?.name ?? views.find((v) => same(v.view, view))?.label ?? "";
  const defaults =
    view.kind === "today" ? { scheduledDate: today } : view.kind === "project" ? { projectId: view.id } : undefined;

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex w-[188px] shrink-0 flex-col border-r border-line py-6">
        <ul className="space-y-px px-2">
          {views.map((v) => (
            <li key={v.label}>
              <button
                type="button"
                onClick={() => choose(v.view)}
                className={cx(
                  "flex h-7 w-full items-center justify-between rounded-sm px-3 text-[13px]",
                  same(v.view, view) ? "bg-elevated text-ink" : "text-ink-2 hover:bg-hover hover:text-ink",
                )}
              >
                {v.label}
                <span className="num text-[10.5px] text-ink-3">{v.count || ""}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex items-center justify-between px-5">
          <span className="label">Projects</span>
          <IconButton label="New project" className="size-6" onClick={() => setNewProject("")}>
            <Plus size={13} />
          </IconButton>
        </div>
        <ul className="mt-1 space-y-px overflow-y-auto px-2">
          {projects
            .filter((p) => showArchived || !p.archived)
            .map((p) => {
              const count = tasks.filter((t) => t.projectId === p.id && isOpen(t)).length;
              const active = view.kind === "project" && view.id === p.id;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => choose({ kind: "project", id: p.id })}
                    className={cx(
                      "flex h-7 w-full items-center gap-2 rounded-sm px-3 text-[13px]",
                      active ? "bg-elevated text-ink" : "text-ink-2 hover:bg-hover hover:text-ink",
                      p.archived && "opacity-50",
                    )}
                  >
                    <span className="size-[7px] shrink-0 rounded-full" style={{ background: p.color }} />
                    <span className="flex-1 truncate text-left">{p.name}</span>
                    <span className="num text-[10.5px] text-ink-3">{count || ""}</span>
                  </button>
                </li>
              );
            })}
          {newProject !== null && (
            <li className="px-1">
              <input
                autoFocus
                value={newProject}
                onChange={(e) => setNewProject(e.target.value)}
                onBlur={() => setNewProject(null)}
                onKeyDown={async (e) => {
                  if (e.key === "Escape") setNewProject(null);
                  if (e.key === "Enter" && newProject.trim()) {
                    const color = COLORS[projects.length % COLORS.length];
                    const p = await mutate(() => projectApi.create(newProject.trim(), color));
                    setNewProject(null);
                    if (p) choose({ kind: "project", id: p.id });
                  }
                }}
                placeholder="Project name"
                aria-label="Project name"
                className="h-7 w-full rounded-sm border border-accent bg-transparent px-2 text-[13px] outline-none"
              />
            </li>
          )}
        </ul>
        {projects.some((p) => p.archived) && (
          <button type="button" className="mt-2 px-5 text-left text-[11.5px] text-ink-3 hover:text-ink-2" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? "Hide archived" : "Show archived"}
          </button>
        )}
      </div>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-end justify-between gap-4 px-8 pb-3 pt-7">
          <div className="flex items-center gap-3">
            {project && (
              <label className="relative size-3 cursor-pointer rounded-full" style={{ background: project.color }} title="Change colour">
                <input
                  type="color"
                  value={project.color.toLowerCase()}
                  onChange={(e) => void mutate(() => projectApi.update(project.id, { color: e.target.value.toUpperCase() }))}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
              </label>
            )}
            {project ? (
              <input
                key={project.id + project.name}
                defaultValue={project.name}
                aria-label="Project name"
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (name && name !== project.name) void mutate(() => projectApi.update(project.id, { name }));
                }}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                className="display bg-transparent text-[26px] outline-none"
              />
            ) : (
              <h1 className="display text-[26px]">{title}</h1>
            )}
          </div>
          {project && (
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" onClick={() => void mutate(() => projectApi.update(project.id, { archived: !project.archived }))}>
                {project.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
                {project.archived ? "Restore" : "Archive"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                title="Delete project (its tasks are kept, without a project)"
                onClick={() => {
                  choose({ kind: "today" });
                  void mutate(() => projectApi.remove(project.id));
                }}
              >
                <Trash2 size={13} /> Delete
              </Button>
            </div>
          )}
        </header>
        {view.kind !== "completed" && (
          <div className="px-8">
            <QuickAdd ref={addRef} defaults={defaults} placeholder={`Add to ${title}`} onCreated={(t) => setSelected(t.id)} />
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-6 pb-6 pt-1">
          <TaskList
            tasks={shown}
            today={today}
            selectedId={selected}
            onSelect={setSelected}
            onEdit={setEditing}
            showDate={view.kind !== "today"}
            reorderable={view.kind !== "completed" && view.kind !== "upcoming"}
            keyboard={editing === null}
            empty={<p className="px-2 py-8 text-[13px] text-ink-3">{view.kind === "completed" ? "Nothing finished yet." : "No tasks here."}</p>}
          />
        </div>
      </section>

      {editingTask && <TaskEditor task={editingTask} onClose={() => setEditing(null)} />}
    </div>
  );
}
