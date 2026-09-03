// Individualisation engine for auto-generated strength plans.
//
// Takes an athlete's recent history (training logs, readiness surveys, 1RM
// baselines, sick/injured periods) and a template's generated weeks, and
// proposes concrete, explainable adjustments the coach can accept or reject
// one by one before the plan is written to the database.
//
// Everything here is pure — no Supabase, no React — so it is unit-testable.

import { differenceInCalendarDays, parseISO } from "date-fns";
import {
  volumeCategory,
  type TemplateExercise,
  type TemplateWeek,
  type VolumeCategory,
} from "@/lib/strengthTemplates";
import { prescribedWeightKg } from "@/lib/intensity";

// ---------- inputs ----------

export interface HistLog {
  date: string; // yyyy-MM-dd
  exercise: string;
  variation: string | null;
  reps: number;
  weight_kg: number;
  rpe: number | null;
}

export interface HistReadiness {
  date: string;
  fatigue: number | null; // 1-10, high = bad
  work_stress: number | null; // 1-10, high = bad
  life_stress: number | null; // 1-10, high = bad
  daily_form: number | null; // 1-10, high = good
  sleep_hours: number | null;
}

export interface HistBaseline {
  exercise: string;
  one_rm_kg: number;
}

export interface HistUnavailability {
  start_date: string;
  end_date: string;
  reason: string;
}

export interface HistoryInputs {
  today: string; // yyyy-MM-dd
  logs: HistLog[];
  readiness: HistReadiness[];
  baselines: HistBaseline[];
  unavailability: HistUnavailability[];
}

// ---------- adjustments ----------

export type AdjustmentKind =
  | "global-volume"
  | "category-volume"
  | "ramp-in"
  | "loads";

export interface Adjustment {
  id: string;
  kind: AdjustmentKind;
  title: string;
  reason: string;
  /** Short delta summary shown next to the title, e.g. "−15% volym". */
  effect: string;
  /** Volume multiplier, for global/category/ramp kinds. */
  multiplier?: number;
  category?: VolumeCategory;
  /** For ramp-in: number of leading weeks that are eased in. */
  rampWeeks?: number;
  /** For loads: exercise → suggested working weight per (reps, rpe). */
  severity: "info" | "warn" | "boost";
  defaultOn: boolean;
}

const CAT_LABEL: Record<VolumeCategory, string> = {
  squat: "Squat",
  hinge: "Deadlift / hinge",
  "horizontal-press": "Bench / horizontal press",
  "vertical-press": "Overhead press",
  "horizontal-pull": "Rows",
  "vertical-pull": "Pulldowns / chins",
  quads: "Quads",
  hamstrings: "Hamstrings / glutes",
  delts: "Delts",
  chest: "Chest",
  triceps: "Triceps",
  biceps: "Biceps",
  calves: "Calves",
  core: "Core",
};

