import { volumeCategory, type TemplateWeek } from "@/lib/strengthTemplates";

/**
 * Final realism guards for generated strength weeks (skips deload/taper weeks):
 * - per-session cap on a competition lift, tighter on heavy low-rep weeks
 * - session cap of 30 total sets, trimming accessories first
 * - weekly floor (6) and ceiling (24) of hard sets for squat, bench and deadlift
 */
const COMP = /^(back squat|bench press|deadlift|sumo deadlift)$/i;
const MAIN_CATS = ["squat", "horizontal-press", "hinge"] as const;
const SESSION_CAP = 30;
const WEEK_FLOOR = 6;
const WEEK_CEIL = 24;
const isLight = (w: TemplateWeek) => /deload|taper|peak|återhämt|toppning/i.test(`${w.label} ${(w as { notes?: string }).notes ?? ""}`);

export function compSetCap(reps: number): number {
  return reps <= 3 ? 6 : reps <= 4 ? 7 : 8;
}

export function applyVolumeGuards(weeks: TemplateWeek[]): TemplateWeek[] {
  return weeks.map((week) => {
    if (isLight(week)) return week;
    const sessions = week.sessions.map((s) => {
      const exercises = s.exercises.map((e) =>
        COMP.test(e.exercise) && e.target_sets > compSetCap(e.target_reps) ? { ...e, target_sets: compSetCap(e.target_reps) } : { ...e },
      );
      let total = exercises.reduce((a, e) => a + e.target_sets, 0);
      while (total > SESSION_CAP) {
        const pool = exercises.filter((e) => !COMP.test(e.exercise) && e.target_sets > 2);
        const target = (pool.length ? pool : exercises.filter((e) => e.target_sets > 3)).sort((a, b) => b.target_sets - a.target_sets)[0];
        if (!target) break;
        target.target_sets -= 1;
        total -= 1;
      }
      return { ...s, exercises };
    });
    for (const cat of MAIN_CATS) {
      const items = sessions.flatMap((s) => s.exercises.filter((e) => volumeCategory(e) === cat).map((e) => ({ s, e })));
      if (!items.length) continue;
      let sum = items.reduce((a, x) => a + x.e.target_sets, 0);
      // Floor: add to competition lifts (then variations) below their cap, in sessions under the cap.
      while (sum < WEEK_FLOOR) {
        const cand = items
          .filter(({ s, e }) => e.target_sets < compSetCap(e.target_reps) && s.exercises.reduce((a, x) => a + x.target_sets, 0) < SESSION_CAP)
          .sort((a, b) => Number(COMP.test(b.e.exercise)) - Number(COMP.test(a.e.exercise)) || a.e.target_sets - b.e.target_sets)[0];
        if (!cand) break;
        cand.e.target_sets += 1;
        sum += 1;
      }
      // Ceiling: trim variations first, never below 2 sets (comp lifts never below 3).
      while (sum > WEEK_CEIL) {
        const cand = items
          .filter(({ e }) => e.target_sets > (COMP.test(e.exercise) ? 3 : 2))
          .sort((a, b) => Number(COMP.test(a.e.exercise)) - Number(COMP.test(b.e.exercise)) || b.e.target_sets - a.e.target_sets)[0];
        if (!cand) break;
        cand.e.target_sets -= 1;
        sum -= 1;
      }
    }
    return { ...week, sessions };
  });
}
