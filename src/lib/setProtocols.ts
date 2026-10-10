import type { TemplateExercise, TemplateWeek } from "./strengthTemplates";
import { volumeCategory } from "./strengthTemplates";
import { isReadinessLift } from "./eakoefficient";
import { isOneAndHalfRep } from "./exerciseVariants";
import { pctOf1RM } from "./intensity";

export const SET_PROTOCOLS = [
  { id: "keep", label: "Behåll mallens upplägg" },
  { id: "straight", label: "Samma vikt och reps" },
  { id: "rep-drops", label: "Samma vikt, färre reps vid trötthet" },
  { id: "ramping", label: "Stegrande vikt" },
  { id: "descending", label: "Fallande reps, stegrande vikt" },
  { id: "metabolic", label: "Topp-set + tidsstyrda backoff-set" },
  { id: "double", label: "Dubbel progression" },
] as const;
export type SetProtocol = (typeof SET_PROTOCOLS)[number]["id"];
export type ProtocolGroup = "squat" | "bench" | "deadlift" | "accessories";
export type SetProtocolOptions = Record<ProtocolGroup, SetProtocol>;
export const DEFAULT_SET_PROTOCOLS: SetProtocolOptions = {
  squat: "keep", bench: "keep", deadlift: "keep", accessories: "keep",
};
export const PROTOCOL_GROUPS = [
  { id: "squat", label: "Knäböj och skivstångsvarianter" },
  { id: "bench", label: "Bänkpress och skivstångsvarianter" },
  { id: "deadlift", label: "Marklyft och skivstångsvarianter" },
  { id: "accessories", label: "Assistansövningar" },
] as const;
export const PROTOCOL_DESCRIPTION: Record<SetProtocol, string> = {
  keep: "Mallens ordinarie set, reps och ansträngning.",
  straight: "Samma reps och vikt. Första setet styr viktvalet; sänk vikten 5 % vid mål-RPE + 1,5 (högst 8,5).",
  "rep-drops": "Samma vikt som första setet. Anpassa därefter antalet reps till en lägre RPE, utan att gå till failure. Inte för arbete över cirka 85 % av 1RM.",
  ramping: "Samma reps, successivt högre RPE och vikt inom passet. Uppvärmningen är separat.",
  descending: "Färre reps för varje set, med högre vikt men bibehållen RPE. Aldrig färre än två reps.",
  metabolic: "Ett topp-set följt av lättare set på 70 % av samma övnings uppskattade 1RM, med två minuters vila. Inga extra set läggs till.",
  double: "Öka reps inom ett intervall. När alla set når övre gränsen inom mål-RPE, höj vikten nästa gång och börja på nedre gränsen.",
};

export function protocolGroup(e: TemplateExercise): ProtocolGroup | null {
  if (isOneAndHalfRep(e.exercise, e.variation) || e.target_reps < 2 ||
      /over-warm|opener/i.test(e.variation ?? "") ||
      /clean|snatch|jerk|jump|throw|ryck|stöt|vändning|hopp|kast/i.test(e.exercise)) return null;
  const category = volumeCategory(e);
  if (isReadinessLift(e.exercise)) {
    if (category === "squat") return "squat";
    if (category === "horizontal-press") return "bench";
    if (category === "hinge") return "deadlift";
  }
  if (category === "core") return null;
  return "accessories";
}

export interface ProtocolSet { reps: number; rpe: number; weight?: number }
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const roundWeight = (v: number) => Math.round(v / 2.5) * 2.5;
const numberText = (v: number) => String(v).replace(".", ",");

/** Relative load changes use only the already prescribed weight for this exercise.
 * Never borrow a competition lift's baseline for a swapped-in variation. */
function adjustedWeight(e: TemplateExercise, reps: number, rpe: number): number | undefined {
  if (!e.target_weight_kg || e.target_weight_kg <= 0 || e.target_reps > 12 || reps > 12) return undefined;
  const oldRpe = e.intensity_metric === "rir" ? 10 - (e.target_rir ?? 3) : (e.target_rpe ?? 7);
  const originalPct = pctOf1RM(oldRpe, e.target_reps);
  const newPct = pctOf1RM(rpe, reps);
  if (!originalPct || !newPct) return undefined;
  return roundWeight(e.target_weight_kg * newPct / originalPct);
}

export function protocolSets(e: TemplateExercise, protocol: SetProtocol): ProtocolSet[] {
  const count = Math.max(1, Math.round(e.target_sets));
  const rpe = clamp(e.intensity_metric === "rir" ? 10 - (e.target_rir ?? 3) : (e.target_rpe ?? 7), 6, 8.5);
  const reps = e.target_reps;
  return Array.from({ length: count }, (_, i) => {
    let setReps = reps;
    let setRpe = rpe;
    if (protocol === "ramping") setRpe = Math.max(6, rpe - Math.min(2, (count - 1 - i) * 0.5));
    if (protocol === "descending") setReps = Math.max(2, reps - i);
    if (protocol === "rep-drops" && i > 0) { setReps = Math.max(1, reps - 1); setRpe = Math.max(6, rpe - 1); }
    if (protocol === "metabolic" && i > 0) { setRpe = 6; setReps = Math.min(5, reps); }
    let weight = adjustedWeight(e, setReps, setRpe);
    if (protocol === "rep-drops") weight = adjustedWeight(e, reps, rpe);
    if (protocol === "metabolic" && i > 0) {
      const oldRpe = e.intensity_metric === "rir" ? 10 - (e.target_rir ?? 3) : (e.target_rpe ?? 7);
      const originalPct = pctOf1RM(oldRpe, reps);
      weight = e.target_weight_kg && originalPct && reps <= 12 ? roundWeight(e.target_weight_kg * 70 / originalPct) : undefined;
    }
    return { reps: setReps, rpe: setRpe, weight };
  });
}

