import { competitionExerciseName } from "./liftIdentity";
import { isReadinessLift } from "./eakoefficient";
import { prescribedWeightKg, pctOf1RMInterp } from "./intensity";
import type { TemplateExercise, TemplateWeek } from "./strengthTemplates";

export const PUSH_RULES_VERSION = "push-1.0";
export const PUSH_LIFTS = ["squat", "bench", "conventional", "sumo"] as const;
export type PushLift = typeof PUSH_LIFTS[number];
export const PUSH_LABELS: Record<PushLift, string> = { squat: "Knäböj", bench: "Bänkpress", conventional: "Konventionellt marklyft", sumo: "Sumomarklyft" };
export const PUSH_STEPS: Record<PushLift, number> = { squat: 1.5, bench: 1.25, conventional: 2, sumo: 2 };
export interface PushConfig { lift: PushLift; enabled: boolean; plan_e1rm: number; step_pct: number; rounding_kg: number; main_sets: number; main_reps: number; main_rpe: number; paused_reason?: string | null }
export type PushExercise = TemplateExercise & { push_lift?: PushLift; push_main?: boolean; push_load_pct?: number; plan_e1rm_used?: number };
export function pushLift(exercise: string, variation?: string | null, genericStyle?: "conventional" | "sumo" | null): PushLift | null {
  if (!isReadinessLift(exercise, variation)) return null;
  const name = competitionExerciseName(exercise, variation);
  if (name === "Back squat") return "squat";
  if (name === "Bench press") return "bench";
  if (name === "Sumo deadlift") return "sumo";
  if (name === "Conventional deadlift") return "conventional";
  return name === "Deadlift" ? genericStyle ?? null : null;
}

/** Replaces only the main prescription; it never adds sets to a guarded plan. */
export function applyPushProgression(weeks: TemplateWeek[], configs: PushConfig[], style?: "conventional" | "sumo" | null, rampWeeks = 0): TemplateWeek[] {
  const active = configs.filter(c => c.enabled && c.plan_e1rm > 0);
  const ceilings = new Map<PushLift, number>();
  for (const c of active) {
    const first = weeks.filter(w => w.kind === "working" && w.week_index > rampWeeks).map(w => w.sessions.flatMap(s => s.exercises).find(e => e.target_reps > 1 && pushLift(e.exercise, e.variation, style) === c.lift));
    if (first.length && first.every(e => e != null)) ceilings.set(c.lift, Math.min(c.main_sets, ...first.map(e => e?.target_sets ?? 0)));
  }
  return weeks.map(w => {
    if (w.kind === "peak" || w.kind === "taper" || w.kind === "ramp" || w.week_index <= rampWeeks) return w;
    const picked = new Set<PushLift>();
    return { ...w, sessions: [...w.sessions].sort((a,b) => a.day_of_week-b.day_of_week).map(s => ({ ...s, exercises: s.exercises.map(e => {
      const lift = pushLift(e.exercise, e.variation, style);
      const c = active.find(c => c.lift === lift);
      if (!c || !lift) return e;
      const main = w.kind === "working" && e.target_reps > 1 && !picked.has(lift) && (ceilings.get(lift) ?? 0) > 0;
      if (main) picked.add(lift);
      const reps = main ? c.main_reps : e.target_reps;
      const rpe = main ? c.main_rpe : e.target_rpe ?? (e.target_rir != null ? 10-e.target_rir : null);
      if (rpe == null) return e;
      const weight = prescribedWeightKg({ oneRmKg: c.plan_e1rm, reps, metric: "rpe", rpe, roundTo: c.rounding_kg });
      return { ...e, target_sets: main ? ceilings.get(lift) ?? e.target_sets : e.target_sets, target_reps: reps, target_rpe: rpe, target_rir: undefined, intensity_metric: "rpe", target_weight_kg: weight ?? undefined, push_lift: lift, push_main: main, push_load_pct: pctOf1RMInterp(rpe,reps)/100, plan_e1rm_used: c.plan_e1rm } satisfies PushExercise;
    }) })) };
  });
}

export type PushDecision = "push" | "hold" | "miss" | "reset" | "skip" | "paused" | "none";
export interface PushEvidence { confirmed: boolean; prescribedReps: number; prescribedKg: number; reps: number; kg: number }
export function decidePush(input: { plan: number; start: number; step: number; misses: number; sets: PushEvidence[]; expectedSets: number; cooldownDays?: number; phase?: string; paused?: boolean; eak?: number; protocolReduced?: boolean; fatigueStopped?: boolean }) {
  const out = (decision: PushDecision, reason: string, after = input.plan, misses = input.misses) => ({ decision, reason, after, misses });
  if (["deload","ramp"].includes(input.phase ?? "")) return out("none","light_phase");
  if (["peak","taper"].includes(input.phase ?? "") || input.paused) return out("paused","peaking_or_coach_pause");
  if ((input.cooldownDays ?? 5) < 5) return out("none","cooldown");
  if (input.eak != null && input.eak > 0 && input.eak < 92) return out("hold","eak_below_92");
  if (input.protocolReduced) return out("hold","protocol_reduction");
  const miss = () => input.misses >= 1 ? out("reset","second_miss",input.plan*0.95,0) : out("miss","missed_reps",input.plan,input.misses+1);
  if (input.fatigueStopped) return miss();
  if (input.sets.length !== input.expectedSets || input.sets.some(s => !s.confirmed || Math.abs(s.kg-s.prescribedKg)>0.001)) return out("skip","incomplete_or_changed_load");
  if (input.sets.some(s => s.reps < s.prescribedReps)) return miss();
  const next = input.plan*(1+input.step/100);
  if (next > input.start*1.06+1e-9) return out("hold","block_cap");
  return out("push","all_main_sets_completed",next,0);
}