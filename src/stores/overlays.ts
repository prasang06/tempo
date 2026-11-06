import { create } from "zustand";
import { EVENTS, errorMessage, on, overlays as api } from "@/services/api";
import type { OverlayLabel, OverlayPrefs } from "@/types";

interface OverlayStore {
  prefs: Partial<Record<OverlayLabel, OverlayPrefs>>;
  error: string | null;
  init: () => Promise<void>;
  setVisible: (label: OverlayLabel, visible: boolean) => Promise<void>;
  update: (label: OverlayLabel, patch: { alwaysOnTop?: boolean; opacity?: number }) => Promise<void>;
}

let started = false;

export const useOverlays = create<OverlayStore>((set, get) => {
  const put = (p: OverlayPrefs) => set({ prefs: { ...get().prefs, [p.label]: p }, error: null });
  const guard = async (fn: () => Promise<OverlayPrefs>) => {
    try {
      put(await fn());
    } catch (e) {
      set({ error: errorMessage(e) });
    }
  };
  return {
    prefs: {},
    error: null,
    init: async () => {
      if (started) return;
      started = true;
      await on<OverlayPrefs>(EVENTS.overlays, put);
      (await api.list()).forEach(put);
    },
    setVisible: (label, visible) => guard(() => api.setVisible(label, visible)),
    update: (label, patch) => guard(() => api.update(label, patch)),
  };
});
