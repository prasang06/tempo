import { Copy, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, cx, ErrorNote, Segmented, Stepper, Toggle } from "@/components/common/ui";
import { useSettings } from "@/stores/settings";
import { useOverlays } from "@/stores/overlays";
import { EVENTS, errorMessage, on, overlays as overlayApi, settings as settingsApi, system } from "@/services/api";
import type { ActionName, OverlayLabel, SessionInfo, Settings, ShortcutStatus } from "@/types";

const SECTIONS = [
  ["appearance", "Appearance"],
  ["timer", "Timer"],
  ["overlays", "Overlays"],
  ["notifications", "Notifications"],
  ["shortcuts", "Shortcuts"],
  ["system", "System"],
  ["data", "Data"],
] as const;

function Row({ title, hint, children }: { title: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-8 border-b border-line/70 py-3">
      <div className="min-w-0">
        <div className="text-[13.5px]">{title}</div>
        {hint && <div className="mt-0.5 text-[12px] leading-snug text-ink-3">{hint}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 pb-10">
      <h2 className="display mb-1 text-[18px]">{title}</h2>
      {children}
    </section>
  );
}

const SHORTCUT_FIELDS: { key: keyof Omit<Settings["shortcuts"], "enabled">; action: ActionName; label: string }[] = [
  { key: "toggleFloating", action: "toggle-floating", label: "Toggle floating timer" },
  { key: "quickTasks", action: "quick-tasks", label: "Quick tasks" },
  { key: "pauseResume", action: "pause-resume", label: "Pause / resume" },
  { key: "newFocus", action: "new-focus", label: "New focus session" },
  { key: "toggleOnTop", action: "toggle-on-top", label: "Toggle always-on-top" },
  { key: "openMain", action: "open-main", label: "Open tempo" },
];

/** Turns a keydown into a Tauri accelerator like "Ctrl+Alt+T". */
function accelerator(e: React.KeyboardEvent): string | null {
  const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Super"].filter(Boolean) as string[];
  const code = e.code;
  let key: string | null = null;
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3);
  else if (/^Digit\d$/.test(code)) key = code.slice(5);
  else if (/^F\d{1,2}$/.test(code)) key = code;
  else if (code === "Space") key = "Space";
  else if (["Comma", "Period", "Slash", "Semicolon", "Quote", "BracketLeft", "BracketRight", "Backslash", "Minus", "Equal", "Backquote"].includes(code)) key = code;
  if (!key || mods.length === 0) return null;
  return [...mods, key].join("+");
}

function ShortcutInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [recording, setRecording] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <button
      ref={ref}
      type="button"
      onClick={() => setRecording(true)}
      onBlur={() => setRecording(false)}
      onKeyDown={(e) => {
        if (!recording) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.key === "Escape") return setRecording(false);
        if (e.key === "Backspace" || e.key === "Delete") {
          onChange("");
          return setRecording(false);
        }
        const acc = accelerator(e);
        if (acc) {
          onChange(acc);
          setRecording(false);
          ref.current?.blur();
        }
      }}
      className={cx(
        "num h-8 min-w-[168px] rounded-sm border px-2.5 text-left text-[11px]",
        recording ? "border-accent text-accent" : "border-line-strong text-ink-2 hover:border-ink-3",
      )}
    >
      {recording ? "Press keys…  (⌫ clears)" : value || "—"}
    </button>
  );
}

const OVERLAY_ROWS: { label: OverlayLabel; name: string; hint: string }[] = [
  { label: "floating-timer", name: "Floating timer", hint: "Time left, current task and controls." },
  { label: "quick-tasks", name: "Quick tasks", hint: "Today's list with quick add." },
  { label: "mini-session", name: "Mini session", hint: "Just the time and a pause button." },
];

