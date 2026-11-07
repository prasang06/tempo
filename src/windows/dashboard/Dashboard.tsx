import { useEffect, useState } from "react";
import { on } from "@/services/api";
import { Sidebar, PAGES, type Page } from "@/components/navigation/Sidebar";
import { ErrorNote } from "@/components/common/ui";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useTheme } from "@/hooks/useTheme";
import { useData } from "@/stores/data";
import { useSettings } from "@/stores/settings";
import { useOverlays } from "@/stores/overlays";
import { useTimer } from "@/stores/timer";
import { FocusPage } from "./pages/FocusPage";
import { TasksPage } from "./pages/TasksPage";
import { PlanningPage } from "./pages/PlanningPage";
import { InsightsPage } from "./pages/InsightsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ShortcutHelp } from "./ShortcutHelp";

export default function Dashboard() {
  const [page, setPage] = useState<Page>(() => {
    const requested = new URLSearchParams(window.location.search).get("page");
    return PAGES.find((p) => p.id === requested)?.id ?? "focus";
  });
  const [help, setHelp] = useState(false);
  const settings = useSettings((s) => s.settings);
  const dataError = useData((s) => s.error);
  const timerError = useTimer((s) => s.error);

  useEffect(() => {
    void useData.getState().init();
    void useSettings.getState().init();
    void useOverlays.getState().init();
    void useTimer.getState().init();
    // `tempo --page insights` from the command line or a launcher.
    const off = on<string>("app://navigate", (p) => {
      const found = PAGES.find((x) => x.id === p);
      if (found) setPage(found.id);
    });
    return () => void off.then((f) => f());
  }, []);
  useTheme(settings?.appearance.theme);

  useHotkeys(
    {
      ...Object.fromEntries(PAGES.map((p, i) => [String(i + 1), () => setPage(p.id)])),
      "shift+?": () => setHelp((v) => !v),
      "?": () => setHelp((v) => !v),
    },
    !help,
  );

  const error = dataError ?? timerError;

  return (
    <div className="flex h-full">
      <Sidebar page={page} onNavigate={setPage} />
      <main className="relative flex min-w-0 flex-1 flex-col">
        {error && (
          <div className="absolute inset-x-8 top-3 z-20">
            <ErrorNote
              message={error}
              onDismiss={() => {
                useData.getState().setError(null);
                useTimer.setState({ error: null });
              }}
            />
          </div>
        )}
        {page === "focus" && <FocusPage onNavigate={setPage} />}
        {page === "tasks" && <TasksPage />}
        {page === "planning" && <PlanningPage />}
        {page === "insights" && <InsightsPage />}
        {page === "settings" && <SettingsPage />}
      </main>
      {help && <ShortcutHelp onClose={() => setHelp(false)} />}
    </div>
  );
}
