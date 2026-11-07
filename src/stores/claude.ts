import { create } from "zustand";
import { claude as api, EVENTS, on } from "@/services/api";
import type { AgentSession, AgentStatus, HookStatus } from "@/types";

interface ClaudeStore {
  sessions: AgentSession[];
  hooks: HookStatus | null;
  init: () => Promise<void>;
  /** Connect or disconnect Claude Code's hooks. */
  setConnected: (on: boolean) => Promise<void>;
}

let started = false;

export const useClaude = create<ClaudeStore>((set) => ({
  sessions: [],
  hooks: null,
  init: async () => {
    if (started) return;
    started = true;
    await on<AgentSession[]>(EVENTS.claude, (sessions) => set({ sessions }));
    set({ sessions: await api.activity() });
    api.hooksStatus().then((hooks) => set({ hooks }), () => {});
  },
  setConnected: async (on) => {
    set({ hooks: await (on ? api.installHooks() : api.removeHooks()) });
  },
}));

/** Waiting on you beats working beats the rest. */
const RANK: Record<AgentStatus, number> = { waiting: 0, working: 1, done: 2, idle: 3 };

export function byUrgency(sessions: AgentSession[]): AgentSession[] {
  return [...sessions].sort((a, b) => RANK[a.status] - RANK[b.status] || b.updated - a.updated);
}

export const STATUS_LABEL: Record<AgentStatus, string> = {
  waiting: "needs you",
  working: "working",
  done: "done",
  idle: "idle",
};
