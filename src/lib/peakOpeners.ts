import { differenceInCalendarDays, parseISO } from "date-fns";
import { dailyE1RM } from "@/lib/eakoefficient";
import { pctOf1RMInterp } from "@/lib/intensity";
import { compLiftKey, competitionExerciseName, isCompetitionDescriptor } from "@/lib/liftIdentity";
import type { MainLiftKey, PeakHistoryInput } from "@/lib/peaking";
import type { TemplateWeek } from "@/lib/strengthTemplates";

export const OPENER_LABELS = { squat: "Knäböj", bench: "Bänkpress", deadlift: "Marklyft" };
export function peakLift(name: string, style?: string | null, variation?: string | null): MainLiftKey | null {
  const key = compLiftKey(name);
  if (!key) return null;
  const note = (variation ?? "").trim();
  const legacyCompetitionNote = /^(competition stance & commands|competition technique)$/i.test(note)
    || (key === "bench" && /^competition pause$/i.test(note));
  if (!isCompetitionDescriptor(note) && !legacyCompetitionNote) return null;
  const identity = competitionExerciseName(name, variation);
  if (identity === "Sumo deadlift" && style !== "sumo") return null;
  if (identity === "Conventional deadlift" && style === "sumo") return null;
  return key;
}
export function suggestOpeners(history: PeakHistoryInput, style?: string | null) {
  return (["squat", "bench", "deadlift"] as MainLiftKey[]).map((key) => {
    const days = new Map<string, number>();
    const ordered = [...history.logs].sort((a, b) => ((a as typeof a & { set_number?: number }).set_number ?? 0) - ((b as typeof b & { set_number?: number }).set_number ?? 0));
    for (const log of ordered) {
      const age = differenceInCalendarDays(parseISO(history.today), parseISO(log.date));
      if (log.is_warmup_reference || log.is_technique || history.overloadDates?.includes(log.date) || age < 0 || age > 42 || peakLift(log.exercise, style, log.variation) !== key || days.has(log.date) ||
        log.rpe == null || log.rpe < 7 || log.rpe > 10 || log.reps < 1 || log.reps > 5 || log.weight_kg <= 0) continue;
      days.set(log.date, dailyE1RM({ weight_kg: log.weight_kg, reps: log.reps, rpe: log.rpe }));
    }
    const recent = [...days].sort(([a], [b]) => b.localeCompare(a)).slice(0, 3);
    const sorted = recent.map(([, value]) => value).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const estimate = sorted.length ? sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2 : null;
    return { key, count: recent.length, latest: recent[0]?.[0], sources:recent.map(([date,e1rm])=>({date,e1rm})), estimate,
      kg: estimate == null ? null : Math.floor(estimate * pctOf1RMInterp(8, 1) / 100 / 2.5) * 2.5 };
  });
}

/** Replace the top set, never add sets; no heavy singles in meet week. */
export function applyPeakSingles(weeks: TemplateWeek[], enabled: boolean, rpe: number,
  openers: Partial<Record<MainLiftKey, number>>, selectedWeeks: number[], style?: string | null): TemplateWeek[] {
  if (!enabled) return weeks;
  return weeks.map((week, index) => {
    if (index === weeks.length - 1 || !selectedWeeks.includes(week.week_index)) return week;
    const used = new Set<MainLiftKey>();
    return { ...week, sessions: week.sessions.map((session) => ({ ...session, exercises: session.exercises.map((exercise) => {
      const key = peakLift(exercise.exercise, style);
      if (!key || used.has(key) || exercise.variation !== "Competition stance & commands") return exercise;
      used.add(key);
      const kg = openers[key];
      return { ...exercise, target_sets: 1, target_reps: 1, target_rpe: rpe, target_rir: undefined,
        intensity_metric: "rpe" as const, target_weight_kg: kg, variation: "Coachvald toppningssingel",
        notes: `Singel @ RPE ${rpe}${kg ? `, högst ${kg} kg` : ""}. Sänk vikten om RPE blir högre eller tekniken försämras. Ersätter dagens toppset.` };
    }) })) };
  });
}