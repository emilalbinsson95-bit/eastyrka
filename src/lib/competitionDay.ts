import type { CompLift } from "./liftIdentity";
import type { PeakAttempt, PeakAttempts } from "./taperFollowup";

export const MEET_LIFTS: CompLift[] = ["squat", "bench", "deadlift"];
export const MEET_LIFT_LABEL: Record<CompLift, string> = { squat: "Knäböj", bench: "Bänkpress", deadlift: "Marklyft" };
export type AttemptPlan = Record<CompLift, [number | null, number | null, number | null]>;
export interface WarmupSet { kg: number; reps: number }

const roundNearest = (kg: number, step = 2.5) => Math.round(kg / step) * step;
const roundDown = (kg: number, step = 2.5) => Math.floor(kg / step) * step;
const num = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;

/**
 * Openers sit around 92 % of the estimated max (one rep at RPE 8), so the
 * second attempt targets about 96 % and the third the estimated max itself.
 */
export function attemptsFromOpener(opener: number | null): [number | null, number | null, number | null] {
  if (!opener || opener <= 0) return [null, null, null];
  const second = Math.max(opener + 2.5, roundNearest(opener * 96 / 92));
  const third = Math.max(second + 2.5, roundNearest(opener * 100 / 92));
  return [opener, second, third];
}

/** Saved coach suggestions win; missing slots are derived from the opener. */
export function resolveAttemptPlan(planned: unknown, openers: unknown): AttemptPlan {
  const plannedObj = planned && typeof planned === "object" && !Array.isArray(planned) ? planned as Record<string, unknown> : {};
  const openerObj = openers && typeof openers === "object" && !Array.isArray(openers) ? openers as Record<string, unknown> : {};
  const result = {} as AttemptPlan;
  for (const lift of MEET_LIFTS) {
    const saved = Array.isArray(plannedObj[lift]) ? (plannedObj[lift] as unknown[]).slice(0, 3).map(num) : [];
    const first = saved[0] ?? num(openerObj[lift]);
    const derived = attemptsFromOpener(first);
    result[lift] = [first, saved[1] ?? derived[1], saved[2] ?? derived[2]];
  }
  return result;
}

export function parseAttempts(value: unknown): PeakAttempts {
  const out: PeakAttempts = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const lift of MEET_LIFTS) {
    const list = (value as Record<string, unknown>)[lift];
    if (!Array.isArray(list)) continue;
    out[lift] = list.slice(0, 3).map((v): PeakAttempt => v && typeof v === "object" && !Array.isArray(v)
      ? { kg: typeof (v as PeakAttempt).kg === "number" ? (v as PeakAttempt).kg : null, success: typeof (v as PeakAttempt).success === "boolean" ? (v as PeakAttempt).success : null }
      : { kg: null, success: null });
  }
  return out;
}

const LADDERS: Record<CompLift, { start: WarmupSet | null; steps: Array<[number, number]>; extraFrom: number }> = {
  squat: { start: { kg: 20, reps: 5 }, steps: [[0.4, 5], [0.55, 3], [0.7, 2], [0.8, 1], [0.9, 1]], extraFrom: 180 },
  bench: { start: { kg: 20, reps: 8 }, steps: [[0.4, 5], [0.55, 3], [0.7, 2], [0.8, 1], [0.9, 1]], extraFrom: 130 },
  deadlift: { start: null, steps: [[0.4, 3], [0.55, 2], [0.7, 1], [0.8, 1], [0.9, 1]], extraFrom: 230 },
};

/** Warmup sets up to the opener; heavier openers get one more single at 95 %. */
export function warmupLadder(lift: CompLift, opener: number | null): WarmupSet[] {
  if (!opener || opener <= 0) return [];
  const ladder = LADDERS[lift];
  const steps = opener >= ladder.extraFrom ? [...ladder.steps, [0.95, 1] as [number, number]] : ladder.steps;
  const sets: WarmupSet[] = ladder.start && ladder.start.kg < opener ? [ladder.start] : [];
  for (const [pct, reps] of steps) {
    let kg = roundDown(opener * pct);
    if (lift === "deadlift" && sets.length === 0) kg = Math.max(kg, Math.min(60, roundDown(opener * 0.55)));
    if (kg < 20 || kg >= opener || (sets.length && kg <= sets[sets.length - 1].kg)) continue;
    sets.push({ kg, reps });
  }
  return sets;
}

/** Federations do not allow a lighter attempt after a heavier one. */
export function attemptOrderWarning(kgs: Array<number | null | undefined>): string | null {
  let previous = 0;
  for (let i = 0; i < kgs.length; i++) {
    const kg = kgs[i];
    if (kg == null) continue;
    if (kg < previous) return `Försök ${i + 1} är lättare än försöket före. Vikten får inte sänkas mellan försöken.`;
    previous = kg;
  }
  return null;
}

export function meetResult(attempts: PeakAttempts) {
  const best = Object.fromEntries(MEET_LIFTS.map((lift) => {
    const good = (attempts[lift] ?? []).filter((a) => a.success === true && a.kg != null).map((a) => a.kg as number);
    return [lift, good.length ? Math.max(...good) : null];
  })) as Record<CompLift, number | null>;
  const total = MEET_LIFTS.every((lift) => best[lift] != null) ? MEET_LIFTS.reduce((sum, lift) => sum + (best[lift] ?? 0), 0) : null;
  return { best, total };
}

export const MEET_DAY_TIPS = [
  "Ät och drick som vanligt under dagen. Testa inget nytt på tävlingsdagen.",
  "Starta allmän uppvärmning 10–15 minuter innan du börjar med stången.",
  "Börja uppvärmningen i knäböj ungefär 30–40 minuter innan din grupp går upp. Sista uppvärmningen tas 5–8 minuter före första försöket.",
  "Värm upp i bänk medan knäböjen pågår om grupperna är små. Mellan bänk och mark räcker 2–3 kortare uppvärmningsset.",
  "Anmäl nästa försök direkt efter varje lyft. Följ coachens förslag; höj bara efter samråd om lyftet gick klart lättare än väntat.",
];
