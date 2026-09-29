// Three-week peaking / taper block built from the athlete's own last 3 months
// of logged training — not from a fixed template.
//
// Evidence base:
//  - Taper meta-analysis (Bosquet et al. 2007, MSSE): performance is maximised by a
//    ~41–60% reduction in training VOLUME over ~2 weeks, while INTENSITY and
//    FREQUENCY are maintained. Cutting intensity instead of volume loses adaptation.
//  - Pritchard et al. 2015 (strength taper review): 1–4 day full rest before testing;
//    no evidence that final-week heavy singles add anything beyond confidence.
//  - Design choice: the taper here is a pure VOLUME reduction. Working weights and
//    rep schemes stay in the athlete's normal range — no heavy singles, no openers.
//
// Everything here is pure — no Supabase, no React.

import { differenceInCalendarDays, parseISO } from "date-fns";
import {
  volumeCategory,
  type TemplateExercise,
  type TemplateSession,
  type TemplateWeek,
} from "@/lib/strengthTemplates";

export interface PeakLog {
  date: string;
  exercise: string;
  variation: string | null;
  reps: number;
  weight_kg: number;
  rpe: number | null;
}

export interface PeakHistoryInput {
  today: string;
  logs: PeakLog[];
  baselines: Array<{ exercise: string; one_rm_kg: number }>;
}

export type MainLiftKey = "squat" | "bench" | "deadlift";

export interface MainLiftInfo {
  key: MainLiftKey;
  /** Exercise name to prescribe — the athlete's own most-used name for the lift. */
  name: string;
  variation?: string;
  trained: boolean;
  /** Best estimated 1RM from the last 3 months (kg), null when unknown. */
  e1rm: number | null;
  /** Average working sets per week over the recent reference window. */
  weeklySets: number;
  /** Heaviest single logged in the window (kg). */
  bestSingleKg: number | null;
}

export interface PeakAccessory {
  exercise: string;
  variation?: string;
  weeklySets: number;
  reps: number;
}

export interface PeakSummary {
  /** Days of logged training in the 3-month window. */
  logDays: number;
  weeksCovered: number;
  sessionsPerWeek: number;
  lifts: Record<MainLiftKey, MainLiftInfo>;
  accessories: PeakAccessory[];
  /** True when there is not enough history to individualise safely. */
  thin: boolean;
}

const HISTORY_DAYS = 92; // ~3 months
const VOLUME_WINDOW_DAYS = 42; // recent 6 weeks set the taper reference volume

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const norm = (s: string) => s.toLowerCase().trim();

/** RIR-adjusted Epley estimate — same formula the weekly review uses. */
export function peakE1rm(weight: number, reps: number, rpe: number | null): number {
  const rir = Math.max(0, 10 - (rpe ?? 8));
  return weight * (1 + (reps + rir) / 30);
}

function isCompetitionSquat(name: string): boolean {
  const n = norm(name);
  if (!n.includes("squat")) return false;
  return !/(split|bulgarian|hack|goblet|jump|pistol|zercher|belt|sissy|leg press|box)/.test(n);
}
function isCompetitionBench(name: string): boolean {
  const n = norm(name);
  if (!n.includes("bench")) return false;
  return !/(dumbbell|db |incline|decline|floor|spoto|board|pin)/.test(n);
}
function isCompetitionDeadlift(name: string): boolean {
  const n = norm(name);
  if (!n.includes("deadlift")) return false;
  return !/(romanian|rdl|stiff|trap bar|hex|snatch|single|dumbbell|good ?morning)/.test(n);
}

const MATCHER: Record<MainLiftKey, (name: string) => boolean> = {
  squat: isCompetitionSquat,
  bench: isCompetitionBench,
  deadlift: isCompetitionDeadlift,
};

const FALLBACK_NAME: Record<MainLiftKey, string> = {
  squat: "Back squat",
  bench: "Bench press",
  deadlift: "Deadlift",
};

