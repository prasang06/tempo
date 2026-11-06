import { Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cx, IconButton, Segmented } from "@/components/common/ui";
import { useSessions } from "@/hooks/useSessions";
import { useToday } from "@/hooks/useNow";
import { useData } from "@/stores/data";
import { sessions as sessionApi } from "@/services/api";
import { addDays, dayKey, shortDate, startOfDay, startOfMonth, startOfWeek, timeOfDay, weekday, relativeDay } from "@/lib/dates";
import { duration, KIND_LABEL } from "@/lib/time";
import type { SessionRow } from "@/types";

type Range = "week" | "month" | "year";

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 border-r border-line px-6 py-4 last:border-r-0 max-lg:[&:nth-child(2)]:border-r-0 max-lg:[&:nth-child(-n+2)]:border-b">
      <div className="label">{label}</div>
      <div className="num mt-1.5 text-[22px] leading-none">{value}</div>
      {sub && <div className="mt-1.5 text-[11.5px] text-ink-3">{sub}</div>}
    </div>
  );
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: { label: string; ms: number; sessions: number } }[] }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="rounded-sm border border-line-strong bg-elevated px-2.5 py-1.5 text-[12px]">
      <div className="text-ink-3">{p.label}</div>
      <div className="num mt-0.5 text-ink">{duration(p.ms)}</div>
      <div className="text-[11px] text-ink-3">
        {p.sessions} session{p.sessions === 1 ? "" : "s"}
      </div>
    </div>
  );
}

