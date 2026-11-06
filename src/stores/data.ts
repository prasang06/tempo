import { create } from "zustand";
import { EVENTS, errorMessage, on, projects as projectApi, tasks as taskApi } from "@/services/api";
import type { Project, Task, TaskActual } from "@/types";

interface DataStore {
  tasks: Task[];
  projects: Project[];
  /** focus time spent per task */
  actuals: Record<string, TaskActual>;
  loaded: boolean;
  error: string | null;
  init: () => Promise<void>;
  refresh: () => Promise<void>;
  setError: (e: unknown) => void;
}

let started = false;

export const useData = create<DataStore>((set, get) => ({
  tasks: [],
  projects: [],
  actuals: {},
  loaded: false,
  error: null,
  init: async () => {
    if (started) return;
    started = true;
    await on(EVENTS.tasks, () => void get().refresh());
    await on(EVENTS.sessions, () => void get().refresh());
    await get().refresh();
  },
  refresh: async () => {
    try {
      const [tasks, projects, actuals] = await Promise.all([taskApi.list(), projectApi.list(), taskApi.actuals()]);
      set({
        tasks,
        projects,
        actuals: Object.fromEntries(actuals.map((a) => [a.taskId, a])),
        loaded: true,
      });
    } catch (e) {
      set({ error: errorMessage(e) });
    }
  },
  setError: (e) => set({ error: e === null ? null : errorMessage(e) }),
}));

/** Runs a mutation and surfaces its error; data refreshes via the change event. */
export async function mutate<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    useData.getState().setError(e);
    return undefined;
  }
}
