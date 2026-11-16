/**
 * Last generator step before saving (after push): makes the light weeks agree
 * with themselves and gives every RPE/RIR row a suggested weight when the
 * athlete has a usable max.
 *
 * - Ramp-in weeks: no row above RPE 7 and no partials/failure, so rows added
 *   after individualisation (weak points, byggövning) follow the lighter week.
 * - Deload weeks: no partials/failure, and no exercise gets more sets than it
 *   has in the working weeks.
 * - Suggested weights: own max/history for the exact lift first, then a
 *   conservative share of the competition lift's max for known variations.
 *   Rows with a weight, percent rows and push rows are never touched.
 */
import { resolveVariantExercise, exerciseNameKey } from "@/lib/exerciseVariants";
import { isCompLift } from "@/lib/liftIdentity";
import { prescribedWeightKg } from "@/lib/intensity";
import { matchBaseline, type HistBaseline } from "@/lib/individualisation";
import type { TemplateExercise, TemplateWeek } from "@/lib/strengthTemplates";
import { BUILDER_LAST_SET_RPE, BUILDER_RPE } from "@/lib/builderExercises";

export const RAMP_RPE_CEILING = 7;

type Push = TemplateExercise & { push_main?: boolean; push_lift?: string | null };

function rampBuilderNotes(notes: string | undefined, rpe: number): string | undefined {
  if (!notes) return notes;
  return notes.replace(
    `Mål-RPE ${BUILDER_RPE} på alla set utom sista, som har RPE ${BUILDER_LAST_SET_RPE}.`,
    `Mål-RPE ${String(rpe).replace(".", ",")} på alla set utom sista, som har RPE ${String(rpe + 1).replace(".", ",")} (uppstartsvecka).`,
  );
}

export function finishLightWeeks(weeks: TemplateWeek[], rampWeeks: number): TemplateWeek[] {
  // Highest weekly set count per exercise across working weeks.
  const workingSets = new Map<string, number>();
  for (const w of weeks) {
    if (w.kind !== "working") continue;
    const perWeek = new Map<string, number>();
    for (const s of w.sessions) for (const e of s.exercises) {
      const k = exerciseNameKey(e.exercise);
      perWeek.set(k, Math.max(perWeek.get(k) ?? 0, e.target_sets));
    }
    for (const [k, n] of perWeek) workingSets.set(k, Math.max(workingSets.get(k) ?? 0, n));
  }
  let workingIndex = 0;
  return weeks.map((w) => {
    const ramp = w.kind === "working" && workingIndex++ < rampWeeks;
    const deload = w.kind === "deload";
    if (!ramp && !deload) return w;
    return {
      ...w,
      sessions: w.sessions.map((s) => ({
        ...s,
        exercises: s.exercises.map((src) => {
          const e = { ...src } as Push;
          e.lengthened_partials = false;
          e.last_set_to_failure = false;
          if (deload) {
            const max = workingSets.get(exerciseNameKey(e.exercise));
            if (max != null && e.target_sets > max) e.target_sets = max;
          }
          if (ramp && !e.push_main && !isCompLift(e.exercise, e.variation) && e.target_rpe != null && e.target_rpe > RAMP_RPE_CEILING) {
            e.target_rpe = RAMP_RPE_CEILING;
            if (e.target_pct == null) e.target_weight_kg = undefined; // recomputed below at the lower RPE
            if (e.builder_lift) e.notes = rampBuilderNotes(e.notes, RAMP_RPE_CEILING);
          }
          return e;
        }),
      })),
    };
  });
}

type Parent = "squat" | "bench" | "deadlift";
/** Conservative share of the competition max for common variations. */
const VARIANT_SHARE: Array<[RegExp, Parent, number]> = [
  [/pause(d)? squat|squat .*pause/, "squat", 0.85],
  [/tempo squat/, "squat", 0.8],
  [/front squat/, "squat", 0.8],
  [/high bar squat/, "squat", 0.95],
  [/low bar squat/, "squat", 1],
  [/box squat/, "squat", 0.9],
  [/pin squat/, "squat", 0.85],
  [/safety bar|ssb/, "squat", 0.9],
  [/1[.,]5 rep squat/, "squat", 0.8],
  [/spoto/, "bench", 0.9],
  [/long pause bench/, "bench", 0.92],
  [/close grip bench/, "bench", 0.9],
  [/touch and go bench/, "bench", 1],
  [/larsen/, "bench", 0.9],
  [/tempo bench/, "bench", 0.85],
  [/pin press/, "bench", 0.95],
  [/feet up bench/, "bench", 0.92],
  [/floor press/, "bench", 0.9],
  [/^incline bench/, "bench", 0.8],
  [/1[.,]5 rep bench/, "bench", 0.8],
  [/deficit deadlift/, "deadlift", 0.9],
  [/pause deadlift/, "deadlift", 0.85],
  [/snatch grip deadlift/, "deadlift", 0.85],
  [/double overhand deadlift/, "deadlift", 0.9],
  [/block pull|rack pull/, "deadlift", 1],
  [/romanian deadlift|\brdl\b|stiff leg/, "deadlift", 0.7],
];

function parentBaseline(parent: Parent, e: TemplateExercise, baselines: HistBaseline[], style: "sumo" | "conventional" | null): HistBaseline | undefined {
  if (parent === "squat") return matchBaseline({ exercise: "Squat" }, baselines);
  if (parent === "bench") return matchBaseline({ exercise: "Bench press" }, baselines);
  const text = `${e.exercise} ${e.variation ?? ""}`.toLowerCase();
  const stance = /sumo/.test(text) ? "sumo" : /conventional|konventionell/.test(text) ? "conventional" : style;
  if (stance === "sumo") return matchBaseline({ exercise: "Sumo deadlift" }, baselines) ?? matchBaseline({ exercise: "Deadlift" }, baselines);
  return matchBaseline({ exercise: "Conventional deadlift" }, baselines);
}

/** Estimated max for a row: own baseline/history first, then a share of the comp lift. */
export function suggestedOneRm(e: TemplateExercise, baselines: HistBaseline[], style: "sumo" | "conventional" | null = null): number | null {
  const own = matchBaseline(e, baselines);
  if (own) return Number(own.one_rm_kg);
  const key = exerciseNameKey(resolveVariantExercise(e.exercise, e.variation).exercise);
  const hit = VARIANT_SHARE.find(([re]) => re.test(key));
  if (!hit) return null;
  const parent = parentBaseline(hit[1], e, baselines, style);
  return parent ? Number(parent.one_rm_kg) * hit[2] : null;
}

export function fillSuggestedLoads(weeks: TemplateWeek[], baselines: HistBaseline[], style: "sumo" | "conventional" | null = null): TemplateWeek[] {
  if (!baselines.length) return weeks;
  return weeks.map((w) => ({
    ...w,
    sessions: w.sessions.map((s) => ({
      ...s,
      exercises: s.exercises.map((src) => {
        const e = src as Push;
        if (e.target_weight_kg != null && e.target_weight_kg > 0) return e;
        if (e.target_pct != null || e.push_main || e.push_lift) return e;
        if (e.target_reps <= 0 || e.target_reps > 15) return e;
        const oneRm = suggestedOneRm(e, baselines, style);
        if (!oneRm) return e;
        const kg = prescribedWeightKg({ oneRmKg: oneRm, reps: e.target_reps, metric: e.intensity_metric, rpe: e.target_rpe ?? null, rir: e.target_rir ?? null });
        return kg != null && kg > 0 ? { ...e, target_weight_kg: kg } : e;
      }),
    })),
  }));
}
