import { pctOf1RMInterp, prescribedWeightKg } from "@/lib/intensity";
import type { TemplateWeek } from "@/lib/strengthTemplates";

export interface HeavySingles { enabled: boolean; rpe: number; weeks: number[] }
const competitionLift = /^(squat|back squat|bench press|bench|deadlift|conventional deadlift|sumo deadlift)$/i;

/** Replace work rather than stacking heavy singles on top of the prescribed volume. */
export function applyCoachSingles(weeks: TemplateWeek[], options: HeavySingles, excluded = false): TemplateWeek[] {
  if (!options.enabled || excluded) return weeks;
  return weeks.map((week) => {
    if (!options.weeks.includes(week.week_index) || /deload|taper|peak|återhämt/i.test(week.label)) return week;
    const used = new Set<string>();
    return { ...week, sessions: week.sessions.map((session) => ({ ...session, exercises: session.exercises.flatMap((e) => {
      const name = e.exercise.toLowerCase().trim();
      const key = /squat/.test(name) ? "squat" : /bench/.test(name) ? "bench" : "deadlift";
      if (!competitionLift.test(name) || used.has(key) || e.target_sets < 3 || e.target_reps <= 1 || /tempo|deficit|technique|variation|touch.and.go|close.grip|wide.grip|board|pin/i.test(e.variation ?? "")) return [e];
      used.add(key);
      const effort = e.intensity_metric === "rir" && e.target_rir != null ? 10 - e.target_rir : e.target_rpe;
      const oneRm = e.target_weight_kg && effort != null
        ? e.target_weight_kg * 100 / pctOf1RMInterp(effort, e.target_reps)
        : null;
      const rpe = Math.max(8, Math.min(9.5, options.rpe));
      return [{ ...e, target_sets: 1, target_reps: 1, target_rpe: rpe, intensity_metric: "rpe" as const,
        target_rir: undefined, lengthened_partials: false, last_set_to_failure: false,
        target_weight_kg: oneRm ? prescribedWeightKg({ oneRmKg: oneRm, reps: 1, metric: "rpe", rpe }) ?? undefined : undefined,
        notes: `Coachvald singel @ RPE ${rpe}. Avbryt om tekniken försämras.`,
      }, { ...e, target_sets: e.target_sets - 2, notes: `${e.notes ?? ""} Två arbetsset ersatta av en tung singel.`.trim() }];
    }) })) };
  });
}