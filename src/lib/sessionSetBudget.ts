import type { TemplateWeek } from "./strengthTemplates";

/** Preserve base slots and set ceilings after individualisation. */
export function applySessionSetBudget(weeks: TemplateWeek[], base: TemplateWeek[], budget: number): TemplateWeek[] {
  return weeks.map((week, wi) => ({ ...week, sessions: week.sessions.map((session, si) => {
    const original = base[wi]?.sessions[si];
    if (!original) return session;
    let remaining = budget;
    const exercises = session.exercises.slice(0, original.exercises.length).flatMap((e, ei) => {
      if (remaining <= 0) return [];
      const ceiling = original.exercises[ei]?.target_sets ?? e.target_sets;
      const target_sets = Math.max(1, Math.min(e.target_sets, ceiling, remaining));
      remaining -= target_sets;
      return [{ ...e, target_sets }];
    });
    return { ...session, exercises };
  }) }));
}