export function categoryLabel(c: VolumeCategory): string {
  return CAT_LABEL[c] ?? c;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const pct = (m: number) => `${m >= 1 ? "+" : "−"}${Math.round(Math.abs(m - 1) * 100)}%`;

function daysAgo(today: string, date: string): number {
  return differenceInCalendarDays(parseISO(today), parseISO(date));
}

// ---------- history summaries ----------

export interface HistorySummary {
  logDays: number;
  weeksCovered: number;
  weeklySetsByCategory: Map<VolumeCategory, number>;
  avgFatigue: number | null;
  avgStress: number | null;
  avgForm: number | null;
  readinessCount: number;
  daysSinceLastLog: number | null;
  offDaysLast28: number;
  lastOffReason: string | null;
}

const LOOKBACK_DAYS = 28;

export function summarizeHistory(h: HistoryInputs): HistorySummary {
  const recent = h.logs.filter((l) => {
    const d = daysAgo(h.today, l.date);
    return d >= 0 && d < LOOKBACK_DAYS;
  });

  const dates = new Set(recent.map((l) => l.date));
  const spanDays = recent.length
    ? clamp(
        Math.max(...recent.map((l) => daysAgo(h.today, l.date))) + 1,
        7,
        LOOKBACK_DAYS,
      )
    : 0;
  const weeksCovered = spanDays ? spanDays / 7 : 0;

  const setsByCat = new Map<VolumeCategory, number>();
  for (const l of recent) {
    const cat = volumeCategory({ exercise: l.exercise, variation: l.variation ?? undefined });
    setsByCat.set(cat, (setsByCat.get(cat) ?? 0) + 1);
  }
  const weeklySetsByCategory = new Map<VolumeCategory, number>();
  if (weeksCovered > 0) {
    for (const [c, n] of setsByCat) weeklySetsByCategory.set(c, n / weeksCovered);
  }

  const rec14 = h.readiness.filter((r) => {
    const d = daysAgo(h.today, r.date);
    return d >= 0 && d < 14;
  });
  const avg = (vals: Array<number | null>) => {
    const nums = vals.filter((v): v is number => typeof v === "number");
    return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
  };
  const avgFatigue = avg(rec14.map((r) => r.fatigue));
  const stressVals: Array<number | null> = [];
  for (const r of rec14) {
    const s = avg([r.work_stress, r.life_stress]);
    stressVals.push(s);
  }
  const avgStress = avg(stressVals);
  const avgForm = avg(rec14.map((r) => r.daily_form));

  const allLogDates = h.logs.map((l) => daysAgo(h.today, l.date)).filter((d) => d >= 0);
  const daysSinceLastLog = allLogDates.length ? Math.min(...allLogDates) : null;

  // Days marked sick/injured/other overlapping the last 28 days.
  let offDaysLast28 = 0;
  let lastOffReason: string | null = null;
  let lastOffEndAgo = Infinity;
  for (const u of h.unavailability) {
    const startAgo = daysAgo(h.today, u.start_date); // larger = further back
    const endAgo = daysAgo(h.today, u.end_date);
    const from = Math.min(startAgo, LOOKBACK_DAYS - 1); // window start (older bound)
    const to = Math.max(endAgo, 0); // window end (newer bound)
    const overlap = Math.max(0, from - to + 1);
    if (overlap > 0) {
      offDaysLast28 += overlap;
      if (endAgo < lastOffEndAgo) {
        lastOffEndAgo = endAgo;
        lastOffReason = u.reason;
      }
    }
  }

  return {
    logDays: dates.size,
    weeksCovered,
    weeklySetsByCategory,
    avgFatigue,
    avgStress,
    avgForm,
    readinessCount: rec14.length,
    daysSinceLastLog,
    offDaysLast28,
    lastOffReason,
  };
}

/** Weekly sets per category prescribed by the template (avg over non-deload weeks). */
export function templateWeeklySets(weeks: TemplateWeek[]): Map<VolumeCategory, number> {
  const working = weeks.filter((w) => !/deload/i.test(w.label));
  const src = working.length ? working : weeks;
  const total = new Map<VolumeCategory, number>();
  for (const w of src) {
    for (const s of w.sessions) {
      for (const e of s.exercises) {
        const c = volumeCategory(e);
        total.set(c, (total.get(c) ?? 0) + e.target_sets);
      }
    }
  }
  const out = new Map<VolumeCategory, number>();
  for (const [c, n] of total) out.set(c, n / src.length);
  return out;
}

// ---------- suggestion engine ----------

export const MIN_LOG_DAYS = 6;

export interface SuggestionResult {
  summary: HistorySummary;
  adjustments: Adjustment[];
  /** True when history is too thin — caller falls back to plain template. */
  insufficientData: boolean;
}

export function buildAdjustments(
  weeks: TemplateWeek[],
  h: HistoryInputs,
): SuggestionResult {
  const summary = summarizeHistory(h);
  const adjustments: Adjustment[] = [];
  const insufficientData = summary.logDays < MIN_LOG_DAYS && summary.readinessCount < 4;

  // 1. Readiness / fatigue → global volume
  let readinessMult = 1;
  if (summary.readinessCount >= 4) {
    const fatigue = summary.avgFatigue ?? 5;
    const stress = summary.avgStress ?? 5;
    const form = summary.avgForm ?? 6;
    // load index: high fatigue/stress and low form pull the multiplier down.
    const strain = (fatigue - 5) * 0.05 + (stress - 5) * 0.03 + (6 - form) * 0.04;
    const mult = clamp(Number((1 - strain).toFixed(2)), 0.75, 1.12);
    if (Math.abs(mult - 1) >= 0.04) {
      readinessMult = mult;
      const down = mult < 1;
      adjustments.push({
        id: "readiness",
        kind: "global-volume",
        multiplier: mult,
        title: down ? "Reduce total volume (fatigue)" : "Increase total volume (fresh)",
        effect: `${pct(mult)} sets, all sessions`,
        reason: `Last 14 days: fatigue ${fatigue.toFixed(1)}/10, stress ${stress.toFixed(1)}/10, daily form ${form.toFixed(1)}/10 across ${summary.readinessCount} check-ins.`,
        severity: down ? "warn" : "boost",
        defaultOn: true,
      });
    }
  }

  // 2. Past volume per category → per-category set scaling
  if (summary.logDays >= MIN_LOG_DAYS) {
    const tpl = templateWeeklySets(weeks);
    for (const [cat, tplSets] of tpl) {
      if (tplSets < 2) continue;
      const actual = summary.weeklySetsByCategory.get(cat) ?? 0;
      if (actual < 1) continue; // never trained → keep template intent
      const ratio = tplSets / actual;
      if (ratio > 1.4) {
        // Template jumps far above what they've been doing → cap the jump at +30%.
        const mult = clamp(Number(((actual * 1.3) / tplSets).toFixed(2)), 0.6, 0.97);
        adjustments.push({
          id: `cat-down-${cat}`,
          kind: "category-volume",
          category: cat,
          multiplier: mult,
          title: `Ease in ${categoryLabel(cat)}`,
          effect: `${pct(mult)} sets (${tplSets.toFixed(0)} → ${(tplSets * mult).toFixed(0)}/week)`,
          reason: `Logged ~${actual.toFixed(0)} sets/week over the last 4 weeks; the template prescribes ${tplSets.toFixed(0)}. Capped at a +30% jump.`,
          severity: "warn",
          defaultOn: true,
        });
      } else if (ratio < 0.7) {
        // Never add volume on top of a fatigue signal — the readiness cut wins.
        if (readinessMult < 1) continue;
        const mult = clamp(Number(((actual * 0.85) / tplSets).toFixed(2)), 1.03, 1.35);
        adjustments.push({
          id: `cat-up-${cat}`,
          kind: "category-volume",
          category: cat,
          multiplier: mult,
          title: `Raise ${categoryLabel(cat)} volume`,
          effect: `${pct(mult)} sets (${tplSets.toFixed(0)} → ${(tplSets * mult).toFixed(0)}/week)`,
          reason: `Already handling ~${actual.toFixed(0)} sets/week — the template would be a step back.`,
          severity: "boost",
          defaultOn: true,
        });
      }
    }
  }


  // 3. Time off / long gap → ramp-in on the first weeks
  const gap = summary.daysSinceLastLog;
  const bigGap = gap != null && gap >= 10;
  if (summary.offDaysLast28 >= 4 || bigGap) {
    const severityDays = Math.max(summary.offDaysLast28, bigGap ? gap! : 0);
    const rampWeeks = severityDays >= 14 ? 2 : 1;
    const mult = severityDays >= 14 ? 0.7 : 0.8;
    adjustments.push({
      id: "ramp-in",
      kind: "ramp-in",
      multiplier: mult,
      rampWeeks,
      title: `Ramp-in first ${rampWeeks} week${rampWeeks > 1 ? "s" : ""}`,
      effect: `${pct(mult)} sets & −1 RPE in week 1${rampWeeks > 1 ? "–2" : ""}`,
      reason: summary.offDaysLast28
        ? `${summary.offDaysLast28} day(s) marked ${summary.lastOffReason ?? "unavailable"} in the last 4 weeks${bigGap ? ` and ${gap} days since the last logged set` : ""}.`
        : `${gap} days since the last logged set.`,
      severity: "warn",
      defaultOn: true,
    });
  }

  // 4. Baselines → prescribed working weights
  if (h.baselines.length > 0) {
    const covered = countLoadableExercises(weeks, h.baselines);
    if (covered.matched > 0) {
      adjustments.push({
        id: "loads",
        kind: "loads",
        title: "Prescribe working weights from 1RM",
        effect: `${covered.matched} of ${covered.total} exercises get a target kg`,
        reason: `Using baselines: ${h.baselines
          .slice(0, 4)
          .map((b) => `${b.exercise} ${b.one_rm_kg}kg`)
          .join(", ")}${h.baselines.length > 4 ? "…" : ""} × the RPE/rep table.`,
        severity: "info",
        defaultOn: true,
      });
    }
  }

  return { summary, adjustments, insufficientData };
}

// ---------- baseline matching ----------

function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z ]/g, "").trim();
}

