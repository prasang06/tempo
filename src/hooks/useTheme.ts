import { useEffect } from "react";
import type { Theme } from "@/types";

export function useTheme(theme: Theme | undefined) {
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => {
      const t = theme ?? "dark";
      root.dataset.theme = t === "system" ? (mq.matches ? "light" : "dark") : t;
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
}
