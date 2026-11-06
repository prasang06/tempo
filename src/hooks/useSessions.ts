import { useCallback, useEffect, useState } from "react";
import { EVENTS, errorMessage, on, sessions as api } from "@/services/api";
import type { SessionRow } from "@/types";

/** Sessions overlapping [from, to), kept fresh as sessions are recorded. */
export function useSessions(from: number, to: number) {
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.list(from, to).then(
      (r) => {
        setRows(r);
        setError(null);
      },
      (e) => setError(errorMessage(e)),
    );
  }, [from, to]);

  useEffect(() => {
    load();
    const off = on(EVENTS.sessions, load);
    return () => void off.then((f) => f());
  }, [load]);

  return { rows, error, reload: load };
}
