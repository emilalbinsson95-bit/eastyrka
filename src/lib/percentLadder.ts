import { pctOf1RMInterp } from "./intensity";
import { compLiftKey, type CompLift } from "./liftIdentity";
import { metricLiftKey } from "./liftMetrics";
import type { TemplateExercise, TemplateWeek } from "./strengthTemplates";

/**
 * Procenttrappa (steg 9, AE-typ): a main lift in an ordinary block can be steered
 * by percent instead of RPE. The week's heaviest day ramps 50/60/67.5 % to top
 * sets on a weekly wave; the lift's other days get 62.5 % 5 × 4 and keep their
 * variant. Deload weeks get 70 % with half the sets. Other lifts are untouched.
 */
export type LadderChoices = Partial<Record<CompLift, boolean>>;
/** Per working-week top-set percent set by the coach (week_index → pct). */
export type LadderOverrides = Partial<Record<CompLift, Record<number, number>>>;

export const LADDER_WAVE = [70, 75, 80, 85];
export const LADDER_RAMP: Array<[number, number]> = [[50, 5], [60, 4], [67.5, 3]];
export const LADDER_OTHER_DAY = { pct: 62.5, sets: 5, reps: 4 };
export const LADDER_DELOAD_PCT = 70;
const TOP_TABLE: Array<{ pct: number; sets: number; reps: number }> = [
  { pct: 70, sets: 5, reps: 5 }, { pct: 75, sets: 5, reps: 4 }, { pct: 80, sets: 5, reps: 3 }, { pct: 85, sets: 4, reps: 2 }, { pct: 90, sets: 3, reps: 1 },
];
export const LADDER_NOTE_RAMP = "Procenttrappa · upptrappning";
export const LADDER_NOTE_TOP = "Procenttrappa · toppset";
export const LADDER_NOTE_OTHER = "Procenttrappa · lättare dag";

/** Sets × reps for a top-set percent: nearest lower table row. */
export function ladderTopSets(pct: number): { sets: number; reps: number } {
  const row = [...TOP_TABLE].reverse().find((r) => pct >= r.pct) ?? TOP_TABLE[0];
  return { sets: row.sets, reps: row.reps };
}

/** Wave percent for the n:th working week (1-based); longer blocks restart 2.5 points higher. */
export function ladderWavePct(workingWeek: number): number {
  const i = Math.max(1, workingWeek) - 1;
  return LADDER_WAVE[i % LADDER_WAVE.length] + 2.5 * Math.floor(i / LADDER_WAVE.length);
}

const rowIntensity = (e: TemplateExercise) => {
  const rpe = e.target_rpe ?? (e.target_rir != null ? 10 - e.target_rir : 7);
  return e.target_pct ?? pctOf1RMInterp(rpe, e.target_reps);
};

const isLadderRow = (e: TemplateExercise, lift: CompLift) => !e.builder_lift && metricLiftKey(e.exercise, e.variation) === lift;

export function applyPercentLadder(weeks: TemplateWeek[], choices: LadderChoices, opts: { overrides?: LadderOverrides; topSetScale?: number } = {}): TemplateWeek[] {
  const lifts = (Object.keys(choices) as CompLift[]).filter((l) => choices[l]);
  if (!lifts.length) return weeks;
  const scale = opts.topSetScale ?? 1;
  let working = 0;
  return weeks.map((week) => {
    if (week.kind === "peak" || week.kind === "taper" || week.kind === "ramp") return week;
    if (week.kind === "working") working += 1;
    let sessions = week.sessions.map((s) => ({ ...s, exercises: [...s.exercises] }));
    for (const lift of lifts) {
      if (week.kind === "deload") {
        sessions = sessions.map((s) => ({ ...s, exercises: s.exercises.map((e) => isLadderRow(e, lift)
          ? { ...e, target_pct: LADDER_DELOAD_PCT, target_sets: Math.max(1, Math.ceil(e.target_sets / 2)), target_rpe: undefined, target_rir: undefined, intensity_metric: "rpe" as const, target_weight_kg: undefined }
          : e) }));
        continue;
      }
      // Heaviest day: the session whose competition row has the highest intensity.
      let heavy = -1; let best = -Infinity;
      sessions.forEach((s, si) => s.exercises.forEach((e) => {
        if (!isLadderRow(e, lift) || compLiftKey(e.exercise) !== lift) return;
        const v = rowIntensity(e);
        if (v > best) { best = v; heavy = si; }
      }));
      if (heavy < 0) continue;
      const top = opts.overrides?.[lift]?.[week.week_index] ?? ladderWavePct(working);
      const { sets: topSets, reps: topReps } = ladderTopSets(top);
      sessions = sessions.map((s, si) => {
        let replaced = false;
        const exercises = s.exercises.flatMap((e): TemplateExercise[] => {
          if (!isLadderRow(e, lift)) return [e];
          const base = { ...e, target_rpe: undefined, target_rir: undefined, intensity_metric: "rpe" as const, target_weight_kg: undefined };
          if (si === heavy && !replaced && compLiftKey(e.exercise) === lift) {
            replaced = true;
            const ramp = LADDER_RAMP.filter(([pct]) => top - pct >= 5).map(([pct, reps]) => ({ ...base, target_sets: 1, target_reps: reps, target_pct: pct, notes: LADDER_NOTE_RAMP }));
            return [...ramp, { ...base, target_sets: Math.max(1, Math.round(topSets * scale)), target_reps: topReps, target_pct: top, notes: LADDER_NOTE_TOP }];
          }
          return [{ ...base, target_sets: LADDER_OTHER_DAY.sets, target_reps: LADDER_OTHER_DAY.reps, target_pct: LADDER_OTHER_DAY.pct, notes: LADDER_NOTE_OTHER }];
        });
        return { ...s, exercises };
      });
    }
    return { ...week, sessions };
  });
}

/** Push lifts that cannot run alongside a ladder on the same lift. */
export const ladderBlocksPush = (choices: LadderChoices, pushLift: string) =>
  !!choices[(pushLift === "sumo" || pushLift === "conventional" ? "deadlift" : pushLift) as CompLift];
