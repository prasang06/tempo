import { Check, Minus, Plus } from "lucide-react";
import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "ghost" | "outline" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-hover font-medium",
  ghost: "text-ink-2 hover:text-ink hover:bg-hover",
  outline: "border border-line-strong text-ink hover:bg-hover",
  danger: "border border-line-strong text-danger hover:bg-hover",
};

export function Button({
  variant = "outline",
  size = "md",
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-sm transition-colors disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap",
        size === "sm" ? "h-7 px-2.5 text-[12.5px]" : "h-8 px-3 text-[13px]",
        VARIANTS[variant],
        className,
      )}
      {...rest}
    />
  );
}

export function IconButton({
  label,
  className,
  active,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex size-7 items-center justify-center rounded-sm transition-colors disabled:opacity-40 disabled:pointer-events-none",
        active ? "text-accent bg-accent-soft" : "text-ink-3 hover:text-ink hover:bg-hover",
        className,
      )}
      {...rest}
    />
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={cx(
        "grid size-[15px] shrink-0 place-items-center rounded-[3px] border transition-colors",
        checked ? "border-accent bg-accent text-accent-ink" : "border-line-strong hover:border-ink-3",
        className,
      )}
    >
      {checked && <Check size={11} strokeWidth={3} />}
    </button>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative h-[18px] w-[30px] shrink-0 rounded-full border transition-colors",
        checked ? "border-accent bg-accent" : "border-line-strong bg-transparent",
      )}
    >
      <span
        className={cx(
          "absolute top-[2px] size-3 rounded-full transition-all",
          checked ? "left-[14px] bg-accent-ink" : "left-[2px] bg-ink-3",
        )}
      />
    </button>
  );
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cx(
        "h-8 rounded-sm border border-line-strong bg-surface px-2 text-[13px] text-ink outline-none hover:border-ink-3 focus:border-accent",
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  label: string;
}) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, v)));
  // Typing is local; the value is committed on Enter or blur, not on every keystroke.
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(n)) setDraft(String(value));
    else if (Math.round(n) !== value) set(Math.round(n));
    else setDraft(String(value));
  };
  return (
    <div className="inline-flex h-8 items-center rounded-sm border border-line-strong" aria-label={label}>
      <button type="button" aria-label={`decrease ${label}`} className="grid h-full w-7 place-items-center text-ink-3 hover:text-ink disabled:opacity-30" disabled={value <= min} onClick={() => set(value - step)}>
        <Minus size={12} />
      </button>
      <input
        aria-label={label}
        className="num h-full w-10 bg-transparent text-center text-[12px] outline-none"
        value={draft}
        inputMode="numeric"
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(String(value));
            e.currentTarget.blur();
          }
        }}
      />
      {suffix && <span className="pr-1 text-[11px] text-ink-3">{suffix}</span>}
      <button type="button" aria-label={`increase ${label}`} className="grid h-full w-7 place-items-center text-ink-3 hover:text-ink disabled:opacity-30" disabled={value >= max} onClick={() => set(value + step)}>
        <Plus size={12} />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "md",
}: {
  value: T;
  options: { value: T; label: ReactNode; hint?: string }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex rounded-sm border border-line p-[2px]" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          title={o.hint}
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "rounded-[3px] transition-colors",
            size === "sm" ? "h-6 px-2 text-[12px]" : "h-7 px-2.5 text-[12.5px]",
            value === o.value ? "bg-elevated text-ink shadow-[inset_0_0_0_1px_var(--line-strong)]" : "text-ink-3 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="num inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[3px] border border-line-strong px-1 text-[9.5px] text-ink-3">
      {children}
    </kbd>
  );
}

/** The brand mark: a short accent bar beside the wordmark. */
export function Wordmark({ size = 15 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-[7px] font-semibold tracking-[-0.03em]" style={{ fontSize: size }}>
      <span className="inline-block w-[3px] rounded-[1px] bg-accent" style={{ height: size * 0.95 }} />
      tempo
    </span>
  );
}

export function ErrorNote({ message, onDismiss }: { message: string | null; onDismiss?: () => void }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex items-start justify-between gap-3 border-l-2 border-danger bg-surface px-3 py-2 text-[12.5px] text-ink-2">
      <span>{message}</span>
      {onDismiss && (
        <button type="button" className="text-ink-3 hover:text-ink" onClick={onDismiss}>
          Dismiss
        </button>
      )}
    </div>
  );
}

export function PageHeader({ title, meta, children }: { title: ReactNode; meta?: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-6 border-b border-line px-8 pb-4 pt-7">
      <div className="min-w-0">
        <h1 className="display text-[26px]">{title}</h1>
        {meta && <div className="mt-1 text-[13px] text-ink-3">{meta}</div>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </header>
  );
}
