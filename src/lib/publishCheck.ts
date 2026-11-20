import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { pctOf1RM } from "@/lib/intensity";
import { lookupBaseline } from "@/lib/eakoefficient";
import { isCompLift, type CompLift } from "@/lib/liftIdentity";
import { plannedSessionDate } from "@/lib/planned-session-dates";
import {
  compBaseline,
  estimateRpe,
  LIFTS,
  LIFT_LABEL_SV,
  liftMetrics,
  metricLiftKey,
  plannedRowSets,
  VOLUME_WARNING_RATIO,
  type MetricSet,
} from "@/lib/liftMetrics";

/**
 * Samlad kontroll innan en vecka publiceras. Bara information: inget ändras
 * och coachen kan alltid publicera ändå.
 */
export type CheckArea = "Pass" | "Vikter" | "Volym" | "Återhämtning" | "Krockar";
export interface PublishFinding {
  area: CheckArea;
  level: "warn" | "info";
  message: string;
}

export interface CheckExercise {
  exercise: string;
  variation?: string | null;
  target_sets: number;
  target_reps: number;
  target_rpe?: number | null;
  target_rir?: number | null;
  target_pct?: number | null;
  target_weight_kg?: number | null;
  intensity_metric?: string | null;
  is_technique?: boolean | null;
  builder_lift?: string | null;
}
export interface CheckSession {
  day_of_week: number | null;
  title?: string | null;
  exercises: CheckExercise[];
}
export interface CheckWeek {
  week_start_date: string;
  is_deload?: boolean | null;
  training_phase?: string | null;
  notes?: string | null;
  sessions: CheckSession[];
}

export const MAX_SESSION_SETS = 30;
export const MAX_WEEKLY_HARD_SETS = 24;
export const MAX_DAYS_IN_A_ROW = 3;
const LIGHT = new Set(["deload", "taper", "peak", "ramp", "stegtaper", "vila", "toppning"]);
/** Toppningsfaser där mängden avsiktligt går upp och ner vecka för vecka. */
const PEAK_PHASES = new Set(["volymtopp", "intensifiering", "overbelastning", "överbelastning", "taper", "stegtaper", "peak", "toppning"]);
const RAMP_NOTE = /ramp-in|intrappning|uppstartsvecka/i;
const REASON: Record<string, string> = { sick: "sjuk", injured: "skadad", other: "frånvaro" };

const fmt1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1).replace(".", ",");
const dLabel = (iso: string) => format(parseISO(iso), "d/M");
const rpeOf = (e: CheckExercise) =>
  e.target_rpe != null ? Number(e.target_rpe) : e.target_rir != null ? 10 - Number(e.target_rir) : null;
const isPercent = (e: CheckExercise) => e.intensity_metric === "percent" || (e.target_pct != null && e.target_pct > 0);

export function isLightWeek(w: Pick<CheckWeek, "is_deload" | "training_phase" | "notes">) {
  return !!w.is_deload || LIGHT.has((w.training_phase ?? "").toLowerCase()) || RAMP_NOTE.test(w.notes ?? "");
}
/** Vanlig arbetsvecka: inte lätt, inte intrappning och inte en toppningsfas. */
export function isPlainWorkingWeek(w: Pick<CheckWeek, "is_deload" | "training_phase" | "notes">) {
  return !isLightWeek(w) && !PEAK_PHASES.has((w.training_phase ?? "").toLowerCase());
}

export function weekSessionDates(w: CheckWeek) {
  return w.sessions.map((s) => ({ session: s, date: plannedSessionDate(w.week_start_date, s, w.sessions) }));
}

function weekMetrics(w: CheckWeek, baselines: Record<string, number>) {
  const sets: MetricSet[] = [];
  for (const s of w.sessions)
    for (const e of s.exercises) {
      if (e.builder_lift || e.is_technique) continue;
      sets.push(...plannedRowSets({ ...e, target_rpe: rpeOf(e), is_technique: !!e.is_technique }, baselines));
    }
  return liftMetrics(sets, baselines);
}

/** Baseline a row's weight is judged against: own exercise first, comp lift only for the comp lift itself. */
function rowBaseline(e: CheckExercise, baselines: Record<string, number>) {
  const own = lookupBaseline(baselines, e.exercise);
  if (own && own > 0) return own;
  const lift = metricLiftKey(e.exercise, e.variation);
  return lift && isCompLift(e.exercise, e.variation) ? compBaseline(baselines, lift, e.exercise, e.variation) : null;
}

