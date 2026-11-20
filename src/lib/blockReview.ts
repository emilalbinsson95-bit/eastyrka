import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { dailyE1RM } from "@/lib/eakoefficient";
import { chartLiftIdentity, chartMeasurements, type ChartLog } from "@/lib/chartMetrics";
import { compLiftKey, isCompLift, normalizeLiftName, type CompLift } from "@/lib/liftIdentity";
import { plannedSessionDate } from "@/lib/planned-session-dates";
import { LIFTS, LIFT_LABEL_SV, LIGHT_PHASES, liftMetrics, metricLiftKey, plannedRowSets, type MetricSet } from "@/lib/liftMetrics";

/**
 * Uppföljning mellan block: blev atleten starkare (e1RM i tävlingslyften i
 * början mot slutet av blocket) och följdes planen (pass, set, RPE)?
 * Plus coachförslag när ett lyft stått still två block i rad. Bara visning.
 */
export const STRONGER_PCT = 2;
export const ADHERENCE_OK_PCT = 80;

export interface ReviewMesocycle { id: string; name: string; start_date: string; total_weeks: number }
export interface ReviewPlannedExercise {
  id?: string;
  exercise: string;
  variation?: string | null;
  target_sets: number;
  target_reps: number;
  target_weight_kg?: number | null;
  target_rpe?: number | null;
  target_pct?: number | null;
  is_technique?: boolean | null;
  builder_lift?: string | null;
}
export interface ReviewWeek {
  week_start_date: string;
  is_deload?: boolean | null;
  training_phase?: string | null;
  mesocycle_id: string | null;
  planned_sessions: Array<{ day_of_week: number | null; title?: string | null; planned_exercises: ReviewPlannedExercise[] }>;
}
export type ReviewLog = ChartLog & {
  variation?: string | null;
  is_warmup_reference?: boolean | null;
  is_technique?: boolean | null;
  planned_exercise_id?: string | null;
};

export type Verdict = "stronger" | "flat" | "weaker" | "unknown";
export interface LiftReview {
  lift: CompLift;
  e1Start: number | null;
  e1End: number | null;
  changePct: number | null;
  verdict: Verdict;
  measurements: number;
  hardPerWeek: number;
  heavyPerWeek: number | null;
  rpeDiff: number | null;
}
export interface BlockReview {
  id: string;
  name: string;
  start: string;
  end: string;
  finished: boolean;
  /** Toppnings-/tävlingsblock: visas, men räknas inte när stillastående bedöms. */
  isPeak: boolean;
  workingWeeks: number;
  sessionsPlanned: number;
  sessionsLogged: number;
  setsPlanned: number;
  setsLogged: number;
  adherencePct: number | null;
  rpeDiff: number | null;
  lifts: Record<CompLift, LiftReview>;
}

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const PEAK_PHASE = /taper|peak|toppning/i;
const PEAK_NAME = /toppning|tävlingsförberedelse|peak/i;
const isLight = (w: ReviewWeek) => !!w.is_deload || LIGHT_PHASES.has((w.training_phase ?? "").toLowerCase());

export function verdictOf(changePct: number | null): Verdict {
  if (changePct == null) return "unknown";
  if (changePct >= STRONGER_PCT) return "stronger";
  if (changePct <= -STRONGER_PCT) return "weaker";
  return "flat";
}

/** Planned dates matched to logged dates: same day first, then an unused logged day ±1 (moved sessions). */
export function matchSessions(planned: string[], logged: string[]) {
  const free = new Set(logged);
  let hits = 0;
  const sorted = [...planned].sort();
  const sameDay = new Set<string>();
  for (const p of sorted) if (free.has(p)) { free.delete(p); sameDay.add(p); hits++; }
  for (const p of sorted) {
    if (sameDay.has(p)) continue;
    const near = [...free].find((d) => Math.abs(differenceInCalendarDays(parseISO(d), parseISO(p))) === 1);
    if (near) { free.delete(near); hits++; }
  }
  return hits;
}

