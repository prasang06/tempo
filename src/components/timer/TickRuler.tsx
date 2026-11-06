import { cx } from "@/components/common/ui";

/**
 * Progress as a row of ticks, like a ruler being filled in. Every fifth tick is taller.
 */
export function TickRuler({
  progress,
  ticks = 50,
  height = 22,
  active = true,
  className,
}: {
  progress: number;
  ticks?: number;
  height?: number;
  active?: boolean;
  className?: string;
}) {
  const filled = Math.round(progress * ticks);
  return (
    <div
      className={cx("flex items-end justify-between", className)}
      style={{ height }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
    >
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const major = i % 5 === 0;
        const on = i < filled || (i === 0 && progress > 0);
        const head = i === filled && progress > 0 && progress < 1;
        return (
          <span
            key={i}
            className={cx(
              "w-px transition-colors duration-300",
              head ? "bg-ink" : on ? (active ? "bg-accent" : "bg-ink-3") : "bg-line-strong",
            )}
            style={{ height: head ? height : major ? height * 0.62 : height * 0.36 }}
          />
        );
      })}
    </div>
  );
}

/** One-pixel line variant for the small overlays. */
export function ProgressLine({ progress, className }: { progress: number; className?: string }) {
  return (
    <div className={cx("h-px w-full bg-line-strong", className)}>
      <div className="h-px bg-accent transition-[width] duration-200" style={{ width: `${progress * 100}%` }} />
    </div>
  );
}