export function matchBaseline(
  ex: Pick<TemplateExercise, "exercise">,
  baselines: HistBaseline[],
): HistBaseline | undefined {
  const name = normName(ex.exercise);
  let best: HistBaseline | undefined;
  let bestLen = 0;
  for (const b of baselines) {
    const bn = normName(b.exercise);
    if (!bn) continue;
    if (name === bn || name.includes(bn) || bn.includes(name)) {
      if (bn.length > bestLen) {
        best = b;
        bestLen = bn.length;
      }
    }
  }
  return best;
}

function countLoadableExercises(weeks: TemplateWeek[], baselines: HistBaseline[]) {
  const seen = new Set<string>();
  let matched = 0;
  for (const w of weeks) {
    for (const s of w.sessions) {
      for (const e of s.exercises) {
        const key = normName(e.exercise);
        if (seen.has(key)) continue;
        seen.add(key);
        if (matchBaseline(e, baselines)) matched++;
      }
    }
  }
  return { matched, total: seen.size };
}

// ---------- coach tuning (manual sliders on top of the engine) ----------

export interface CoachTuning {
  /** Global set multiplier applied to every working week. 0.7 – 1.3 */
  volume: number;
  /** RPE offset applied to working weeks (RIR moves the opposite way). −1.5 – +1.5 */
  intensity: number;
  /** Extra multiplier on isolation / accessory categories only. 0.5 – 1.5 */
  accessory: number;
  /** Extra multiplier on the main competition lifts (squat / bench / deadlift patterns). */
  mainLifts: number;
}

