/**
 * Byggövning (steg 6–7 i "tre vägar till utveckling").
 * A coach-chosen non-technical exercise per main lift, run hard with double
 * progression. Placed after the lift's main and variant rows on a day where the
 * lift is already trained. It counts as assistance in the 30-set session cap and
 * the 8/7/6 exercise cap, never in the main lift's sets, Mängd or EAk.
 */
import { isCompLift } from "@/lib/liftIdentity";
import { sameExerciseName } from "@/lib/exerciseVariants";
import { volumeCategory, type TemplateExercise, type TemplateWeek } from "@/lib/strengthTemplates";
import { exercisePriority, sessionCap } from "@/lib/weakPoints";

export type BuilderLift = "squat" | "bench" | "deadlift";
export const BUILDER_LIFTS: BuilderLift[] = ["squat", "bench", "deadlift"];
export const BUILDER_LIFT_LABEL: Record<BuilderLift, string> = { squat: "Knäböj", bench: "Bänkpress", deadlift: "Marklyft" };
export const BUILDER_MAX_SETS = 5;
export const BUILDER_MIN_SETS = 2;
export const BUILDER_DEFAULT_STEP_KG = 2.5;
export const BUILDER_RPE = 8;
export const BUILDER_LAST_SET_RPE = 9;

export interface BuilderChoice {
  exercise: string;
  perWeek: 1 | 2;
  sets: number;
  repMin: number;
  repMax: number;
  mode: "add" | "replace";
  stepKg: number;
}
export type BuilderChoices = Partial<Record<BuilderLift, BuilderChoice | null>>;

export const DEFAULT_BUILDER: Omit<BuilderChoice, "exercise" | "stepKg"> = { perWeek: 1, sets: 3, repMin: 8, repMax: 12, mode: "add" };

const LIFT_CAT = { squat: "squat", bench: "horizontal-press", deadlift: "hinge" } as const;
const SINGLE = /over-warm|opener/i;
const WEEK_FLOOR = 6;

export function builderNotes(c: Pick<BuilderChoice, "sets" | "repMin" | "repMax" | "stepKg">): string {
  const step = String(c.stepKg).replace(".", ",");
  return [
    `Byggövning: ${c.sets} set × ${c.repMin}–${c.repMax} reps. Mål-RPE ${BUILDER_RPE} på alla set utom sista, som har RPE ${BUILDER_LAST_SET_RPE}.`,
    `Setupplägg: Dubbel progression. Samma vikt i alla set. När alla set når ${c.repMax} reps höjer du ${step} kg nästa gång och börjar på ${c.repMin} reps.`,
  ].join("\n");
}

const isBuilderRow = (e: TemplateExercise) => Boolean(e.builder_lift);
/** Main/variant rows of a lift (never build rows). */
const isLiftRow = (e: TemplateExercise, lift: BuilderLift) => !isBuilderRow(e) && volumeCategory(e) === LIFT_CAT[lift];
const workingCount = (s: { exercises: TemplateExercise[] }) => s.exercises.filter((e) => !SINGLE.test(e.variation ?? "")).length;

/** Pick `n` host sessions spread over the week. */
function pickHosts(hostIdx: number[], n: number): number[] {
  if (hostIdx.length <= n) return hostIdx;
  if (n === 1) return [hostIdx[0]];
  return [hostIdx[0], hostIdx[hostIdx.length - 1]];
}

export interface BuilderOptions {
  /** Lifts with active push: never take sets from their comp rows (push restores them). */
  pushLifts?: Set<BuilderLift>;
  /** Weekly hard-set floor per lift (defaults to 6). */
  floor?: Partial<Record<BuilderLift, number>>;
  /** Coach-chosen weak-point exercises: a build row never replaces them. */
  protect?: string[];
}

