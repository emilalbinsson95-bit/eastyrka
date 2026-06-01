// Endurance training load model.
//
// Foster sRPE: session load = minutes × session-RPE. This is the validated,
// peer-reviewed standard (Foster et al. 1995/2001). No magic constants, no
// extra exponential bias — RPE 10 already weighs ~3× RPE 3 naturally.
//
// When per-rep / per-step actuals exist we feed them in as time-weighted
// segments so a "4×4 min @ RPE 9 with jog rest" doesn't get diluted to a
// flat "30 min @ RPE 6" average.
//
// On top of sRPE we expose:
//   - acwr()        : 7d acute load ÷ 28d chronic load (sweet spot 0.8–1.3)
//   - polarized()   : easy / moderate / hard minute split (Seiler 80/20)
//   - fitnessFatigueSeries() : Banister CTL (42d) / ATL (7d) / TSB form
//
// All time arithmetic uses date-fns to avoid timezone drift.

import { parseISO, startOfWeek, format, addDays, differenceInCalendarDays } from "date-fns";

/** A logged session as seen by the load model. */
export interface LoadSession {
  date: string; // yyyy-MM-dd
  discipline: string | null;
  actual_total_seconds: number | null;
  planned_total_seconds: number | null;
  overall_rpe: number | null;
  /** peak_rpe is intentionally NOT in the fallback chain (overstates load). */
  peak_rpe: number | null;
  planned_avg_rpe: number | null;
  /**
   * Optional time-weighted breakdown derived from endurance_steps + reps.
   * When present, load and band attribution use this instead of overall_rpe.
   */
  segments?: { seconds: number; rpe: number }[];
}

/** Foster session-RPE weight (linear). */
export function rpeWeight(rpe: number): number {
  return Math.max(0, Math.min(10, rpe));
}

/** Time-weighted RPE from segments. */
function segmentsAvgRpe(segs: { seconds: number; rpe: number }[]): number | null {
  let w = 0, total = 0;
  for (const s of segs) {
    if (s.seconds <= 0 || s.rpe == null) continue;
    w += s.rpe * s.seconds;
    total += s.seconds;
  }
  if (total <= 0) return null;
  return w / total;
}

/** Choose a session RPE for fallback (NO peak_rpe — it overstates load). */
function fallbackRpe(s: LoadSession): number | null {
  return s.overall_rpe ?? s.planned_avg_rpe ?? null;
}

function totalSeconds(s: LoadSession): number {
  if (s.segments && s.segments.length) {
    const sum = s.segments.reduce((a, x) => a + Math.max(0, x.seconds), 0);
    if (sum > 0) return sum;
  }
  return s.actual_total_seconds ?? s.planned_total_seconds ?? 0;
}

function effectiveMinutes(s: LoadSession): number {
  return totalSeconds(s) / 60;
}

/** Per-session Foster sRPE load (arbitrary AU). */
export function sessionLoad(s: LoadSession): number {
  // Per-segment path: sum(min_i × rpe_i). Pure Foster, time-weighted.
  if (s.segments && s.segments.length) {
    let load = 0;
    for (const seg of s.segments) {
      if (seg.seconds <= 0 || seg.rpe == null) continue;
      load += (seg.seconds / 60) * rpeWeight(seg.rpe);
    }
    if (load > 0) return Math.round(load);
  }
  const rpe = fallbackRpe(s);
  if (rpe == null) return 0;
  return Math.round(effectiveMinutes(s) * rpeWeight(rpe));
}

/** RPE band a single session falls into (for the stacked bar). */
export const RPE_BANDS = [
  { id: "easy", label: "Easy (1–4)", color: "bg-status-peaking" as const, min: 1, max: 4 },
  { id: "mod", label: "Moderate (5–6)", color: "bg-status-adapting" as const, min: 5, max: 6 },
  { id: "hard", label: "Hard (7–8)", color: "bg-primary" as const, min: 7, max: 8 },
  { id: "max", label: "Max (9–10)", color: "bg-status-exhausted" as const, min: 9, max: 10 },
];

