import type { TemplateWeek } from "@/lib/strengthTemplates";

export const MIN_WORKING_WEEKS = 1;
export const MAX_WORKING_WEEKS = 12;

/** Template default: working weeks and whether it ends in a deload. */
export function templateShape(weeks: TemplateWeek[]): { workingWeeks: number; deload: boolean } {
  const working = weeks.filter((w) => w.kind !== "deload").length;
  return { workingWeeks: Math.max(1, working), deload: weeks.some((w) => w.kind === "deload") };
}

/**
 * Resize a template to the coach's chosen length. Working weeks repeat the
 * template's own wave (1→2→3→1→2→3…) so effort never climbs past the
 * template's hardest week; shorter blocks keep the first weeks. The deload
 * is the template's own deload week, added last only when the coach wants it.
 */
export function resizeTemplateWeeks(weeks: TemplateWeek[], workingWeeks: number, deload: boolean): TemplateWeek[] {
  const working = weeks.filter((w) => w.kind !== "deload");
  if (working.length === 0) return weeks;
  const n = Math.max(MIN_WORKING_WEEKS, Math.min(MAX_WORKING_WEEKS, Math.round(workingWeeks)));
  const out: TemplateWeek[] = Array.from({ length: n }, (_, i) => {
    const src = working[i % working.length];
    const wave = Math.floor(i / working.length) + 1;
    return {
      ...structuredClone(src),
      week_index: i + 1,
      label: wave > 1 ? `${src.label} · våg ${wave}` : src.label,
    };
  });
  const deloadWeek = weeks.find((w) => w.kind === "deload");
  if (deload) {
    const base = deloadWeek ? structuredClone(deloadWeek) : lightWeek(working[working.length - 1]);
    out.push({ ...base, week_index: n + 1 });
  }
  return out;
}

/** Fallback deload when a template has none: one set fewer and RPE −1.5 on everything. */
function lightWeek(w: TemplateWeek): TemplateWeek {
  const copy = structuredClone(w);
  return {
    ...copy,
    kind: "deload",
    label: "Avlastning",
    sessions: copy.sessions.map((s) => ({
      ...s,
      exercises: s.exercises.map((e) => ({
        ...e,
        target_sets: Math.max(1, e.target_sets - 1),
        ...(typeof e.target_rpe === "number" ? { target_rpe: Math.max(5, e.target_rpe - 1.5) } : {}),
      })),
    })),
  };
}