export function SettingsPage() {
  const { settings, update, error } = useSettings();
  const overlays = useOverlays();
  const [status, setStatus] = useState<ShortcutStatus[]>([]);
  const [info, setInfo] = useState<SessionInfo | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [confirmImport, setConfirmImport] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    settingsApi.shortcutStatus().then(setStatus, () => {});
    system.info().then(setInfo, () => {});
    const off = on(EVENTS.settings, () => settingsApi.shortcutStatus().then(setStatus, () => {}));
    return () => void off.then((f) => f());
  }, []);

  if (!settings) return null;
  const set = (fn: (s: Settings) => void) =>
    void update((s) => {
      fn(s);
      return s;
    });
  const t = settings.timer;
  const custom = t.profile === "custom";

  const run = async (fn: () => Promise<unknown>, done: (r: unknown) => string | null) => {
    try {
      setNote(done(await fn()));
    } catch (e) {
      setNote(errorMessage(e));
    }
  };

  return (
    <div className="flex min-h-0 flex-1">
      <nav className="w-[168px] shrink-0 border-r border-line px-2 py-7 xl:w-[188px]" aria-label="Settings sections">
        <h1 className="display mb-4 px-3 text-[22px]">Settings</h1>
        {SECTIONS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" })}
            className="flex h-7 w-full items-center rounded-sm px-3 text-[13px] text-ink-2 hover:bg-hover hover:text-ink"
          >
            {label}
          </button>
        ))}
      </nav>

      <div ref={scroller} className="min-w-0 flex-1 overflow-y-auto px-6 pt-8 xl:px-10">
        <div className="max-w-[640px]">
          {(error || note) && (
            <div className="mb-4">
              <ErrorNote
                message={error ?? note}
                onDismiss={() => {
                  setNote(null);
                  useSettings.setState({ error: null });
                }}
              />
            </div>
          )}

          <Section id="appearance" title="Appearance">
            <Row title="Theme" hint="System follows your desktop's light/dark preference.">
              <Segmented
                size="sm"
                value={settings.appearance.theme}
                onChange={(theme) => set((s) => void (s.appearance.theme = theme))}
                options={[
                  { value: "dark", label: "Dark" },
                  { value: "light", label: "Light" },
                  { value: "system", label: "System" },
                ]}
              />
            </Row>
          </Section>

          <Section id="timer" title="Timer">
            <Row title="Profile" hint="Changes apply to the next session; a running one keeps its length.">
              <Segmented
                size="sm"
                value={t.profile}
                onChange={(profile) => set((s) => void (s.timer.profile = profile))}
                options={[
                  { value: "classic", label: "25/5" },
                  { value: "deep", label: "50/10" },
                  { value: "extended", label: "90/15" },
                  { value: "custom", label: "Custom" },
                ]}
              />
            </Row>
            <div className={cx(!custom && "pointer-events-none opacity-40")} aria-disabled={!custom}>
              <Row title="Focus" hint={!custom ? "Switch to Custom to edit durations." : undefined}>
                <Stepper label="Focus minutes" value={t.focusMin} min={1} max={240} step={5} suffix="min" onChange={(v) => set((s) => void (s.timer.focusMin = v))} />
              </Row>
              <Row title="Short break">
                <Stepper label="Short break minutes" value={t.shortBreakMin} min={1} max={120} suffix="min" onChange={(v) => set((s) => void (s.timer.shortBreakMin = v))} />
              </Row>
              <Row title="Long break">
                <Stepper label="Long break minutes" value={t.longBreakMin} min={1} max={120} step={5} suffix="min" onChange={(v) => set((s) => void (s.timer.longBreakMin = v))} />
              </Row>
            </div>
            <Row title="Long break every">
              <Stepper label="Long break interval" value={t.longBreakInterval} min={1} max={12} suffix="sessions" onChange={(v) => set((s) => void (s.timer.longBreakInterval = v))} />
            </Row>
            <Row title="Start breaks automatically">
              <Toggle label="Start breaks automatically" checked={t.autoStartBreaks} onChange={(v) => set((s) => void (s.timer.autoStartBreaks = v))} />
            </Row>
            <Row title="Start focus automatically after a break">
              <Toggle label="Start focus automatically" checked={t.autoStartFocus} onChange={(v) => set((s) => void (s.timer.autoStartFocus = v))} />
            </Row>
            <Row title="Daily focus goal" hint="Shown on the Focus page. 0 hides it.">
              <Stepper label="Daily goal minutes" value={t.dailyGoalMin} min={0} max={1440} step={30} suffix="min" onChange={(v) => set((s) => void (s.timer.dailyGoalMin = v))} />
            </Row>
          </Section>

          <Section id="overlays" title="Overlays">
            <p className="mb-2 text-[12.5px] leading-relaxed text-ink-3">
              Small independent windows that keep running when the main window is closed. Drag them by any empty area.
              {info?.wayland && " On Wayland your compositor decides where they open and may ignore always-on-top; on KDE use a window rule to pin them."}
            </p>
            {OVERLAY_ROWS.map((o) => {
              const p = overlays.prefs[o.label];
              return (
                <div key={o.label} className="border-b border-line/70 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[13.5px]">{o.name}</div>
                      <div className="text-[12px] text-ink-3">{o.hint}</div>
                    </div>
                    <Toggle label={`Show ${o.name}`} checked={p?.visible ?? false} onChange={(v) => void overlays.setVisible(o.label, v)} />
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] text-ink-2">
                    <label className="flex items-center gap-2">
                      <Toggle label={`${o.name} always on top`} checked={p?.alwaysOnTop ?? false} onChange={(v) => void overlays.update(o.label, { alwaysOnTop: v })} />
                      Always on top
                    </label>
                    <label className="flex items-center gap-2">
                      Opacity
                      <input
                        type="range"
                        min={30}
                        max={100}
                        value={Math.round((p?.opacity ?? 0.96) * 100)}
                        onChange={(e) => void overlays.update(o.label, { opacity: Number(e.target.value) / 100 })}
                        className="w-28 accent-[var(--accent)]"
                        aria-label={`${o.name} opacity`}
                      />
                      <span className="num w-8 text-[10.5px] text-ink-3">{Math.round((p?.opacity ?? 0.96) * 100)}%</span>
                    </label>
                    {!info?.wayland && (
                      <button type="button" className="ml-auto flex items-center gap-1 text-ink-3 hover:text-ink" onClick={() => void run(() => overlayApi.resetPosition(o.label), () => null)}>
                        <RotateCcw size={11} /> Reset position
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </Section>

          <Section id="notifications" title="Notifications">
            <Row title="Notify when a session ends">
              <Toggle label="Notifications" checked={settings.notifications.enabled} onChange={(v) => set((s) => void (s.notifications.enabled = v))} />
            </Row>
            <Row title="Play a sound" hint="Played by your notification server from the system sound theme.">
              <Toggle label="Sound" checked={settings.notifications.sound} onChange={(v) => set((s) => void (s.notifications.sound = v))} />
            </Row>
            <Row title="Sound name" hint={<>freedesktop sound name, e.g. <span className="num">complete</span>, <span className="num">bell</span>, <span className="num">message-new-instant</span></>}>
              <input
                key={settings.notifications.soundName}
                defaultValue={settings.notifications.soundName}
                disabled={!settings.notifications.sound}
                onBlur={(e) => e.target.value !== settings.notifications.soundName && set((s) => void (s.notifications.soundName = e.target.value.trim()))}
                className="num h-8 w-[168px] rounded-sm border border-line-strong bg-transparent px-2 text-[11px] outline-none focus:border-accent disabled:opacity-40"
                aria-label="Sound name"
              />
            </Row>
            <Row title="Send a test notification">
              <Button size="sm" onClick={() => void run(system.testNotification, () => null)}>
                Test
              </Button>
            </Row>
          </Section>

          <Section id="shortcuts" title="Shortcuts">
            <Row title="Global shortcuts" hint="Work in any application. Click a shortcut to record a new one.">
              <Toggle label="Global shortcuts" checked={settings.shortcuts.enabled} onChange={(v) => set((s) => void (s.shortcuts.enabled = v))} />
            </Row>
            {SHORTCUT_FIELDS.map((f) => {
              const st = status.find((s) => s.action === f.action);
              return (
                <Row
                  key={f.key}
                  title={f.label}
                  hint={
                    st?.error ? (
                      <span className="text-danger">{st.error}</span>
                    ) : settings.shortcuts.enabled && st && !st.registered && settings.shortcuts[f.key] ? (
                      <span className="text-danger">not registered</span>
                    ) : undefined
                  }
                >
                  <ShortcutInput value={settings.shortcuts[f.key]} onChange={(v) => set((s) => void (s.shortcuts[f.key] = v))} />
                </Row>
              );
            })}
            <div className="mt-4 rounded-sm border border-line bg-surface px-4 py-3 text-[12.5px] leading-relaxed text-ink-2">
              <div className="mb-1 font-medium text-ink">{info?.wayland ? "You're on Wayland" : "Wayland & desktop shortcuts"}</div>
              {info?.wayland
                ? "Wayland doesn't let apps grab keys globally, so the shortcuts above only fire while a tempo window is focused. Bind these commands in your desktop's shortcut settings instead:"
                : "On Wayland, or if a shortcut clashes with your desktop, bind these commands in your desktop's shortcut settings:"}
              <ul className="mt-2 space-y-1">
                {SHORTCUT_FIELDS.map((f) => {
                  const cmd = `tempo --action ${f.action}`;
                  return (
                    <li key={f.action} className="flex items-center justify-between gap-3">
                      <code className="num text-[10.5px] text-ink">{cmd}</code>
                      <button type="button" title="Copy" aria-label={`Copy ${cmd}`} className="text-ink-3 hover:text-ink" onClick={() => void navigator.clipboard.writeText(cmd)}>
                        <Copy size={12} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </Section>

          <Section id="system" title="System">
            <Row title="Start on login" hint="Starts hidden in the tray.">
              <Toggle label="Start on login" checked={settings.system.autostart} onChange={(v) => set((s) => void (s.system.autostart = v))} />
            </Row>
            <Row title="Closing the window keeps tempo running" hint="The timer and overlays stay alive in the tray. Turn off to quit on close.">
              <Toggle label="Close to tray" checked={settings.system.closeToTray} onChange={(v) => set((s) => void (s.system.closeToTray = v))} />
            </Row>
            <Row title="Start with the main window hidden">
              <Toggle label="Start hidden" checked={settings.system.startHidden} onChange={(v) => set((s) => void (s.system.startHidden = v))} />
            </Row>
            <Row title="Quit tempo" hint="Stops the app entirely. A running timer resumes correctly next launch.">
              <Button size="sm" variant="danger" onClick={() => void system.quit()}>
                Quit
              </Button>
            </Row>
          </Section>

          <Section id="data" title="Data">
            <p className="mb-2 text-[12.5px] text-ink-3">Everything is stored locally in SQLite. Nothing leaves this machine.</p>
            <Row title="Export" hint="Tasks, projects, session history and settings as JSON.">
              <Button size="sm" onClick={() => void run(system.exportData, (p) => (p ? `Saved to ${p}` : null))}>
                Export…
              </Button>
            </Row>
            <Row title="Import" hint="Replaces all current tasks, projects, history and settings.">
              {confirmImport ? (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmImport(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      setConfirmImport(false);
                      void run(system.importData, (ok) => (ok ? "Backup imported." : null));
                    }}
                  >
                    Replace my data…
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="danger" onClick={() => setConfirmImport(true)}>
                  Import…
                </Button>
              )}
            </Row>
          </Section>
        </div>
      </div>
    </div>
  );
}