/** Only working weeks get build exercises: never deload, ramp, taper or peak. */
export function applyBuilders(weeks: TemplateWeek[], choices: BuilderChoices, opts: BuilderOptions = {}): { weeks: TemplateWeek[]; warnings: string[] } {
  const active = BUILDER_LIFTS.filter((l) => choices[l]?.exercise?.trim());
  if (!active.length) return { weeks, warnings: [] };
  const warnings = new Set<string>();
  const out = weeks.map((week) => {
    if (week.kind !== "working") return week;
    const sessions = week.sessions.map((s) => ({ ...s, exercises: s.exercises.map((e) => ({ ...e })) }));
    const cap = sessionCap(sessions.length);
    for (const lift of active) {
      const c = choices[lift]!;
      const sets = Math.min(BUILDER_MAX_SETS, Math.max(BUILDER_MIN_SETS, Math.round(c.sets)));
      const hostIdx = sessions.map((s, i) => (s.exercises.some((e) => isLiftRow(e, lift)) ? i : -1)).filter((i) => i >= 0);
      if (!hostIdx.length) { warnings.add(`${BUILDER_LIFT_LABEL[lift]}: inget pass tränar lyftet, så byggövningen ${c.exercise} lades inte in.`); continue; }
      // Once a week: prefer the first host day that still has room, so a full
      // day never loses an exercise when another lift day can take the row.
      const roomy = hostIdx.find((i) => workingCount(sessions[i]) < cap);
      const hosts = c.perWeek === 1 && roomy != null ? [roomy] : pickHosts(hostIdx, c.perWeek);
      if (hosts.length < c.perWeek) warnings.add(`${BUILDER_LIFT_LABEL[lift]}: lyftet tränas bara ett pass i veckan, så ${c.exercise} läggs in en gång per vecka.`);
      let placed = 0;
      for (const hi of hosts) {
        const s = sessions[hi];
        if (s.exercises.some((e) => sameExerciseName(e.exercise, c.exercise.trim()))) {
          warnings.add(`${BUILDER_LIFT_LABEL[lift]}: ${c.exercise} finns redan i passet, så den lades inte in en gång till.`);
          continue;
        }
        const row: TemplateExercise = {
          exercise: c.exercise.trim(), target_sets: sets, target_reps: c.repMin, target_reps_max: c.repMax,
          target_rpe: BUILDER_RPE, intensity_metric: "rpe", builder_lift: lift, weight_step_kg: c.stepKg,
          notes: builderNotes({ ...c, sets }),
        };
        const lastLift = s.exercises.reduce((acc, e, i) => (isLiftRow(e, lift) ? i : acc), -1);
        if (workingCount(s) < cap) {
          s.exercises.splice(lastLift + 1, 0, row);
        } else {
          // Counts as assistance: may only replace a lower-priority exercise.
          const pr = 50;
          let low = -1;
          s.exercises.forEach((e, i) => {
            if (isBuilderRow(e) || SINGLE.test(e.variation ?? "")) return;
            if (opts.protect?.some((name) => sameExerciseName(name, e.exercise))) return;
            const p = exercisePriority(e);
            if (p < pr && (low < 0 || p < exercisePriority(s.exercises[low]))) low = i;
          });
          if (low < 0) { warnings.add(`${BUILDER_LIFT_LABEL[lift]}: passet är fullt (${cap} övningar), så ${c.exercise} lades inte in.`); continue; }
          s.exercises.splice(low, 1);
          const at = s.exercises.reduce((acc, e, i) => (isLiftRow(e, lift) ? i : acc), -1);
          s.exercises.splice(at + 1, 0, row);
        }
        placed += 1;
      }
      if (c.mode !== "replace" || !placed) continue;
      // Ersätt: take the same number of sets from the lift's lightest main/variant row this week.
      const floor = opts.floor?.[lift] ?? WEEK_FLOOR;
      let toRemove = sets * placed;
      const snapshot = sessions.map((s) => s.exercises.map((e) => e.target_sets));
      const liftRows = () => sessions.flatMap((s) => s.exercises.map((e, ei) => ({ s, e, ei })).filter((x) => isLiftRow(x.e, lift)));
      const weekSets = () => liftRows().reduce((a, x) => a + x.e.target_sets, 0);
      while (toRemove > 0) {
        const cands = liftRows().filter(({ s, e, ei }) => {
          if (SINGLE.test(e.variation ?? "") || e.target_reps <= 1) return false; // heavy singles
          const comp = isCompLift(e.exercise, e.variation);
          if (comp && opts.pushLifts?.has(lift)) return false; // push sets
          // Measurement set: the first comp row of the session.
          if (comp && s.exercises.findIndex((x) => isLiftRow(x, lift) && isCompLift(x.exercise, x.variation)) === ei) return false;
          return e.target_sets > (comp ? 3 : 2);
        });
        if (!cands.length || weekSets() - 1 < floor) break;
        cands.sort((a, b) => (a.e.target_rpe ?? 10) - (b.e.target_rpe ?? 10) || b.e.target_sets - a.e.target_sets);
        cands[0].e.target_sets -= 1;
        toRemove -= 1;
      }
      if (toRemove > 0) {
        // All or nothing: restore every row and keep the build exercise as an addition.
        sessions.forEach((s, si) => s.exercises.forEach((e, ei) => { if (!e.builder_lift) e.target_sets = snapshot[si][ei] ?? e.target_sets; }));
      }
      if (toRemove > 0) warnings.add(`${BUILDER_LIFT_LABEL[lift]}: det gick inte att ta ${sets * placed} set från lyftets rader utan att röra mätset, push-set, tunga singlar eller mallens golv. Byggövningen lades till i stället.`);
    }
    return { ...week, sessions };
  });
  return { weeks: out, warnings: [...warnings] };
}

