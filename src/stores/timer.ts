import { create } from "zustand";
import { EVENTS, errorMessage, on, timer as api } from "@/services/api";
import type { TimerSnapshot } from "@/types";

interface TimerStore {
  snapshot: TimerSnapshot | null;
  error: string | null;
  init: () => Promise<void>;
  /** Run a command; the backend's reply (and its broadcast) become the new snapshot. */
  run: (cmd: () => Promise<TimerSnapshot>) => Promise<void>;
}

let started = false;

export const useTimer = create<TimerStore>((set, get) => {
  // Snapshots can arrive out of order (command reply vs. broadcast); keep the newest.
  const accept = (s: TimerSnapshot) => {
    const cur = get().snapshot;
    if (!cur || s.revision >= cur.revision) set({ snapshot: s, error: null });
  };
  return {
    snapshot: null,
    error: null,
    init: async () => {
      if (started) return;
      started = true;
      await on<TimerSnapshot>(EVENTS.timer, accept);
      accept(await api.get());
      // A reloaded webview or a woken machine: re-sync rather than trust local state.
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) api.get().then(accept).catch(() => {});
      });
    },
    run: async (cmd) => {
      try {
        accept(await cmd());
      } catch (e) {
        set({ error: errorMessage(e) });
      }
    },
  };
});