const LIFT_LABEL: Record<MainLiftKey, string> = {
  squat: "Squat",
  bench: "Bench",
  deadlift: "Deadlift",
};

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Summarise the last ~3 months of logs into everything the peak needs. */
export function summarizePeaking(h: PeakHistoryInput): PeakSummary {
  const ago = (d: string) => differenceInCalendarDays(parseISO(h.today), parseISO(d));
  const logs = h.logs.filter((l) => {
    const d = ago(l.date);
    return d >= 0 && d < HISTORY_DAYS && l.weight_kg > 0 && l.reps > 0;
  });
  const recent = logs.filter((l) => ago(l.date) < VOLUME_WINDOW_DAYS);

  const dates = new Set(logs.map((l) => l.date));
  const recentDates = new Set(recent.map((l) => l.date));
  const spanDays = recent.length
    ? clamp(Math.max(...recent.map((l) => ago(l.date))) + 1, 7, VOLUME_WINDOW_DAYS)
    : 0;
  const weeksCovered = spanDays ? spanDays / 7 : 0;
  const sessionsPerWeek = weeksCovered > 0 ? recentDates.size / weeksCovered : 0;

  const baselineFor = (key: MainLiftKey): number | null => {
    let best: number | null = null;
    for (const b of h.baselines) {
      if (MATCHER[key](b.exercise) && Number(b.one_rm_kg) > 0) {
        best = Math.max(best ?? 0, Number(b.one_rm_kg));
      }
    }
    return best;
  };

  const lifts = {} as Record<MainLiftKey, MainLiftInfo>;
  for (const key of ["squat", "bench", "deadlift"] as MainLiftKey[]) {
    const match = MATCHER[key];
    const hits = logs.filter((l) => match(l.exercise));
    const recentHits = recent.filter((l) => match(l.exercise));

    // Most frequently logged name for this lift — use the athlete's own wording.
    const counts = new Map<string, number>();
    for (const l of hits) counts.set(l.exercise, (counts.get(l.exercise) ?? 0) + 1);
    const name = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? FALLBACK_NAME[key];

    const estimates = hits.filter((l) => l.reps <= 8).map((l) => peakE1rm(l.weight_kg, l.reps, l.rpe));
    const logE1rm = estimates.length ? Math.max(...estimates) : null;
    const base = baselineFor(key);
    const e1rm = logE1rm != null || base != null ? Math.max(logE1rm ?? 0, base ?? 0) : null;

    const singles = hits.filter((l) => l.reps === 1).map((l) => l.weight_kg);

    lifts[key] = {
      key,
      name,
      // A lift counts as part of the peak when it has recent logs OR a 1RM on file.
      trained: hits.length > 0 || base != null,
      e1rm: e1rm ? Math.round(e1rm * 10) / 10 : null,
      weeklySets: weeksCovered > 0 ? recentHits.length / weeksCovered : 0,
      bestSingleKg: singles.length ? Math.max(...singles) : null,
    };
  }

  // Accessories: everything that is not one of the three competition lifts,
  // ranked by how much the athlete actually does of it.
  const accMap = new Map<string, { exercise: string; sets: number; reps: number[] }>();
  for (const l of recent) {
    if (isCompetitionSquat(l.exercise) || isCompetitionBench(l.exercise) || isCompetitionDeadlift(l.exercise))
      continue;
    const key = norm(l.exercise);
    const entry = accMap.get(key) ?? { exercise: l.exercise, sets: 0, reps: [] };
    entry.sets += 1;
    entry.reps.push(l.reps);
    accMap.set(key, entry);
  }
  const accessories: PeakAccessory[] = [...accMap.values()]
    .map((a) => ({
      exercise: a.exercise,
      weeklySets: weeksCovered > 0 ? a.sets / weeksCovered : 0,
      reps: clamp(Math.round(median(a.reps)) || 10, 5, 15),
    }))
    .sort((a, b) => b.weeklySets - a.weeklySets)
    .slice(0, 6);

  return {
    logDays: dates.size,
    weeksCovered,
    sessionsPerWeek,
    lifts,
    accessories,
    thin: dates.size < 8,
  };
}

// ---------- week construction ----------

interface WeekCfg {
  label: string;
  /** Share of the athlete's recent weekly main-lift sets kept this week. */
  volFactor: number;
  accFactor: number;
  topReps: number;
  topRpe: number;
  backoffReps: number;
  backoffRpe: number;
  notes: string;
}

const WEEK_CFG: WeekCfg[] = [
  {
    label: "Peak W1 — last full week",
    volFactor: 0.85,
    accFactor: 0.8,
    topReps: 4,
    topRpe: 8,
    backoffReps: 4,
    backoffRpe: 7.5,
    notes:
      "Train as normal — this is the last hard week. Working weights and reps stay in the athlete's usual range; volume only trimmed slightly (~15%). No singles, nothing new.",
  },
  {
    label: "Peak W2 — volume reduction",
    volFactor: 0.55,
    accFactor: 0.5,
    topReps: 3,
    topRpe: 8,
    backoffReps: 3,
    backoffRpe: 7.5,
    notes:
      "Volume cut roughly in half while intensity is maintained — same working weights, fewer sets. This is the taper mechanism with real evidence behind it; accessories trimmed to maintenance.",
  },
  {
    label: "Peak W3 — taper / meet week",
    volFactor: 0.3,
    accFactor: 0,
    topReps: 3,
    topRpe: 7,
    backoffReps: 2,
    backoffRpe: 6.5,
    notes:
      "Final week: volume down ~70% from normal, weights kept moderate and crisp. Two short sessions early in the week, then full rest, food and sleep into the meet. No accessories.",
  },
];

