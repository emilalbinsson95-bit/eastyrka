import { volumeCategory, type TemplateExercise, type TemplateWeek } from "./strengthTemplates";
import { exercisePriority } from "./weakPoints";

const MAIN_CATS = new Set(["squat", "horizontal-press", "hinge"]);

const normName = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");

/**
 * Preserve base slots and set ceilings after individualisation.
 * Exercises are matched to the base template by normalized exercise name —
 * never by array index, since weak-point work may have reordered or added
 * exercises. Trims sets (never below 2 per exercise, accessories may go to 1)
 * before dropping exercises, so a time-capped session keeps its full-body
 * spread instead of ending up as only the two competition lifts.
 *
 * Exercises added on top of the base template (e.g. by weakPoints) are kept
 * while the session is within budget; when something must go, the
 * lowest-priority added exercise (weakPoints.exercisePriority) is dropped
 * first.
 */
export function applySessionSetBudget(weeks: TemplateWeek[], base: TemplateWeek[], budget: number): TemplateWeek[] {
  return weeks.map((week, wi) => ({ ...week, sessions: week.sessions.map((session, si) => {
    const original = base[wi]?.sessions[si];
    if (!original) return session;
    const baseByName = new Map(original.exercises.map((e) => [normName(e.exercise), e]));
    const exercises = session.exercises.map((e) => {
      const b = baseByName.get(normName(e.exercise));
      return {
        ...e,
        target_sets: Math.max(1, Math.min(e.target_sets, b?.target_sets ?? e.target_sets)),
      };
    });
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
    // Still over budget (e.g. tight budget): drop exercises entirely —
    // lowest-priority added exercises first, then the lowest-priority base
    // exercises, so the competition lifts survive.
    const kept = [...exercises];
    while (total > budget && kept.length > 1) {
      const added = kept.filter((e) => !baseByName.has(normName(e.exercise)));
      const pool = added.length ? added : kept;
      const victim = pool.sort((a, b) => exercisePriority(a) - exercisePriority(b))[0];
      kept.splice(kept.indexOf(victim), 1);
      total -= victim.target_sets;
    }
    return { ...session, exercises: kept };
  }) }));
}