function applyProtocol(e: TemplateExercise, protocol: SetProtocol): TemplateExercise {
  if (protocol === "keep" || e.target_sets < 2) return e;
  // Rep drops are not used with near-maximal work; leave that prescription intact.
  const originalRpe = e.intensity_metric === "rir" ? 10 - (e.target_rir ?? 3) : (e.target_rpe ?? 7);
  if (protocol === "rep-drops" && (pctOf1RM(originalRpe, e.target_reps) ?? 100) > 85) return e;
  const sets = protocolSets(e, protocol);
  const first = sets[0];
  if (!first) return e;
  const name = SET_PROTOCOLS.find((p) => p.id === protocol)?.label ?? "";
  const lines = sets.map((s, i) => `Set ${i + 1}: ${s.reps} reps @ RPE ${numberText(s.rpe)}${s.weight == null ? "" : ` · ${numberText(s.weight)} kg`}.`);
  if (protocol === "rep-drops") {
    for (let i = 1; i < lines.length; i++) lines[i] = `Set ${i + 1}: samma vikt som set 1, gör så många rena reps som ryms vid RPE ${numberText(sets[i]?.rpe ?? 6)} (inte till failure).`;
  }
  if (protocol === "metabolic") {
    for (let i = 1; i < lines.length; i++) lines[i] = `Set ${i + 1}: ${sets[i]?.reps ?? 5} reps${sets[i]?.weight == null ? " på 70 % av uppskattat 1RM för just denna övning" : ` · ${numberText(sets[i]?.weight ?? 0)} kg`} · högst RPE 7 · vila 2 minuter. Sänk vikten om RPE-gränsen överskrids.`;
  }
  if (protocol === "double") {
    const hi = e.target_reps + 4;
    lines.splice(0, lines.length, `${e.target_sets} set × ${e.target_reps}–${hi} reps @ högst RPE ${numberText(first.rpe)}. Samma vikt i alla set.`, `När alla ${e.target_sets} set når ${hi} reps inom mål-RPE: höj med minsta tillgängliga viktsteg nästa gång och börja på ${e.target_reps} reps igen. Annars behåll vikten. Logga faktiskt utförda reps.`);
  }
  if (protocol === "straight") lines.push(`Behåll vikten. Om ett set når RPE ${numberText(Math.min(8.5, first.rpe + 1.5))}: sänk vikten 5 % i resterande set.`);
  lines.push("Avbryt setet om position eller teknik inte kan hållas. Uppvärmningsset räknas inte in.");
  // Keep neutral technique cues, not conflicting legacy set/failure prescriptions.
  const cues = (e.notes ?? "").split(/(?<=[.!?])\s+|\n/).filter((line) =>
    !/\b(sets?|rpe|rir|failure|back.?off|top.?set|wave|amrap)\b|\d+\s*reps?\b|%|×/i.test(line)).join(" ").trim();
  return { ...e, target_reps: first.reps, target_rpe: first.rpe, target_rir: undefined,
    target_weight_kg: first.weight, intensity_metric: "rpe", lengthened_partials: false,
    last_set_to_failure: false, notes: [cues, `Setupplägg: ${name}.`, ...lines].filter(Boolean).join("\n") };
}

/** Final, volume-neutral transformation: no new exercises, days, or working sets. */
export function applySetProtocols(weeks: TemplateWeek[], options: SetProtocolOptions): TemplateWeek[] {
  const doubleReferences = new Map<string, TemplateExercise>();
  return weeks.map((week) => {
    if (/deload|taper|peak|återhämt|toppning/i.test(`${week.label} ${week.notes ?? ""}`)) return week;
    return { ...week, sessions: week.sessions.map((session, sessionIndex) => ({ ...session,
      exercises: session.exercises.map((e) => {
        const group = protocolGroup(e);
        if (!group) return e;
        const protocol = options[group];
        if (protocol !== "double") return applyProtocol(e, protocol);
        // Future performance is unknown: do not pre-schedule a load increase.
        // Keep each slot's starting range/load until the athlete earns progression.
        const key = `${sessionIndex}:${e.exercise}:${e.variation ?? ""}`;
        const reference = doubleReferences.get(key) ?? e;
        doubleReferences.set(key, reference);
        return applyProtocol({ ...e, target_reps: reference.target_reps,
          target_weight_kg: reference.target_weight_kg,
          target_rpe: Math.min(e.target_rpe ?? 8, reference.target_rpe ?? 8),
          target_rir: e.intensity_metric === "rir" ? Math.max(e.target_rir ?? 2, reference.target_rir ?? 2) : undefined,
        }, protocol);
      }),
    })) };
  });
}