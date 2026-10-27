import { volumeCategory, type TemplateWeek } from "@/lib/strengthTemplates";
import { compLiftKey } from "@/lib/liftIdentity";
import { DEFAULT_STRENGTH_VOLUME, volumeFactorForCategory, type StrengthVolumeProfile } from "@/lib/strengthVolumeProfile";

/**
 * Final realism guards for generated strength weeks (skips deload/taper weeks):
 * - per-session cap on a competition lift, tighter on heavy low-rep weeks
 * - session cap of 30 total sets, trimming accessories first
 * - weekly floor (6) and ceiling (24) of hard sets for squat, bench and deadlift
 */
const MAIN_CATS = ["squat", "horizontal-press", "hinge"] as const;
const SESSION_CAP = 30;
const WEEK_FLOOR = 6;
const WEEK_CEIL = 24;
/** Over-warm / opener singles are neural practice — never topped up by floors. */
const SINGLE_VARIATION = /^(over-warm single|opener single)$/i;
const isComp = (exercise: string) => compLiftKey(exercise) !== null;
const isLight = (w: TemplateWeek) =>
  w.kind === "deload" || w.kind === "taper" || w.kind === "peak" ||
  /löparstyrka/i.test(`${w.label} ${(w as { notes?: string }).notes ?? ""}`);

export function compSetCap(reps: number): number {
  return reps <= 3 ? 8 : reps <= 4 ? 7 : 6;
}

export function applyVolumeGuards(weeks: TemplateWeek[], profile: StrengthVolumeProfile = DEFAULT_STRENGTH_VOLUME): TemplateWeek[] {
  return weeks.map((week) => {
    const skipFloors = isLight(week);
    const sessions = week.sessions.map((s) => {
      const exercises = s.exercises.map((e) =>
        isComp(e.exercise) && e.target_sets > compSetCap(e.target_reps) ? { ...e, target_sets: compSetCap(e.target_reps) } : { ...e },
      );
      let total = exercises.reduce((a, e) => a + e.target_sets, 0);
      while (total > SESSION_CAP) {
        const pool = exercises.filter((e) => !isComp(e.exercise) && e.target_sets > 0);
        const target = (pool.length ? pool : exercises.filter((e) => e.target_sets > 0)).sort((a, b) => b.target_sets - a.target_sets)[0];
        if (!target) break;
        target.target_sets -= 1;
        total -= 1;
      }
      return { ...s, exercises: exercises.filter(e => e.target_sets > 0) };
    });
    for (const cat of MAIN_CATS) {
      const factor = volumeFactorForCategory(cat, profile);
      const floorSets = skipFloors ? 0 : Math.round(WEEK_FLOOR * Math.min(1, factor));
      const ceilSets = Math.round(WEEK_CEIL * factor);
      const items = sessions.flatMap((s) => s.exercises.filter((e) => volumeCategory(e) === cat).map((e) => ({ s, e })));
      if (!items.length) continue;
      let sum = items.reduce((a, x) => a + x.e.target_sets, 0);
      // Floor: add to competition lifts (then variations) below their cap, in sessions under the cap.
      // Singles (over-warm / opener) are excluded — they stay at 1 set.
      while (sum < floorSets) {
        const cand = items
          .filter(({ s, e }) => !SINGLE_VARIATION.test(e.variation ?? "") && e.target_sets < compSetCap(e.target_reps) && s.exercises.reduce((a, x) => a + x.target_sets, 0) < SESSION_CAP)
          .sort((a, b) => Number(isComp(b.e.exercise)) - Number(isComp(a.e.exercise)) || a.e.target_sets - b.e.target_sets)[0];
        if (!cand) break;
        cand.e.target_sets += 1;
        sum += 1;
      }
      // Ceiling: trim variations first, never below 2 sets (comp lifts never below 3).
      while (sum > ceilSets) {
        const cand = items
          .filter(({ e }) => e.target_sets > (isComp(e.exercise) ? 3 : 2))
          .sort((a, b) => Number(isComp(a.e.exercise)) - Number(isComp(b.e.exercise)) || b.e.target_sets - a.e.target_sets)[0];
        if (!cand) break;
        cand.e.target_sets -= 1;
        sum -= 1;
      }
    }
    return { ...week, sessions };
  });
}
