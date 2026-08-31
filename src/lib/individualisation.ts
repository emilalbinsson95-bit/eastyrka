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

// ---------- application ----------

function scaleSets(sets: number, mult: number): number {
  return clamp(Math.round(sets * mult), 1, 10);
}

export function applyAdjustments(
  weeks: TemplateWeek[],
  adjustments: Adjustment[],
  h: HistoryInputs,
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

    return {
      ...w,
      notes: inRamp
        ? `${w.notes ? `${w.notes} ` : ""}Ramp-in week — reduced sets and RPE after time off.`
        : w.notes,
      sessions: w.sessions.map((s) => ({
        ...s,
        exercises: s.exercises.map((e) => {
          const cat = volumeCategory(e);
          const catMult = byCat.get(cat) ?? 1;
          const mult = isDeload ? 1 : global * catMult * rampMult;
          const next: TemplateExercise = {
            ...e,
            target_sets: isDeload ? e.target_sets : scaleSets(e.target_sets, mult),
          };
          if (inRamp) {
            if (next.target_rpe != null) next.target_rpe = Math.max(5, next.target_rpe - 1);
            if (next.target_rir != null) next.target_rir = Math.min(6, next.target_rir + 1);
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
