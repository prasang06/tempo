import { CalendarRange, ChartNoAxesColumn, CircleDot, ListTodo, Settings2 } from "lucide-react";
import { cx, Kbd, Wordmark } from "@/components/common/ui";
import { useTimerView } from "@/hooks/useTimerView";
import { useOverlays } from "@/stores/overlays";
import { byUrgency, STATUS_LABEL, useClaude } from "@/stores/claude";
import { clock, KIND_LABEL, shortDuration } from "@/lib/time";
import type { AgentStatus, OverlayLabel } from "@/types";

export type Page = "focus" | "tasks" | "planning" | "insights" | "settings";

export const PAGES: { id: Page; label: string; icon: typeof CircleDot }[] = [
  { id: "focus", label: "Focus", icon: CircleDot },
  { id: "tasks", label: "Tasks", icon: ListTodo },
  { id: "planning", label: "Planning", icon: CalendarRange },
  { id: "insights", label: "Insights", icon: ChartNoAxesColumn },
  { id: "settings", label: "Settings", icon: Settings2 },
];

const OVERLAY_BUTTONS: { label: OverlayLabel; name: string }[] = [
  { label: "floating-timer", name: "Timer" },
  { label: "quick-tasks", name: "Tasks" },
  { label: "mini-session", name: "Mini" },
];

const AGENT_DOT: Record<AgentStatus, string> = {
  waiting: "bg-accent",
  working: "bg-ok",
  done: "bg-ink-3",
  idle: "bg-line-strong",
};

/** Claude Code sessions reported by its hooks; hidden until one shows up. */
function ClaudeActivity() {
  const sessions = byUrgency(useClaude((s) => s.sessions)).slice(0, 3);
  if (sessions.length === 0) return null;
  return (
    <div className="border-t border-line px-5 py-3">
      <div className="label mb-2">Claude Code</div>
      <ul className="space-y-1.5">
        {sessions.map((a) => (
          <li key={a.id} className="flex items-center gap-2 text-[12px]" title={a.cwd}>
            <span className={cx("size-1.5 shrink-0 rounded-full", AGENT_DOT[a.status])} />
            <span className="min-w-0 flex-1 truncate text-ink-2">{a.title ?? a.project}</span>
            <span className={cx("num shrink-0 text-[10.5px]", a.status === "waiting" ? "text-accent" : "text-ink-3")}>
              {a.status === "working" ? shortDuration(Date.now() - a.since) : STATUS_LABEL[a.status]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Sidebar({ page, onNavigate }: { page: Page; onNavigate: (p: Page) => void }) {
  const { snapshot, remaining } = useTimerView(1000);
  const { prefs, setVisible } = useOverlays();

  return (
    <nav className="flex h-full w-[176px] shrink-0 flex-col border-r border-line bg-surface xl:w-[196px]" aria-label="Sections">
      <div className="flex h-14 items-center px-5">
        <Wordmark size={17} />
      </div>
      <ul className="mt-2 space-y-px px-2">
        {PAGES.map((p, i) => {
          const Icon = p.icon;
          const active = page === p.id;
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onNavigate(p.id)}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "group flex h-8 w-full items-center gap-2.5 rounded-sm px-3 text-[13.5px] transition-colors",
                  active ? "bg-elevated text-ink" : "text-ink-2 hover:bg-hover hover:text-ink",
                )}
              >
                <Icon size={15} strokeWidth={active ? 2.2 : 1.8} className={active ? "text-accent" : ""} />
                <span className="flex-1 text-left">{p.label}</span>
                <span className={cx("transition-opacity", active ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
                  <Kbd>{i + 1}</Kbd>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto">
        {snapshot && snapshot.status !== "idle" && page !== "focus" && (
          <button
            type="button"
            onClick={() => onNavigate("focus")}
            className="mx-2 mb-3 flex w-[calc(100%-16px)] items-center justify-between rounded-sm border border-line px-3 py-2 text-left hover:bg-hover"
          >
            <span className="text-[12px] text-ink-2">
              {KIND_LABEL[snapshot.kind]}
              {snapshot.status === "paused" && <span className="text-ink-3"> · paused</span>}
            </span>
            <span className="num text-[12px]">{clock(remaining)}</span>
          </button>
        )}
        <ClaudeActivity />
        <div className="border-t border-line px-5 py-3">
          <div className="label mb-2">Overlays</div>
          <div className="flex gap-1">
            {OVERLAY_BUTTONS.map((o) => {
              const on = prefs[o.label]?.visible ?? false;
              return (
                <button
                  key={o.label}
                  type="button"
                  aria-pressed={on}
                  onClick={() => void setVisible(o.label, !on)}
                  className={cx(
                    "h-6 flex-1 rounded-[3px] border text-[11.5px] transition-colors",
                    on ? "border-accent-line bg-accent-soft text-accent" : "border-line text-ink-3 hover:text-ink",
                  )}
                >
                  {o.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
