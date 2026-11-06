import { create } from "zustand";
import { EVENTS, errorMessage, on, settings as api } from "@/services/api";
import type { Settings } from "@/types";

interface SettingsStore {
  settings: Settings | null;
  error: string | null;
  init: () => Promise<void>;
  /** Apply a change with an updater; the backend validates and broadcasts. */
  update: (fn: (s: Settings) => Settings) => Promise<boolean>;
}

let started = false;

export const useSettings = create<SettingsStore>((set, get) => ({
  settings: null,
  error: null,
  init: async () => {
    if (started) return;
    started = true;
    await on<Settings>(EVENTS.settings, (s) => set({ settings: s }));
    set({ settings: await api.get() });
  },
  update: async (fn) => {
    const cur = get().settings;
    if (!cur) return false;
    try {
      set({ settings: await api.update(fn(structuredClone(cur))), error: null });
      return true;
    } catch (e) {
      set({ error: errorMessage(e) });
      return false;
    }
  },
}));