// ---------------- Steg 7: dagens mål ----------------

export interface BuilderLogSet { weight_kg: number; reps: number; set_number?: number }
export type BuilderTarget =
  | { kind: "none"; text: string }
  | { kind: "add-weight"; weightKg: number; repsPerSet: number; text: string }
  | { kind: "add-reps"; weightKg: number; totalReps: number; text: string };

const kg = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

/** "140 kg × 12, 11, 10 (33 reps)" — mixed weights are listed per set. */
export function lastTimeText(sets: BuilderLogSet[]): string {
  if (!sets.length) return "";
  const total = sets.reduce((a, s) => a + s.reps, 0);
  const same = sets.every((s) => s.weight_kg === sets[0].weight_kg);
  return same
    ? `${kg(sets[0].weight_kg)} kg × ${sets.map((s) => s.reps).join(", ")} (${total} reps)`
    : `${sets.map((s) => `${kg(s.weight_kg)} kg × ${s.reps}`).join(", ")} (${total} reps)`;
}

/**
 * Double progression target from the last logged session:
 * all sets reached the top of the range → one weight step up, bottom of the range per set;
 * otherwise the same weight and at least one more rep in total.
 */
export function builderTarget(prev: BuilderLogSet[], repMin: number, repMax: number, stepKg: number, plannedSets?: number): BuilderTarget {
  const sets = prev.filter((s) => s.reps > 0 && s.weight_kg > 0);
  if (!sets.length) {
    const mid = Math.round((repMin + repMax) / 2);
    return { kind: "none", text: `Välj en vikt du klarar ${mid} reps på med 2 kvar.` };
  }
  const weight = Math.max(...sets.map((s) => s.weight_kg));
  const atWeight = sets.filter((s) => s.weight_kg === weight);
  const enoughSets = plannedSets == null || atWeight.length >= plannedSets;
  if (enoughSets && atWeight.every((s) => s.reps >= repMax)) {
    const next = weight + (stepKg > 0 ? stepKg : BUILDER_DEFAULT_STEP_KG);
    return { kind: "add-weight", weightKg: next, repsPerSet: repMin, text: `${kg(next)} kg × minst ${repMin} reps per set.` };
  }
  const total = atWeight.reduce((a, s) => a + s.reps, 0) + 1;
  return { kind: "add-reps", weightKg: weight, totalReps: total, text: `${total} reps totalt på ${kg(weight)} kg.` };
}