export const DEFAULT_TUNING: CoachTuning = {
  volume: 1,
  intensity: 0,
  accessory: 1,
  mainLifts: 1,
};

const MAIN_CATS: VolumeCategory[] = ["squat", "hinge", "horizontal-press"];
const ACCESSORY_CATS: VolumeCategory[] = [
  "quads",
  "hamstrings",
  "delts",
  "chest",
  "triceps",
  "biceps",
  "calves",
  "core",
];

export function isMainCategory(c: VolumeCategory): boolean {
  return MAIN_CATS.includes(c);
}
export function isAccessoryCategory(c: VolumeCategory): boolean {
  return ACCESSORY_CATS.includes(c);
}

// ---------- volume landmarks (Israetel-style weekly set ranges) ----------

/** [MEV, MRV] weekly working sets per category for an intermediate lifter. */
export const VOLUME_LANDMARKS: Record<VolumeCategory, [number, number]> = {
  squat: [6, 20],
  hinge: [4, 16],
  "horizontal-press": [6, 22],
  "vertical-press": [4, 16],
  "horizontal-pull": [6, 25],
  "vertical-pull": [6, 25],
  quads: [6, 22],
  hamstrings: [6, 20],
  delts: [6, 26],
  chest: [6, 22],
  triceps: [4, 20],
  biceps: [4, 20],
  calves: [6, 20],
  core: [0, 25],
};

export interface VolumeWarning {
  category: VolumeCategory;
  sets: number;
  level: "below-mev" | "above-mrv";
  message: string;
}

/** Weekly-set sanity check against MEV/MRV for the working (non-deload) weeks. */
export function volumeWarnings(weeks: TemplateWeek[]): VolumeWarning[] {
  const perWeek = templateWeeklySets(weeks);
  const out: VolumeWarning[] = [];
  for (const [cat, sets] of perWeek) {
    const [mev, mrv] = VOLUME_LANDMARKS[cat] ?? [0, 99];
    const n = Math.round(sets);
    if (n > mrv) {
      out.push({
        category: cat,
        sets: n,
        level: "above-mrv",
        message: `${categoryLabel(cat)}: ${n} sets/week is above the usual max recoverable volume (~${mrv}).`,
      });
    } else if (mev > 0 && n > 0 && n < mev) {
      out.push({
        category: cat,
        sets: n,
        level: "below-mev",
        message: `${categoryLabel(cat)}: ${n} sets/week is below the usual minimum effective volume (~${mev}).`,
      });
    }
  }
  return out.sort((a, b) => (a.level === b.level ? b.sets - a.sets : a.level === "above-mrv" ? -1 : 1));
}

// ---------- application ----------

interface SetSlot {
  key: string; // week|session|exercise index
  base: number;
  mult: number;
  cat: VolumeCategory;
}

/**
 * Round a group of scaled set counts so the group total matches the exact
 * scaled total (largest-remainder). Without this, a −8% multiplier on 3-set
 * exercises rounds away to nothing.
 */
