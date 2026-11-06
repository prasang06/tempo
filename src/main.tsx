import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./styles/index.css";

// Every window loads this bundle; the label decides what it shows.
const views = {
  main: lazy(() => import("./windows/dashboard/Dashboard")),
  "floating-timer": lazy(() => import("./windows/floating-timer/FloatingTimer")),
  "quick-tasks": lazy(() => import("./windows/quick-tasks/QuickTasks")),
  "mini-session": lazy(() => import("./windows/mini-session/MiniSession")),
};

const label = getCurrentWindow().label as keyof typeof views;
const View = views[label] ?? views.main;
if (label !== "main") document.documentElement.classList.add("overlay");

// No browser context menu (reload/inspect) in release builds.
if (!import.meta.env.DEV) document.addEventListener("contextmenu", (e) => e.preventDefault());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Suspense fallback={null}>
      <View />
    </Suspense>
  </StrictMode>,
);
