import { X } from "lucide-react";
import { useEffect } from "react";
import { IconButton, Kbd } from "@/components/common/ui";

const GROUPS: { title: string; keys: [string, string][] }[] = [
  {
    title: "Anywhere",
    keys: [
      ["1 – 5", "Switch section"],
      ["?", "This help"],
    ],
  },
  {
    title: "Focus",
    keys: [
      ["Space", "Start · pause · resume"],
      ["R", "Reset session"],
      ["S", "Skip to next"],
      ["N", "New task"],
    ],
  },
  {
    title: "Task lists",
    keys: [
      ["J / K", "Move selection"],
      ["X", "Toggle done"],
      ["F", "Focus on task"],
      ["E / Enter", "Edit"],
      ["Alt + Up / Down", "Reorder"],
      ["Del", "Delete"],
      ["Esc", "Clear selection"],
    ],
  },
];

export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "?") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-bg/70" onClick={onClose}>
      <div role="dialog" aria-label="Keyboard shortcuts" className="w-[520px] rounded-md border border-line-strong bg-surface" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <span className="display text-[16px]">Keyboard</span>
          <IconButton label="Close" onClick={onClose}>
            <X size={15} />
          </IconButton>
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-5 px-5 py-4">
          {GROUPS.map((g) => (
            <section key={g.title} className={g.title === "Task lists" ? "row-span-2" : ""}>
              <h3 className="label mb-2">{g.title}</h3>
              <dl className="space-y-1.5">
                {g.keys.map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-3 text-[12.5px]">
                    <dt className="text-ink-2">{v}</dt>
                    <dd>
                      <Kbd>{k}</Kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <p className="border-t border-line px-5 py-3 text-[12px] text-ink-3">Global shortcuts are listed and editable in Settings → Shortcuts.</p>
      </div>
    </div>
  );
}