/** Did today's sets reach the target? */
export function builderTargetMet(target: BuilderTarget, today: BuilderLogSet[], plannedSets: number): boolean {
  if (target.kind === "none") return false;
  const atWeight = today.filter((s) => s.weight_kg >= target.weightKg);
  if (target.kind === "add-weight") return atWeight.length >= plannedSets && atWeight.every((s) => s.reps >= target.repsPerSet);
  return atWeight.reduce((a, s) => a + s.reps, 0) >= target.totalReps;
}

// ---------------- Steg 7: trend i Analys ----------------

export interface BuilderSession { date: string; sets: BuilderLogSet[] }
export type BuilderStatus = "up" | "flat" | "down";
export const BUILDER_STATUS_LABEL: Record<BuilderStatus, string> = { up: "Ökar", flat: "Står still", down: "Tappar" };
export const BUILDER_STALL_SUGGESTION = "Byt övning eller börja om på nedre repgränsen.";

const bestSet = (sets: BuilderLogSet[]) => [...sets].sort((a, b) => b.weight_kg - a.weight_kg || b.reps - a.reps)[0];
/** Compare two sessions: more weight on the best set, or more total reps at the same top weight. */
function compareSessions(a: BuilderSession, b: BuilderSession): number {
  const ba = bestSet(a.sets), bb = bestSet(b.sets);
  if (bb.weight_kg !== ba.weight_kg) return bb.weight_kg > ba.weight_kg ? 1 : -1;
  const ta = a.sets.filter((s) => s.weight_kg === ba.weight_kg).reduce((x, s) => x + s.reps, 0);
  const tb = b.sets.filter((s) => s.weight_kg === bb.weight_kg).reduce((x, s) => x + s.reps, 0);
  return tb > ta ? 1 : tb < ta ? -1 : 0;
}
const epley = (s: BuilderLogSet) => s.weight_kg * (1 + s.reps / 30);

export interface BuilderTrend {
  sessions: Array<{ date: string; best: BuilderLogSet }>;
  changePct: number | null;
  status: BuilderStatus | null;
  stalled: boolean;
}

/** Last six sessions (oldest first), change since the first of them, status vs three sessions earlier. */
export function builderTrend(all: BuilderSession[]): BuilderTrend {
  const sessions = all.filter((s) => s.sets.some((x) => x.reps > 0 && x.weight_kg > 0))
    .map((s) => ({ ...s, sets: s.sets.filter((x) => x.reps > 0 && x.weight_kg > 0) }))
    .sort((a, b) => a.date.localeCompare(b.date)).slice(-6);
  const rows = sessions.map((s) => ({ date: s.date, best: bestSet(s.sets) }));
  if (!sessions.length) return { sessions: rows, changePct: null, status: null, stalled: false };
  const first = epley(rows[0].best), last = epley(rows[rows.length - 1].best);
  const changePct = rows.length > 1 && first > 0 ? Math.round(((last - first) / first) * 1000) / 10 : null;
  let status: BuilderStatus | null = null;
  if (sessions.length >= 4) {
    const cmp = compareSessions(sessions[sessions.length - 4], sessions[sessions.length - 1]);
    status = cmp > 0 ? "up" : cmp < 0 ? "down" : "flat";
  }
  // Three sessions in a row without improving on the session before.
  let stalled = false;
  if (sessions.length >= 4) {
    const tail = sessions.slice(-4);
    stalled = [1, 2, 3].every((i) => compareSessions(tail[i - 1], tail[i]) <= 0);
  }
  return { sessions: rows, changePct, status, stalled };
}
