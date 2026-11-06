import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useOverlays } from "@/stores/overlays";
import { useSettings } from "@/stores/settings";
import { useTheme } from "@/hooks/useTheme";
import type { OverlayLabel } from "@/types";
import { cx } from "./ui";

/**
 * Chrome for the undecorated overlay windows: translucent panel, drag anywhere that
 * isn't a control, and a close button that hides the overlay (and remembers that).
 */
export function OverlayFrame({ label, children, className }: { label: OverlayLabel; children: ReactNode; className?: string }) {
  const prefs = useOverlays((s) => s.prefs[label]);
  const theme = useSettings((s) => s.settings?.appearance.theme);
  useTheme(theme);
  useEffect(() => {
    void useOverlays.getState().init();
    void useSettings.getState().init();
  }, []);
  const opacity = prefs?.opacity ?? 0.96;

  return (
    <div
      data-tauri-drag-region
      className={cx("group/frame relative flex h-full flex-col overflow-hidden rounded-[10px] border border-line-strong", className)}
      style={{ background: `rgb(var(--overlay-rgb) / ${opacity})` }}
    >
      {children}
      <button
        type="button"
        aria-label="Hide overlay"
        title="Hide"
        onClick={() => void useOverlays.getState().setVisible(label, false)}
        className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-[3px] text-ink-3 opacity-0 transition-opacity hover:bg-hover hover:text-ink group-hover/frame:opacity-100"
      >
        <X size={12} />
      </button>
    </div>
  );
}

/** Starts a window drag from elements that contain text (where drag-region is unreliable). */
export function startDrag(e: React.MouseEvent) {
  if (e.button !== 0) return;
  if ((e.target as HTMLElement).closest("button, input, a, [role=checkbox]")) return;
  void getCurrentWindow().startDragging();
}