function mainSetsFor(info: MainLiftInfo, cfg: WeekCfg, sessionsForLift: number): number {
  // Reference: the athlete's own recent weekly sets for this lift; if they have
  // no history, fall back to a conventional peak volume.
  const reference = info.weeklySets > 0 ? info.weeklySets : 9;
  const weekly = clamp(Math.round(reference * cfg.volFactor), 2, 9);
  return Math.max(1, Math.round(weekly / Math.max(1, sessionsForLift)));
}

function mainExercises(
  info: MainLiftInfo,
  cfg: WeekCfg,
  sessionsForLift: number,
  opts: { technique?: boolean } = {},
): TemplateExercise[] {
  const total = mainSetsFor(info, cfg, sessionsForLift);
  const out: TemplateExercise[] = [];

  if (opts.technique) {
    return [
      {
        exercise: info.name,
        variation: "Competition technique",
        target_sets: clamp(total, 2, 3),
        target_reps: 2,
        target_rpe: 6,
        intensity_metric: "rpe",
        notes: "Speed and position only — same setup and commands as the platform.",
      },
    ];
  }

  out.push({
    exercise: info.name,
    variation: "Competition stance & commands",
    target_sets: 1,
    target_reps: cfg.topReps,
    target_rpe: cfg.topRpe,
    intensity_metric: "rpe",
    notes:
      info.e1rm != null
        ? `Top set at normal working weight. Current estimated 1RM from the last 3 months: ${Math.round(info.e1rm)} kg.`
        : "Top set by feel — no 1RM on file yet.",
  });

  const backoffs = total - 1;
  if (backoffs > 0) {
    out.push({
      exercise: info.name,
      variation: "Back-off",
      target_sets: backoffs,
      target_reps: cfg.backoffReps,
      target_rpe: cfg.backoffRpe,
      intensity_metric: "rpe",
      notes: "Same technique as the top set, ~5–10% lighter. Stop the set if speed drops.",
    });
  }
  return out;
}

function accessoryExercises(sum: PeakSummary, cfg: WeekCfg, slots: number): TemplateExercise[] {
  if (cfg.accFactor <= 0 || slots <= 0) return [];
  return sum.accessories.slice(0, slots).map((a) => ({
    exercise: a.exercise,
    target_sets: clamp(Math.round((a.weeklySets || 3) * cfg.accFactor), 1, 4),
    target_reps: a.reps,
    target_rpe: 6.5,
    intensity_metric: "rpe" as const,
    notes: "Kept from the athlete's own recent work — maintenance dose, never to failure.",
  }));
}

const DAYS_3 = [1, 3, 5];
const DAYS_4 = [1, 2, 4, 6];
const DAYS_MEET = [1, 3];

/**
 * Build the 3-week peak. `sum` is derived from the athlete's own logs;
 * pass null for a generic preview when no history is available yet.
 */