function distributeSets(slots: SetSlot[]): Map<string, number> {
  const out = new Map<string, number>();
  const byCat = new Map<VolumeCategory, SetSlot[]>();
  for (const s of slots) {
    const arr = byCat.get(s.cat) ?? [];
    arr.push(s);
    byCat.set(s.cat, arr);
  }
  for (const [, group] of byCat) {
    const exact = group.map((g) => g.base * g.mult);
    const target = clamp(Math.round(exact.reduce((a, b) => a + b, 0)), group.length, 999);
    const floors = exact.map((v) => clamp(Math.floor(v), 1, 10));
    let remaining = target - floors.reduce((a, b) => a + b, 0);
    const order = exact
      .map((v, i) => ({ i, frac: v - Math.floor(v) }))
      .sort((a, b) => b.frac - a.frac);
    let idx = 0;
    while (remaining > 0 && idx < order.length * 4) {
      const i = order[idx % order.length].i;
      if (floors[i] < 10) {
        floors[i] += 1;
        remaining -= 1;
      }
      idx += 1;
    }
    idx = 0;
    while (remaining < 0 && idx < order.length * 4) {
      const i = order[order.length - 1 - (idx % order.length)].i;
      if (floors[i] > 1) {
        floors[i] -= 1;
        remaining += 1;
      }
      idx += 1;
    }
    group.forEach((g, i) => out.set(g.key, floors[i]));
  }
  return out;
}

export function applyAdjustments(
  weeks: TemplateWeek[],
  adjustments: Adjustment[],
  h: HistoryInputs,
  tuning: CoachTuning = DEFAULT_TUNING,
): TemplateWeek[] {
  const global = adjustments.find((a) => a.kind === "global-volume")?.multiplier ?? 1;
  const byCat = new Map<VolumeCategory, number>();
  for (const a of adjustments) {
    if (a.kind === "category-volume" && a.category && a.multiplier) {
      byCat.set(a.category, a.multiplier);
    }
  }
  const ramp = adjustments.find((a) => a.kind === "ramp-in");
  const doLoads = adjustments.some((a) => a.kind === "loads");

  return weeks.map((w) => {
    const isDeload = /deload/i.test(w.label);
    const inRamp = ramp && !isDeload && w.week_index <= (ramp.rampWeeks ?? 1);
    const rampMult = inRamp ? (ramp!.multiplier ?? 0.8) : 1;

    // 1. Collect every exercise in the week and its combined multiplier.
    const slots: SetSlot[] = [];
    w.sessions.forEach((s, si) => {
      s.exercises.forEach((e, ei) => {
        const cat = volumeCategory(e);
        const catMult = byCat.get(cat) ?? 1;
        const manual =
          tuning.volume *
          (isMainCategory(cat) ? tuning.mainLifts : 1) *
          (isAccessoryCategory(cat) ? tuning.accessory : 1);
        const mult = isDeload ? manual : global * catMult * rampMult * manual;
        slots.push({ key: `${si}:${ei}`, base: e.target_sets, mult, cat });
      });
    });
    const setsByKey = distributeSets(slots);

    return {
      ...w,
      notes: inRamp
        ? `${w.notes ? `${w.notes} ` : ""}Ramp-in week — reduced sets and RPE after time off.`
        : w.notes,
      sessions: w.sessions.map((s, si) => ({
        ...s,
        exercises: s.exercises.map((e, ei) => {
          const next: TemplateExercise = {
            ...e,
            target_sets: setsByKey.get(`${si}:${ei}`) ?? e.target_sets,
          };
          // Intensity: ramp-in cut first, then the coach's manual offset.
          const rpeDelta = (inRamp ? -1 : 0) + (isDeload ? 0 : tuning.intensity);
          if (rpeDelta !== 0) {
            if (next.target_rpe != null) {
              next.target_rpe = clamp(Number((next.target_rpe + rpeDelta).toFixed(1)), 5, 10);
            }
            if (next.target_rir != null) {
              next.target_rir = clamp(Math.round(next.target_rir - rpeDelta), 0, 6);
            }
          }
          if (doLoads) {
            const b = matchBaseline(e, h.baselines);
            if (b) {
              const kg = prescribedWeightKg({
                oneRmKg: b.one_rm_kg,
                reps: next.target_reps,
                metric: next.intensity_metric,
                rpe: next.target_rpe ?? null,
                rir: next.target_rir ?? null,
              });
              if (kg != null) next.target_weight_kg = kg;
            }
          }
          return next;
        }),
      })),
    };
  });
}
