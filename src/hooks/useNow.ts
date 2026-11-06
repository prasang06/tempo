import { useEffect, useState } from "react";

/** Current time, refreshed every `ms` while `active`. Display only — never authoritative. */
export function useNow(active: boolean, ms = 200): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [active, ms]);
  return now;
}

/** Re-renders at local midnight so "today" views roll over. */
export function useToday(): string {
  const key = () => {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  };
  const [day, setDay] = useState(key);
  useEffect(() => {
    const id = window.setInterval(() => {
      const k = key();
      if (k !== day) setDay(k);
    }, 30_000);
    return () => window.clearInterval(id);
  }, [day]);
  return day;
}
