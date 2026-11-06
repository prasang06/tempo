import { addDays, dayKey } from "./dates";

/**
 * Parses the quick-add line. Everything that isn't a token is the title.
 *   ~45m ~1h ~1h30   estimate
 *   !h !m !l         priority high / medium / low
 *   #name            project (matched by name, created if new)
 *   @today @tomorrow @mon … @sun @2026-11-12   scheduled day
 */
export interface Parsed {
  title: string;
  estimateMin: number | null;
  priority: number | null;
  project: string | null;
  scheduledDate: string | null;
}

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function parseEstimate(raw: string): number | null {
  const m = /^(?:(\d+)h)?(?:(\d+)m?)?$/.exec(raw);
  if (!m || (!m[1] && !m[2])) return null;
  const mins = Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
  return mins > 0 && mins <= 24 * 60 ? mins : null;
}

function parseDay(raw: string, now: Date): string | null {
  const v = raw.toLowerCase();
  if (v === "today" || v === "tod") return dayKey(now);
  if (v === "tomorrow" || v === "tom") return dayKey(addDays(now, 1));
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const idx = DAYS.findIndex((d) => v.startsWith(d) && v.length <= 9);
  if (idx >= 0) {
    // Next occurrence, never today.
    const delta = ((idx - now.getDay() + 7) % 7) || 7;
    return dayKey(addDays(now, delta));
  }
  return null;
}

export function parseQuickAdd(input: string, now = new Date()): Parsed {
  const out: Parsed = { title: "", estimateMin: null, priority: null, project: null, scheduledDate: null };
  const words: string[] = [];
  for (const word of input.trim().split(/\s+/)) {
    if (!word) continue;
    const sigil = word[0];
    const rest = word.slice(1);
    if (sigil === "~" && rest) {
      const e = parseEstimate(rest.toLowerCase());
      if (e !== null) {
        out.estimateMin = e;
        continue;
      }
    } else if (sigil === "!" && rest) {
      const p = { h: 3, high: 3, m: 2, med: 2, medium: 2, l: 1, low: 1 }[rest.toLowerCase()];
      if (p !== undefined) {
        out.priority = p;
        continue;
      }
    } else if (sigil === "#" && rest) {
      out.project = rest.replace(/[-_]/g, " ");
      continue;
    } else if (sigil === "@" && rest) {
      const d = parseDay(rest, now);
      if (d) {
        out.scheduledDate = d;
        continue;
      }
    }
    words.push(word);
  }
  out.title = words.join(" ");
  return out;
}