export function bandForRpe(rpe: number): typeof RPE_BANDS[number] {
  for (const b of RPE_BANDS) if (rpe >= b.min && rpe <= b.max) return b;
  return RPE_BANDS[1];
}

/** Add minutes per band, using segments when present. */
function accumulateBands(s: LoadSession, perBand: Record<string, number>) {
  if (s.segments && s.segments.length) {
    for (const seg of s.segments) {
      if (seg.seconds <= 0 || seg.rpe == null) continue;
      perBand[bandForRpe(seg.rpe).id] += seg.seconds / 60;
    }
    return;
  }
  const rpe = fallbackRpe(s);
  if (rpe == null) return;
  perBand[bandForRpe(rpe).id] += effectiveMinutes(s);
}

export interface WeeklyBucket {
  weekStart: string; // yyyy-MM-dd (Monday)
  totalMinutes: number;
  load: number;
  perBand: Record<string, number>; // minutes per band id
  perDiscipline: Record<string, number>; // minutes
}

function mondayOf(dateStr: string): string {
  const d = parseISO(dateStr);
  return format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
}

export function aggregateWeekly(sessions: LoadSession[], weeks = 8): WeeklyBucket[] {
  const buckets = new Map<string, WeeklyBucket>();
  for (const s of sessions) {
    const wk = mondayOf(s.date);
    let b = buckets.get(wk);
    if (!b) {
      b = {
        weekStart: wk, totalMinutes: 0, load: 0,
        perBand: Object.fromEntries(RPE_BANDS.map((x) => [x.id, 0])),
        perDiscipline: {},
      };
      buckets.set(wk, b);
    }
    b.totalMinutes += effectiveMinutes(s);
    b.load += sessionLoad(s);
    accumulateBands(s, b.perBand);
    const disc = s.discipline ?? "other";
    b.perDiscipline[disc] = (b.perDiscipline[disc] ?? 0) + effectiveMinutes(s);
  }
  const todayMon = mondayOf(format(new Date(), "yyyy-MM-dd"));
  const todayMonDate = parseISO(todayMon);
  const out: WeeklyBucket[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const wk = format(addDays(todayMonDate, -i * 7), "yyyy-MM-dd");
    out.push(
      buckets.get(wk) ?? {
        weekStart: wk, totalMinutes: 0, load: 0,
        perBand: Object.fromEntries(RPE_BANDS.map((x) => [x.id, 0])),
        perDiscipline: {},
      },
    );
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Daily load + injury / fitness models                                       */
/* -------------------------------------------------------------------------- */

/** Sum sRPE per calendar day, oldest → newest, padded with zeros. */
export function dailyLoads(sessions: LoadSession[], days: number, anchor: Date = new Date()): { date: string; load: number }[] {
  const byDate = new Map<string, number>();
  for (const s of sessions) {
    byDate.set(s.date, (byDate.get(s.date) ?? 0) + sessionLoad(s));
  }
  const out: { date: string; load: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = format(addDays(anchor, -i), "yyyy-MM-dd");
    out.push({ date: d, load: byDate.get(d) ?? 0 });
  }
  return out;
}

/** Acute (7d) ÷ chronic (28d rolling avg of 7d windows) workload ratio. */
export interface ACWR {
  acute: number;   // sum last 7d
  chronic: number; // avg of last 28d daily load × 7
  ratio: number | null;
  zone: "low" | "optimal" | "high" | "danger" | "insufficient";
}

export function acwr(sessions: LoadSession[], anchor: Date = new Date()): ACWR {
  const series = dailyLoads(sessions, 28, anchor);
  const acute = series.slice(-7).reduce((a, x) => a + x.load, 0);
  const chronicDaily = series.reduce((a, x) => a + x.load, 0) / 28;
  const chronic = chronicDaily * 7;
  let ratio: number | null = null;
  let zone: ACWR["zone"] = "insufficient";
  // Need a meaningful chronic base before the ratio is trustworthy
  if (chronic > 50) {
    ratio = acute / chronic;
    if (ratio < 0.8) zone = "low";
    else if (ratio <= 1.3) zone = "optimal";
    else if (ratio <= 1.5) zone = "high";
    else zone = "danger";
  }
  return { acute: Math.round(acute), chronic: Math.round(chronic), ratio, zone };
}

/** Easy / moderate / hard / max minute split over a window. Seiler 80/20 reference. */
export interface PolarizedSplit {
  totalMin: number;
  easyMin: number; modMin: number; hardMin: number; maxMin: number;
  easyPct: number; modPct: number; hardPct: number; maxPct: number;
}

export function polarizedDistribution(sessions: LoadSession[], anchor: Date = new Date(), days = 28): PolarizedSplit {
  const fromIso = format(addDays(anchor, -days + 1), "yyyy-MM-dd");
  const perBand: Record<string, number> = Object.fromEntries(RPE_BANDS.map((x) => [x.id, 0]));
  for (const s of sessions) {
    if (s.date < fromIso) continue;
    accumulateBands(s, perBand);
  }
  const totalMin = perBand.easy + perBand.mod + perBand.hard + perBand.max;
  const pct = (m: number) => (totalMin > 0 ? (m / totalMin) * 100 : 0);
  return {
    totalMin: Math.round(totalMin),
    easyMin: Math.round(perBand.easy),
    modMin: Math.round(perBand.mod),
    hardMin: Math.round(perBand.hard),
    maxMin: Math.round(perBand.max),
    easyPct: pct(perBand.easy),
    modPct: pct(perBand.mod),
    hardPct: pct(perBand.hard),
    maxPct: pct(perBand.max),
  };
}

/**
 * Banister fitness/fatigue model.
 *   CTL (Chronic Training Load) ≈ exponential moving avg of daily load, τ = 42d → fitness.
 *   ATL (Acute Training Load)   ≈ EMA with τ = 7d → fatigue.
 *   TSB (Training Stress Balance) = CTL − ATL → form (positive = fresh).
 * Implemented as the standard EMA: ema_today = ema_yesterday + (load_today − ema_yesterday) / τ.
 */
export interface FitnessFatiguePoint {
  date: string;
  load: number;
  ctl: number;   // fitness
  atl: number;   // fatigue
  tsb: number;   // form
}

export function fitnessFatigueSeries(
  sessions: LoadSession[],
  days: number,
  anchor: Date = new Date(),
): FitnessFatiguePoint[] {
  // Build daily load going back far enough to seed CTL (extra 60d warm-up).
  const warmup = 60;
  const series = dailyLoads(sessions, days + warmup, anchor);
  let ctl = 0, atl = 0;
  const tauC = 42, tauA = 7;
  const points: FitnessFatiguePoint[] = [];
  for (const { date, load } of series) {
    ctl = ctl + (load - ctl) / tauC;
    atl = atl + (load - atl) / tauA;
    points.push({
      date, load,
      ctl: Math.round(ctl * 10) / 10,
      atl: Math.round(atl * 10) / 10,
      tsb: Math.round((ctl - atl) * 10) / 10,
    });
  }
  return points.slice(-days);
}

/** Helper: build segments for a session from per-step + per-rep actuals. */
export function buildSegmentsFromSteps(
  steps: Array<{ id: string; is_group: boolean; actual_duration_seconds: number | null; actual_avg_rpe: number | null; target_rpe: number | null }>,
  reps: Array<{ step_id: string; actual_duration_seconds: number | null; actual_avg_rpe: number | null }>,
): { seconds: number; rpe: number }[] {
  const repsByStep = new Map<string, typeof reps>();
  for (const r of reps) {
    const arr = repsByStep.get(r.step_id) ?? [];
    arr.push(r);
    repsByStep.set(r.step_id, arr);
  }
  const out: { seconds: number; rpe: number }[] = [];
  for (const st of steps) {
    if (st.is_group) continue;
    const myReps = repsByStep.get(st.id) ?? [];
    let usedRep = false;
    for (const r of myReps) {
      if ((r.actual_duration_seconds ?? 0) > 0) {
        const rpe = r.actual_avg_rpe ?? st.actual_avg_rpe ?? st.target_rpe;
        if (rpe != null) {
          out.push({ seconds: r.actual_duration_seconds!, rpe });
          usedRep = true;
        }
      }
    }
    if (!usedRep && (st.actual_duration_seconds ?? 0) > 0) {
      const rpe = st.actual_avg_rpe ?? st.target_rpe;
      if (rpe != null) out.push({ seconds: st.actual_duration_seconds!, rpe });
    }
  }
  return out;
}

// Re-export for callers that still need the calendar helper.
export function daysBetween(a: string, b: string): number {
  return differenceInCalendarDays(parseISO(b), parseISO(a));
}

/* -------------------------------------------------------------------------- */
/* Feedback loop: drift detection + plan-volume adjustment                    */
/* -------------------------------------------------------------------------- */

/** A session with enough info to compare planned vs actual RPE. */
export interface DriftSession {
  date: string;
  planned_avg_rpe: number | null;
  overall_rpe: number | null;
  peak_rpe: number | null;
  status: string | null;
}

export interface DriftSignal {
  /** Number of recent quality sessions inspected. */
  inspected: number;
  /** How many of those exceeded plan by ≥ 1 RPE point. */
  drifted: number;
  /** Average (actual − planned) RPE across inspected sessions. */
  avgDelta: number;
  /** Plain-language recommendation. */
  recommendation: "hold" | "easy_week" | "reduce_volume";
  /** Suggested multiplier applied to the next mesocycle / next week volume. */
  volumeMultiplier: number;
}

/**
 * Look at the most recent `n` completed quality sessions (planned RPE ≥ 6)
 * and detect whether actual effort is consistently overshooting the plan —
 * a classic early sign of accumulating fatigue or chronic over-reach.
 *
 * Heuristic: if 3+ of the last 5 hard sessions had actual_overall_rpe ≥
 * planned_avg_rpe + 1, recommend a deload-style 0.9× volume scaling for the
 * next training block. Sustained drift (avg ≥ +1.5) triggers a deeper 0.85×.
 */
export function recentQualityDrift(sessions: DriftSession[], n = 5): DriftSignal {
  const eligible = sessions
    .filter((s) => s.status === "completed" && s.planned_avg_rpe != null && s.planned_avg_rpe >= 6 && s.overall_rpe != null)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, n);

  if (eligible.length < 3) {
    return { inspected: eligible.length, drifted: 0, avgDelta: 0, recommendation: "hold", volumeMultiplier: 1.0 };
  }

  let drifted = 0;
  let deltaSum = 0;
  for (const s of eligible) {
    const delta = (s.overall_rpe ?? 0) - (s.planned_avg_rpe ?? 0);
    deltaSum += delta;
    if (delta >= 1) drifted++;
  }
  const avgDelta = deltaSum / eligible.length;

  let recommendation: DriftSignal["recommendation"] = "hold";
  let volumeMultiplier = 1.0;
  if (avgDelta >= 1.5 || drifted >= 4) {
    recommendation = "reduce_volume";
    volumeMultiplier = 0.85;
  } else if (drifted >= 3 || avgDelta >= 1.0) {
    recommendation = "easy_week";
    volumeMultiplier = 0.9;
  }

  return {
    inspected: eligible.length,
    drifted,
    avgDelta: Math.round(avgDelta * 10) / 10,
    recommendation,
    volumeMultiplier,
  };
}

/**
 * Map an ACWR ratio into a volume multiplier appropriate for plan generation.
 *
 * Athletes with chronically high ACWR (>1.3) entering a new mesocycle should
 * NOT start at 100% of the calibrated weekly volume — that compounds risk.
 * Athletes well under-trained (<0.7) can start slightly elevated to ramp
 * faster, but never above 1.05× to keep the standard 10% rule honest.
 */
export function volumeAdjustmentForAcwr(ratio: number | null): number {
  if (ratio == null || !isFinite(ratio)) return 1.0;
  if (ratio >= 1.5) return 0.80; // danger
  if (ratio >= 1.3) return 0.90; // high — start conservatively
  if (ratio <= 0.7) return 1.05; // very low base — small ramp-up
  return 1.0; // optimal
}

/* -------------------------------------------------------------------------- */
/* Volume-adapted polarization target                                          */
/* -------------------------------------------------------------------------- */

/**
 * Personalized polarization target that depends on weekly running volume.
 *
 * Rationale: classic Seiler 80/20 was derived from elite endurance athletes
 * running 90+ km / 8–12 h per week. At those volumes the aerobic base is so
 * large that adding more hard work yields diminishing returns and elevates
 * injury risk — hence ~80 % easy.
 *
 * For low-volume runners (≤ ~20 km / ≤ 150 min per week — e.g. 2 short
 * sessions) the same ratio is counter-productive: there simply isn't enough
 * total stimulus to drive adaptation, and almost no high-intensity work
 * means VO2max, lactate threshold, mitochondrial density and running
 * economy plateau. Time-crunched HIIT literature (Gibala, Stöggl &
 * Sperlich "polarized vs. pyramidal" trial, Esteve-Lanao, Muñoz et al.,
 * Tjønna et al. 4×4) consistently shows that when total weekly minutes are
 * small, weighting the session mix HARD (~60 % quality / 40 % easy) yields
 * larger gains in VO2max, blood pressure and metabolic markers than a
 * dilute 80 % easy split — because the aerobic stimulus per minute of HIIT
 * is much higher.
 *
 * We therefore interpolate the easy target between 40 % (≤ 150 weekly min,
 * i.e. "2 short runs / week" — HIIT-weighted) and 80 % (≥ 450 weekly min
 * ≈ 75–90 km — classic Seiler 80/20). Endurance base still wins for
 * marathon-style economy at high volumes, hence the ramp.
 */
export interface PolarizationTarget {
  /** Easy share in percent (e.g. 72). */
  easyPct: number;
  /** Hard + max share in percent (100 − easyPct − ~modPct allowance). */
  hardPct: number;
  /** Human-readable label, e.g. "70 / 30". */
  label: string;
  /** Short rationale shown next to the target. */
  rationale: string;
  /** Bucket id for analytics / theming. */
  bucket: "low" | "mid-low" | "mid" | "high";
}

export function polarizationTargetForVolume(weeklyMin: number): PolarizationTarget {
  // Anchor points: (minutes, easyPct)
  //  ≤ 150 min/v (≈ 20 km, 2 korta pass) → 40 % easy / 60 % kvalitet (HIIT-tungt)
  //  ≥ 450 min/v (≈ 75–90 km)            → 80 % easy / 20 % kvalitet (Seiler 80/20)
  const lo = 150, hi = 450;
  const easyLo = 40, easyHi = 80;
  let easyPct: number;
  if (weeklyMin <= lo) easyPct = easyLo;
  else if (weeklyMin >= hi) easyPct = easyHi;
  else easyPct = easyLo + ((weeklyMin - lo) / (hi - lo)) * (easyHi - easyLo);
  easyPct = Math.round(easyPct);
  const hardPct = 100 - easyPct;

  let bucket: PolarizationTarget["bucket"];
  let rationale: string;
  if (weeklyMin <= lo) {
    bucket = "low";
    rationale = "Låg volym → HIIT-tungt (60 % kvalitet) ger störst VO2max- och hälsovinst per minut.";
  } else if (weeklyMin < 300) {
    bucket = "mid-low";
    rationale = "Måttlig volym → pyramidalt, fortfarande extra tröskel/VO2 för att driva adaptation.";
  } else if (weeklyMin < hi) {
    bucket = "mid";
    rationale = "Hög volym → närmar sig klassisk 80/20, basen börjar väga tyngre.";
  } else {
    bucket = "high";
    rationale = "Elitvolym → 80/20 polariserat skyddar bas och minimerar skaderisk.";
  }

  return { easyPct, hardPct, label: `${easyPct} / ${hardPct}`, rationale, bucket };
}