export function InsightsPage() {
  const [range, setRange] = useState<Range>("week");
  const [offset, setOffset] = useState(0);
  const { tasks, projects, actuals } = useData();
  const todayStamp = useToday();

  const { from, to, buckets } = useMemo(() => {
    const now = startOfDay();
    if (range === "week") {
      const s = addDays(startOfWeek(now), offset * 7);
      const b = Array.from({ length: 7 }, (_, i) => {
        const d = addDays(s, i);
        return { start: d.getTime(), end: addDays(d, 1).getTime(), label: `${weekday(d)} ${shortDate(d)}`, tick: weekday(d) };
      });
      return { from: s.getTime(), to: addDays(s, 7).getTime(), buckets: b };
    }
    if (range === "month") {
      const s = startOfMonth(new Date(now.getFullYear(), now.getMonth() + offset, 1));
      const e = new Date(s.getFullYear(), s.getMonth() + 1, 1);
      const days = Math.round((e.getTime() - s.getTime()) / 86_400_000);
      const b = Array.from({ length: days }, (_, i) => {
        const d = addDays(s, i);
        return { start: d.getTime(), end: addDays(d, 1).getTime(), label: `${weekday(d)} ${shortDate(d)}`, tick: String(d.getDate()) };
      });
      return { from: s.getTime(), to: e.getTime(), buckets: b };
    }
    const year = now.getFullYear() + offset;
    const b = Array.from({ length: 12 }, (_, m) => {
      const d = new Date(year, m, 1);
      return {
        start: d.getTime(),
        end: new Date(year, m + 1, 1).getTime(),
        label: d.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
        tick: d.toLocaleDateString(undefined, { month: "short" }),
      };
    });
    return { from: new Date(year, 0, 1).getTime(), to: new Date(year + 1, 0, 1).getTime(), buckets: b };
  }, [range, offset, todayStamp]);

  const { rows, error } = useSessions(from, to);
  const focus = rows.filter((s) => s.kind === "focus");
  const totalMs = focus.reduce((a, s) => a + s.actualMs, 0);
  const completed = focus.filter((s) => s.outcome === "completed");
  const completionRate = focus.length ? Math.round((completed.length / focus.length) * 100) : 0;
  const activeDays = new Set(focus.map((s) => dayKey(new Date(s.endedAt)))).size;

  const chart = buckets.map((b) => {
    const inB = focus.filter((s) => s.endedAt >= b.start && s.endedAt < b.end);
    return { ...b, ms: inB.reduce((a, s) => a + s.actualMs, 0), hours: inB.reduce((a, s) => a + s.actualMs, 0) / 3_600_000, sessions: inB.filter((s) => s.outcome === "completed").length };
  });

  const byProject = useMemo(() => {
    const m = new Map<string | null, number>();
    for (const s of focus) m.set(s.projectId, (m.get(s.projectId) ?? 0) + s.actualMs);
    return [...m.entries()]
      .map(([id, ms]) => ({ id, ms, project: projects.find((p) => p.id === id) }))
      .sort((a, b) => b.ms - a.ms);
  }, [focus, projects]);
  const projectMax = Math.max(1, ...byProject.map((p) => p.ms));

  const estimates = tasks
    .filter((t) => t.estimateMin && actuals[t.id])
    .map((t) => ({ task: t, est: t.estimateMin! * 60_000, act: actuals[t.id]!.focusMs }))
    .sort((a, b) => (b.task.completedAt ?? b.task.updatedAt) - (a.task.completedAt ?? a.task.updatedAt))
    .slice(0, 8);

  const periodLabel =
    range === "week"
      ? offset === 0
        ? "This week"
        : `Week of ${shortDate(new Date(from))}`
      : range === "month"
        ? new Date(from).toLocaleDateString(undefined, { month: "long", year: "numeric" })
        : String(new Date(from).getFullYear());

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 px-8 pb-4 pt-7">
        <div>
          <h1 className="display text-[26px]">Insights</h1>
          <div className="mt-1 flex items-center gap-2 text-[13px] text-ink-3">
            <button type="button" aria-label="Previous period" className="hover:text-ink" onClick={() => setOffset((o) => o - 1)}>
              ←
            </button>
            <span className="min-w-[120px] text-center text-ink-2">{periodLabel}</span>
            <button type="button" aria-label="Next period" className="hover:text-ink disabled:opacity-30" disabled={offset >= 0} onClick={() => setOffset((o) => o + 1)}>
              →
            </button>
          </div>
        </div>
        <Segmented
          size="sm"
          value={range}
          onChange={(r) => {
            setRange(r);
            setOffset(0);
          }}
          options={[
            { value: "week", label: "Week" },
            { value: "month", label: "Month" },
            { value: "year", label: "Year" },
          ]}
        />
      </header>
      {error && <p className="px-8 text-[12.5px] text-danger">{error}</p>}

      <div className="mx-8 grid grid-cols-2 border-y border-line lg:grid-cols-4">
        <Stat label="Focus time" value={duration(totalMs)} sub={activeDays ? `${duration(totalMs / activeDays)} per active day` : "no sessions yet"} />
        <Stat label="Completed sessions" value={String(completed.length)} />
        <Stat label="Completion rate" value={focus.length ? `${completionRate}%` : "—"} sub={focus.length ? `${focus.length - completed.length} cut short` : undefined} />
        <Stat label="Active days" value={String(activeDays)} />
      </div>

      <section className="mx-8 mt-6">
        <h2 className="label mb-3">Focus hours by {range === "year" ? "month" : "day"}</h2>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} margin={{ top: 4, right: 0, bottom: 0, left: -18 }} barCategoryGap="28%">
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis dataKey="tick" tickLine={false} axisLine={{ stroke: "var(--line-strong)" }} tick={{ fill: "var(--text-3)", fontSize: 10.5 }} interval={range === "month" ? 1 : 0} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--text-3)", fontSize: 10.5, fontFamily: "Martian Mono" }} allowDecimals={false} width={44} tickFormatter={(v: number) => `${v}h`} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--hover)" }} isAnimationActive={false} />
              <Bar dataKey="hours" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="mx-8 mt-8 grid grid-cols-1 gap-10 lg:grid-cols-2">
        <section>
          <h2 className="label mb-3">By project</h2>
          {byProject.length === 0 && <p className="text-[12.5px] text-ink-3">Link tasks to projects to see where time goes.</p>}
          <ul className="space-y-2.5">
            {byProject.map((p) => (
              <li key={p.id ?? "none"} className="group" title={`${p.project?.name ?? "No project"}: ${duration(p.ms)}`}>
                <div className="flex items-baseline justify-between text-[12.5px]">
                  <span className="flex items-center gap-2 text-ink-2">
                    <span className="size-[7px] rounded-full" style={{ background: p.project?.color ?? "var(--text-3)" }} />
                    {p.project?.name ?? "No project"}
                  </span>
                  <span className="num text-[11px] text-ink-2">
                    {duration(p.ms)} <span className="text-ink-3">· {Math.round((p.ms / Math.max(1, totalMs)) * 100)}%</span>
                  </span>
                </div>
                <div className="mt-1 h-[5px] w-full">
                  <div className="h-full rounded-r-[3px]" style={{ width: `${(p.ms / projectMax) * 100}%`, background: p.project?.color ?? "var(--text-3)" }} />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="label mb-3">Estimate vs actual</h2>
          {estimates.length === 0 ? (
            <p className="text-[12.5px] text-ink-3">Give tasks an estimate and focus on them to compare.</p>
          ) : (
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-[10.5px] text-ink-3">
                  <th className="pb-1.5 font-normal">Task</th>
                  <th className="pb-1.5 text-right font-normal">Est.</th>
                  <th className="pb-1.5 text-right font-normal">Actual</th>
                  <th className="w-[64px] pb-1.5 text-right font-normal">Diff</th>
                </tr>
              </thead>
              <tbody>
                {estimates.map(({ task, est, act }) => {
                  const diff = act - est;
                  return (
                    <tr key={task.id} className="border-t border-line/70">
                      <td className="max-w-0 truncate py-1.5 pr-3 text-ink-2">{task.title}</td>
                      <td className="num py-1.5 text-right text-[11px] text-ink-3">{duration(est)}</td>
                      <td className="num py-1.5 text-right text-[11px]">{duration(act)}</td>
                      <td className={cx("num py-1.5 text-right text-[11px]", diff > 0 ? "text-ink" : "text-ink-3")}>
                        {Math.abs(diff) < 60_000 ? "on time" : `${diff > 0 ? "+" : "−"}${duration(Math.abs(diff))}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="mx-8 mb-10 mt-8">
        <h2 className="label mb-2">Session history</h2>
        {rows.length === 0 ? (
          <p className="text-[12.5px] text-ink-3">No sessions in this period.</p>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[10.5px] text-ink-3">
                <th className="py-1.5 font-normal">When</th>
                <th className="py-1.5 font-normal">Type</th>
                <th className="py-1.5 font-normal">Task</th>
                <th className="py-1.5 text-right font-normal">Length</th>
                <th className="py-1.5 pl-4 font-normal">Result</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 200).map((s: SessionRow) => (
                <tr key={s.id} className="group border-t border-line/70">
                  <td className="num py-1.5 text-[11px] text-ink-3">
                    {relativeDay(dayKey(new Date(s.startedAt)))} {timeOfDay(s.startedAt)}
                  </td>
                  <td className={cx("py-1.5", s.kind === "focus" ? "text-ink-2" : "text-ink-3")}>{KIND_LABEL[s.kind]}</td>
                  <td className="max-w-[260px] truncate py-1.5 text-ink-2">{s.taskTitle ?? <span className="text-ink-3">—</span>}</td>
                  <td className="num py-1.5 text-right text-[11px]">{duration(s.actualMs)}</td>
                  <td className="py-1.5 pl-4 text-[11.5px] text-ink-3">{s.outcome === "completed" ? "completed" : s.outcome === "skipped" ? "skipped" : "stopped early"}</td>
                  <td className="py-0.5 text-right">
                    <IconButton label="Delete session from history" className="size-6 opacity-0 group-hover:opacity-100" onClick={() => void sessionApi.remove(s.id)}>
                      <Trash2 size={12} />
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
