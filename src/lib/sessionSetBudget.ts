import { volumeCategory, type TemplateWeek } from "./strengthTemplates";

const MAIN_CATS = new Set(["squat", "horizontal-press", "hinge"]);

/**
 * Preserve base slots and set ceilings after individualisation.
 * Trims sets (never below 2 per exercise, accessories may go to 1) before
 * dropping exercises, so a time-capped session keeps its full-body spread
 * instead of ending up as only the two competition lifts.
 */
export function applySessionSetBudget(weeks: TemplateWeek[], base: TemplateWeek[], budget: number): TemplateWeek[] {
  return weeks.map((week, wi) => ({ ...week, sessions: week.sessions.map((session, si) => {
    const original = base[wi]?.sessions[si];
    if (!original) return session;
    const exercises = session.exercises.slice(0, original.exercises.length).map((e, ei) => ({
      ...e,
      target_sets: Math.max(1, Math.min(e.target_sets, original.exercises[ei]?.target_sets ?? e.target_sets)),
    }));
    let total = exercises.reduce((a, e) => a + e.target_sets, 0);
    // First trim sets, accessories before main lifts, largest prescriptions
    // first, keeping at least 2 sets (main lifts keep at least 3).
    while (total > budget) {
      const target = exercises
        .filter((e) => e.target_sets > (MAIN_CATS.has(volumeCategory(e)) ? 3 : 2))
        .sort((a, b) => Number(MAIN_CATS.has(volumeCategory(a))) - Number(MAIN_CATS.has(volumeCategory(b))) || b.target_sets - a.target_sets)[0];
      if (!target) break;
      target.target_sets -= 1;
      total -= 1;
    }
    // Still over budget (e.g. tight budget): drop the last exercises entirely.
    const kept = [...exercises];
    while (total > budget && kept.length > 1) {
      total -= kept.pop()!.target_sets;
    }
    return { ...session, exercises: kept };
  }) }));
}