export function reviewBlocks(input: {
  mesocycles: ReviewMesocycle[];
  weeks: ReviewWeek[];
  logs: ReviewLog[];
  baselines: Record<string, number>;
  today: string;
}): BlockReview[] {
  const { weeks, logs, baselines, today } = input;
  const plannedById = new Map<string, ReviewPlannedExercise>();
  for (const w of weeks) for (const s of w.planned_sessions) for (const e of s.planned_exercises) if (e.id) plannedById.set(e.id, e);
  const measurements = chartMeasurements(logs.filter((l) => isCompLift(l.exercise, l.variation)));

  return input.mesocycles
    .filter((m) => m.start_date <= today)
    .map((m): BlockReview => {
      const end = format(addDays(parseISO(m.start_date), m.total_weeks * 7 - 1), "yyyy-MM-dd");
      const until = end < today ? end : today;
      const own = weeks.filter((w) => w.mesocycle_id === m.id);
      const workingStarts = [...new Set(own.filter((w) => !isLight(w) && w.week_start_date <= today).map((w) => w.week_start_date))].sort();

      // Planned sessions up to today.
      const plannedDates: string[] = [];
      const plannedSets: MetricSet[] = [];
      for (const w of own) {
        for (const s of w.planned_sessions) {
          if (!s.planned_exercises.length) continue;
          const date = plannedSessionDate(w.week_start_date, s, w.planned_sessions);
          if (date > today) continue;
          plannedDates.push(date);
          for (const e of s.planned_exercises) {
            if (e.is_technique || e.builder_lift || !metricLiftKey(e.exercise, e.variation)) continue;
            plannedSets.push(...plannedRowSets({ ...e, is_technique: !!e.is_technique }, baselines));
          }
        }
      }
      const inBlock = logs.filter((l) => l.date >= m.start_date && l.date <= until);
      const loggedDates = [...new Set(inBlock.map((l) => l.date))];
      const sessionsLogged = matchSessions(plannedDates, loggedDates);
      const mainLogs = inBlock.filter((l) => !l.is_warmup_reference && !l.is_technique && metricLiftKey(l.exercise, l.variation));

      const lifts = {} as Record<CompLift, LiftReview>;
      const allDiffs: number[] = [];
      for (const lift of LIFTS) {
        // e1RM: the competition-lift identity (stance) with most measurements in the block.
        const pts = measurements.filter((p) => p.date >= m.start_date && p.date <= until && compLiftKey(p.exercise) === lift);
        const byKey = new Map<string, typeof pts>();
        for (const p of pts) {
          const k = normalizeLiftName(chartLiftIdentity(p.exercise, p.variation).exercise);
          byKey.set(k, [...(byKey.get(k) ?? []), p]);
        }
        const series = [...byKey.values()].sort((a, b) => b.length - a.length)[0] ?? [];
        const values = series.map((p) => dailyE1RM(p)).filter((v) => v > 0);
        const n = Math.min(3, Math.floor(values.length / 2));
        const e1Start = n >= 1 ? median(values.slice(0, n)) : null;
        const e1End = n >= 1 ? median(values.slice(-n)) : null;
        // En decimal, så att visad procent och bedömning alltid stämmer överens.
        const changePct = e1Start && e1End ? Math.round((e1End / e1Start - 1) * 1000) / 10 : null;

        let hard = 0;
        let heavy: number | null = 0;
        for (const ws of workingStarts) {
          const we = format(addDays(parseISO(ws), 6), "yyyy-MM-dd");
          const met = liftMetrics(mainLogs.filter((l) => l.date >= ws && l.date <= we), baselines)[lift];
          hard += met.hardSets;
          if (met.heavySets == null) heavy = null; // baslinje saknas
          else if (heavy != null) heavy += met.heavySets;
        }
        const diffs: number[] = [];
        for (const l of mainLogs) {
          if (metricLiftKey(l.exercise, l.variation) !== lift || !l.planned_exercise_id) continue;
          const target = plannedById.get(l.planned_exercise_id)?.target_rpe;
          if (target == null || !(Number(l.rpe) > 0)) continue;
          diffs.push(Number(l.rpe) - Number(target));
        }
        allDiffs.push(...diffs);
        const weeksN = Math.max(1, workingStarts.length);
        lifts[lift] = {
          lift,
          e1Start,
          e1End,
          changePct,
          verdict: verdictOf(changePct),
          measurements: values.length,
          hardPerWeek: hard / weeksN,
          heavyPerWeek: heavy == null ? null : heavy / weeksN,
          rpeDiff: mean(diffs),
        };
      }
      return {
        id: m.id,
        name: m.name,
        start: m.start_date,
        end,
        finished: end < today,
        isPeak: own.some((w) => PEAK_PHASE.test(w.training_phase ?? "")) || PEAK_NAME.test(m.name),
        workingWeeks: workingStarts.length,
        sessionsPlanned: plannedDates.length,
        sessionsLogged,
        setsPlanned: plannedSets.length,
        setsLogged: mainLogs.length,
        adherencePct: plannedDates.length ? Math.round((sessionsLogged / plannedDates.length) * 100) : null,
        rpeDiff: mean(allDiffs),
        lifts,
      };
    })
    .filter((b) => b.sessionsPlanned > 0)
    .sort((a, b) => b.start.localeCompare(a.start));
}

