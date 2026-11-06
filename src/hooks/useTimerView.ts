import { useEffect } from "react";
import { timer as api } from "@/services/api";
import { useTimer } from "@/stores/timer";
import { progressAt, remainingAt } from "@/lib/time";
import { useNow } from "./useNow";

/** Timer snapshot plus display-time values and bound actions. */
export function useTimerView(tick = 200) {
  const { snapshot, error, init, run } = useTimer();
  useEffect(() => {
    void init();
  }, [init]);
  const now = useNow(snapshot?.status === "running", tick);
  return {
    snapshot,
    error,
    remaining: snapshot ? remainingAt(snapshot, now) : 0,
    progress: snapshot ? progressAt(snapshot, now) : 0,
    toggle: () => run(api.toggle),
    reset: () => run(api.reset),
    skip: () => run(api.skip),
    run,
  };
}