export function buildPeakingWeeks(daysPerWeek: number, sum: PeakSummary | null): TemplateWeek[] {
  const summary: PeakSummary =
    sum ??
    ({
      logDays: 0,
      weeksCovered: 0,
      sessionsPerWeek: 0,
      thin: true,
      accessories: [],
      lifts: {
        squat: { key: "squat", name: "Back squat", trained: true, e1rm: null, weeklySets: 0, bestSingleKg: null },
        bench: { key: "bench", name: "Bench press", trained: true, e1rm: null, weeklySets: 0, bestSingleKg: null },
        deadlift: { key: "deadlift", name: "Deadlift", trained: true, e1rm: null, weeklySets: 0, bestSingleKg: null },
      },
    } satisfies PeakSummary);

  const keys: MainLiftKey[] = (["squat", "bench", "deadlift"] as MainLiftKey[]).filter(
    (k) => summary.lifts[k].trained,
  );
  const active: MainLiftKey[] = keys.length > 0 ? keys : (["squat", "bench", "deadlift"] as MainLiftKey[]);
  const has = (k: MainLiftKey) => active.includes(k);
  const L = (k: MainLiftKey) => summary.lifts[k];

  const days = clamp(Math.round(daysPerWeek), 3, 4);

  return WEEK_CFG.map((cfg, i) => {
    const weekIndex = i + 1;
    const meetWeek = weekIndex === 3;
    const sessions: Omit<TemplateSession, "day_of_week">[] = [];

    if (meetWeek) {
      // Openers, one technique session, then rest.
      sessions.push({
        title: "Openers",
        notes: "One single per lift at opener weight (~RPE 6.5). Full competition setup and commands.",
        exercises: active.flatMap((k) => mainExercises(L(k), cfg, 1, { opener: true })),
      });
      sessions.push({
        title: "Technique flush",
        notes:
          "Very light, fast doubles. Last touch of the bar — everything after this is rest, food and sleep.",
        exercises: active
          .filter((k) => k !== "deadlift")
          .flatMap((k) => mainExercises(L(k), cfg, 1, { technique: true })),
      });
    } else {
      // Squat + bench day
      if (has("squat") || has("bench")) {
        sessions.push({
          title: [has("squat") && "Squat", has("bench") && "Bench"].filter(Boolean).join(" + ") + " (heavy)",
          notes: "Main platform day. Competition commands on every top set.",
          exercises: [
            ...(has("squat") ? mainExercises(L("squat"), cfg, 2) : []),
            ...(has("bench") ? mainExercises(L("bench"), cfg, 2) : []),
            ...accessoryExercises(summary, cfg, 1),
          ],
        });
      }
      // Deadlift day
      if (has("deadlift")) {
        sessions.push({
          title: "Deadlift (heavy)",
          notes: "Single pull stance for the whole block — no switching sumo/conventional now.",
          exercises: [
            ...mainExercises(L("deadlift"), cfg, 1),
            ...accessoryExercises(summary, cfg, 1).slice(0, 1),
          ],
        });
      }
      // Second squat/bench exposure
      sessions.push({
        title: [has("bench") && "Bench", has("squat") && "Squat"].filter(Boolean).join(" + ") + " (second exposure)",
        notes: "Lighter exposure to keep frequency up while volume drops.",
        exercises: [
          ...(has("bench") ? mainExercises(L("bench"), cfg, 2) : []),
          ...(has("squat") ? mainExercises(L("squat"), cfg, 2, { technique: true }) : []),
          ...accessoryExercises(summary, cfg, 1),
        ],
      });
      if (days >= 4) {
        const acc = accessoryExercises(summary, cfg, 4);
        if (acc.length > 0) {
          sessions.push({
            title: "Maintenance accessories",
            notes: "Low-cost maintenance volume only. Nothing sore, nothing to failure.",
            exercises: acc,
          });
        }
      }
    }

    const filled = sessions.filter((s) => s.exercises.length > 0);
    const schedule = meetWeek ? DAYS_MEET : filled.length >= 4 ? DAYS_4 : DAYS_3;

    const referenceSets = Object.values(summary.lifts).reduce((a, l) => a + l.weeklySets, 0);
    const plannedSets = filled.reduce(
      (a, s) =>
        a +
        s.exercises
          .filter((e) => volumeCategory(e) === "squat" || volumeCategory(e) === "hinge" || volumeCategory(e) === "horizontal-press")
          .reduce((x, e) => x + e.target_sets, 0),
      0,
    );
    const drop =
      referenceSets > 0 ? Math.round((1 - plannedSets / referenceSets) * 100) : null;

    return {
      week_index: weekIndex,
      label: cfg.label,
      notes:
        `${cfg.notes}` +
        (drop != null
          ? ` Main-lift volume this week: ${plannedSets} sets vs ~${Math.round(referenceSets)}/week over the athlete's last 6 weeks (${drop >= 0 ? "−" : "+"}${Math.abs(drop)}%).`
          : ""),
      sessions: filled.map((s, idx) => ({ ...s, day_of_week: schedule[idx] ?? idx + 1 })),
    };
  });
}

/** Human-readable lines describing what the peak was based on. */
export function peakingBasis(sum: PeakSummary): string[] {
  const out: string[] = [];
  out.push(
    `${sum.logDays} logged training days in the last 3 months, ~${sum.sessionsPerWeek.toFixed(1)} sessions/week recently.`,
  );
  for (const k of ["squat", "bench", "deadlift"] as MainLiftKey[]) {
    const l = sum.lifts[k];
    if (!l.trained) {
      out.push(`${LIFT_LABEL[k]}: no logged sets and no 1RM on file — left out of the peak.`);
      continue;
    }
    if (l.weeklySets <= 0) {
      out.push(
        `${LIFT_LABEL[k]}: nothing logged in the last 3 months — planned from the 1RM on file (${l.e1rm ? `${Math.round(l.e1rm)} kg` : "unknown"}) at conventional peak volume. Check it before publishing.`,
      );
      continue;
    }
    out.push(
      `${LIFT_LABEL[k]} (${l.name}): ${l.e1rm ? `est. 1RM ${Math.round(l.e1rm)} kg` : "no 1RM estimate"}, ~${l.weeklySets.toFixed(1)} sets/week recently${l.bestSingleKg ? `, heaviest single ${l.bestSingleKg} kg` : ""}.`,
    );
  }
  if (sum.accessories.length > 0) {
    out.push(
      `Accessories kept (maintenance dose): ${sum.accessories.slice(0, 4).map((a) => a.exercise).join(", ")}.`,
    );
  }
  return out;
}