export interface StallFinding {
  lift: CompLift;
  blocks: Array<{ name: string; start: string; changePct: number }>;
  suggestions: string[];
}

const pct1 = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(Math.round(n * 10) / 10).toString().replace(".", ",")}`;
const num1 = (n: number) => (Math.round(n * 10) / 10).toString().replace(".", ",");

/**
 * Ett lyft står still när de två senaste avslutade blocken med arbetsveckor (toppningar undantagna)
 * båda ökade e1RM mindre än 2 %. Förslagen bygger på det senaste blockets data
 * och ändrar ingenting; coachen bestämmer.
 */
export function stallFindings(reviews: BlockReview[], ctx: { pushEnabled?: Partial<Record<CompLift, boolean>> } = {}): StallFinding[] {
  const out: StallFinding[] = [];
  for (const lift of LIFTS) {
    const done = reviews.filter((b) => b.finished && !b.isPeak && b.workingWeeks > 0 && b.lifts[lift].changePct != null);
    const [last, prev] = done;
    if (!last || !prev) continue;
    const a = last.lifts[lift];
    const b = prev.lifts[lift];
    if (a.changePct! >= STRONGER_PCT || b.changePct! >= STRONGER_PCT) continue;
    const s: string[] = [];
    const label = LIFT_LABEL_SV[lift];
    if (last.adherencePct != null && last.adherencePct < ADHERENCE_OK_PCT)
      s.push(`Följsamheten var ${last.adherencePct} % (${last.sessionsLogged} av ${last.sessionsPlanned} pass). Ta reda på vad som stoppar passen innan programmet ändras.`);
    if (a.rpeDiff != null && a.rpeDiff >= 0.5)
      s.push(`Loggad RPE i ${label} låg i snitt ${pct1(a.rpeDiff)} över målet. Vikterna är tyngre än planen: sänk startvikten eller mängden och se över sömn och återhämtning.`);
    if (a.heavyPerWeek != null && a.heavyPerWeek < 1)
      s.push(`Under ett tungt set (minst 85 %) per vecka i ${label}. Lägg in ett toppset eller en procenttrappa i nästa block.`);
    if ((a.rpeDiff ?? 0) < 0.5 && a.hardPerWeek <= b.hardPerWeek + 0.5)
      s.push(`Ungefär samma mängd två block i rad (${num1(b.hardPerWeek)} → ${num1(a.hardPerWeek)} hårda set per vecka). Öka med 2–3 hårda set per vecka i nästa block.`);
    if (ctx.pushEnabled && !ctx.pushEnabled[lift] && (a.rpeDiff ?? 0) <= 0)
      s.push(`Viktprogression är av för ${label}. Slå på den under Baselines → Viktprogression så att vikten höjs efter klarade huvudset.`);
    if (a.rpeDiff != null && a.rpeDiff <= -0.75)
      s.push(`Atleten loggar lägre RPE än målet (${pct1(a.rpeDiff)}). Det finns marginal att höja startvikten.`);
    if (last.workingWeeks <= 2 && prev.workingWeeks <= 2)
      s.push(`Blocken har bara ${last.workingWeeks} och ${prev.workingWeeks} arbetsveckor. Förläng till 3–4 arbetsveckor efter intrappningen.`);
    if (!s.length) s.push(`Inget tydligt skäl i datan. Byt huvudvariant eller repintervall i nästa block och följ upp efter blocket.`);
    out.push({
      lift,
      blocks: [{ name: prev.name, start: prev.start, changePct: b.changePct! }, { name: last.name, start: last.start, changePct: a.changePct! }],
      suggestions: s.slice(0, 3),
    });
  }
  return out;
}