export function prePublishChecks(input: {
  week: CheckWeek;
  previousWeek?: CheckWeek | null;
  baselines: Record<string, number>;
  otherPlanDates?: Array<{ date: string; name: string; published: boolean }>;
  unavailability?: Array<{ startDate: string; endDate: string; reason: string }>;
  today: string;
}): PublishFinding[] {
  const { week, previousWeek, baselines, today } = input;
  const out: PublishFinding[] = [];
  const dated = weekSessionDates(week);
  const withWork = dated.filter((d) => d.session.exercises.length > 0);

  // --- Pass ---
  if (!withWork.length) out.push({ area: "Pass", level: "warn", message: "Veckan har inga pass med övningar." });
  for (const d of dated)
    if (!d.session.exercises.length)
      out.push({ area: "Pass", level: "warn", message: `${d.session.title ?? "Pass"} (${dLabel(d.date)}) saknar övningar.` });
  const past = withWork.filter((d) => d.date < today);
  if (past.length)
    out.push({
      area: "Pass",
      level: "info",
      message: `${past.length === 1 ? "Ett pass ligger" : `${past.length} pass ligger`} redan bakåt i tiden (${past.map((d) => dLabel(d.date)).join(", ")}) och visas som missade om de inte loggas.`,
    });

  // --- Vikter ---
  for (const d of withWork) {
    for (const e of d.session.exercises) {
      const lift = metricLiftKey(e.exercise, e.variation);
      if (!lift || e.is_technique || e.builder_lift) continue;
      const name = e.variation ? `${e.exercise} (${e.variation})` : e.exercise;
      const where = `${dLabel(d.date)}: ${name} ${e.target_sets} × ${e.target_reps}`;
      const base = rowBaseline(e, baselines);
      const anyBase = base ?? compBaseline(baselines, lift, e.exercise, e.variation);
      const weight = e.target_weight_kg != null ? Number(e.target_weight_kg) : null;
      const rpe = rpeOf(e);
      if (isPercent(e)) {
        if (!anyBase) out.push({ area: "Vikter", level: "warn", message: `${where} är en procentrad utan baslinje, så atleten ser ingen vikt.` });
        continue;
      }
      if (rpe != null && rpe >= 10) continue; // maxtest: vikten väljs på plats
      if (!(weight && weight > 0)) {
        if (anyBase && isCompLift(e.exercise, e.variation))
          out.push({ area: "Vikter", level: "warn", message: `${where} saknar föreslagen vikt trots att baslinje finns.` });
        continue;
      }
      if (!base || !(e.target_reps > 0)) continue;
      const pct = (weight / base) * 100;
      const max = pctOf1RM(10, e.target_reps);
      if (max != null && pct > max + 3) {
        out.push({ area: "Vikter", level: "warn", message: `${where}: ${fmt1(weight)} kg × ${e.target_reps} är tyngre än baslinjen ${fmt1(base)} kg räcker till (${Math.round(pct)} %).` });
        continue;
      }
      if (rpe != null && e.target_reps <= 12) {
        const est = estimateRpe(weight, e.target_reps, base);
        if (est == null && rpe >= 8)
          out.push({ area: "Vikter", level: "warn", message: `${where}: ${fmt1(weight)} kg × ${e.target_reps} är lätt för RPE ${fmt1(rpe)} (under RPE 6 mot baslinjen ${fmt1(base)} kg).` });
        else if (est != null && Math.abs(est - rpe) >= 1.5)
          out.push({ area: "Vikter", level: "warn", message: `${where}: ${fmt1(weight)} kg × ${e.target_reps} motsvarar ungefär RPE ${fmt1(est)}, inte målet RPE ${fmt1(rpe)}.` });
      }
    }
  }

  // --- Volym ---
  for (const d of withWork) {
    const sets = d.session.exercises.filter((e) => !e.is_technique).reduce((a, e) => a + (Number(e.target_sets) || 0), 0);
    if (sets > MAX_SESSION_SETS)
      out.push({ area: "Volym", level: "warn", message: `${d.session.title ?? "Pass"} (${dLabel(d.date)}) har ${sets} set, över taket ${MAX_SESSION_SETS}.` });
  }
  const now = weekMetrics(week, baselines);
  for (const lift of LIFTS)
    if (now[lift].hardSets > MAX_WEEKLY_HARD_SETS)
      out.push({ area: "Volym", level: "warn", message: `${now[lift].hardSets} hårda set i ${LIFT_LABEL_SV[lift]} på en vecka, över taket ${MAX_WEEKLY_HARD_SETS}.` });
  const light = isLightWeek(week);
  if (previousWeek && previousWeek.sessions.some((s) => s.exercises.length)) {
    const prev = weekMetrics(previousWeek, baselines);
    const prevLight = isLightWeek(previousWeek);
    const plain = isPlainWorkingWeek(week) && isPlainWorkingWeek(previousWeek);
    for (const lift of LIFTS) {
      const v = now[lift].volume;
      const p = prev[lift].volume;
      if (v == null || p == null || !(p > 0)) continue;
      if (plain && v > p * VOLUME_WARNING_RATIO)
        out.push({ area: "Volym", level: "warn", message: `Mängd i ${LIFT_LABEL_SV[lift]} ökar ${Math.round((v / p - 1) * 100)} % mot förra veckan (${fmt1(p)} → ${fmt1(v)}).` });
      if (light && week.is_deload && !prevLight && v >= p)
        out.push({ area: "Volym", level: "warn", message: `Avlastningsveckan har lika mycket eller mer mängd i ${LIFT_LABEL_SV[lift]} än förra veckan (${fmt1(p)} → ${fmt1(v)}).` });
    }
  }
  if (week.is_deload) {
    const hard = withWork.flatMap((d) =>
      d.session.exercises
        .filter((e) => metricLiftKey(e.exercise, e.variation) && !e.is_technique && (rpeOf(e) ?? 0) >= 8.5)
        .map((e) => `${dLabel(d.date)} ${e.exercise}`),
    );
    if (hard.length) out.push({ area: "Volym", level: "warn", message: `Avlastningsveckan har huvudlyft på RPE 8,5 eller mer: ${hard.join(", ")}.` });
  }

  // --- Återhämtning ---
  const days = new Set(withWork.map((d) => d.date));
  const prevDates = previousWeek ? weekSessionDates(previousWeek).filter((d) => d.session.exercises.length).map((d) => d.date) : [];
  const all = [...new Set([...days, ...prevDates])].sort();
  let run: string[] = [];
  const runs: string[][] = [];
  for (const date of all) {
    const last = run[run.length - 1];
    if (last && differenceInCalendarDays(parseISO(date), parseISO(last)) === 1) run.push(date);
    else {
      if (run.length) runs.push(run);
      run = [date];
    }
  }
  if (run.length) runs.push(run);
  for (const r of runs)
    if (r.length > MAX_DAYS_IN_A_ROW && r.some((d) => days.has(d)))
      out.push({ area: "Återhämtning", level: "warn", message: `${r.length} träningsdagar i rad (${dLabel(r[0]!)}–${dLabel(r[r.length - 1]!)}).` });

  const heavyByDate = new Map<string, Set<CompLift>>();
  for (const d of withWork) {
    for (const e of d.session.exercises) {
      const lift = metricLiftKey(e.exercise, e.variation);
      if (!lift || e.is_technique || e.builder_lift) continue;
      // Tungt = tävlingslyftet på RPE 8+ eller minst 85 % av tävlingsbaslinjen (varianter bara på vikt).
      const base = compBaseline(baselines, lift, e.exercise, e.variation);
      const w = Number(e.target_weight_kg ?? 0);
      const heavy = (isCompLift(e.exercise, e.variation) && (rpeOf(e) ?? 0) >= 8) || (base != null && w > 0 && (w / base) * 100 >= 85);
      if (!heavy) continue;
      const set = heavyByDate.get(d.date) ?? new Set<CompLift>();
      set.add(lift);
      heavyByDate.set(d.date, set);
    }
  }
  for (const [date, lifts] of heavyByDate) {
    const next = format(addDays(parseISO(date), 1), "yyyy-MM-dd");
    for (const lift of lifts)
      if (heavyByDate.get(next)?.has(lift))
        out.push({
          area: "Återhämtning",
          level: lift === "bench" ? "info" : "warn",
          message: `Tung ${LIFT_LABEL_SV[lift]} två dagar i rad (${dLabel(date)} och ${dLabel(next)}).`,
        });
  }
  for (const u of input.unavailability ?? []) {
    const hit = withWork.filter((d) => d.date >= u.startDate && d.date <= u.endDate).map((d) => dLabel(d.date));
    if (hit.length)
      out.push({ area: "Återhämtning", level: "warn", message: `Pass ${hit.join(", ")} ligger under anmäld frånvaro (${REASON[u.reason] ?? u.reason}, ${dLabel(u.startDate)}–${dLabel(u.endDate)}).` });
  }

  // --- Krockar ---
  if (withWork.length && input.otherPlanDates?.length) {
    const sorted = [...days].sort();
    const from = sorted[0]!;
    const to = sorted[sorted.length - 1]!;
    const byPlan = new Map<string, { published: boolean; dates: Set<string> }>();
    for (const o of input.otherPlanDates) {
      if (o.date < from || o.date > to) continue;
      const p = byPlan.get(o.name) ?? { published: false, dates: new Set<string>() };
      p.published ||= o.published;
      p.dates.add(o.date);
      byPlan.set(o.name, p);
    }
    for (const [name, p] of byPlan)
      out.push({
        area: "Krockar",
        level: p.published ? "warn" : "info",
        message: `${p.published ? "Publicerade" : "Utkastet"} ”${name}” har pass samma period (${[...p.dates].sort().map(dLabel).join(", ")}).${p.published ? " Atleten ser båda planerna." : ""}`,
      });
  }

  const seen = new Set<string>();
  return out.filter((f) => (seen.has(f.message) ? false : (seen.add(f.message), true)));
}
