// Strength-specific taper evidence informs the range; the exact curve is a SETPOINT coaching default, not an RTS formula.
import { differenceInCalendarDays, parseISO } from "date-fns";
import { compSetCap } from "@/lib/volumeGuards";
import { dailyE1RM } from "@/lib/eakoefficient";
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
  /** Exclusive volume cutoff; no training inside the peak contributes. */
  startDate?: string;
  deloadWeekStarts?: string[];
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
  /** Median working sets per day the lift was trained (reference window). */
  setsPerExposure: number;
  /** How many days per week the lift was trained (reference window). */
  exposuresPerWeek: number;
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
  /** Which reference the weekly main-lift sets were derived from. */
  reference: PeakReference;
  referenceLabel: string;
  referenceWeeks?: string[];
}

/**
 * How the "normal" weekly volume that the taper cuts from is measured.
 * - recent: mean of the last 6 weeks (reacts fast, but one sick/deload week drags it down)
 * - median: median of trained weeks over ~12 weeks (ignores single odd weeks)
 * - robust: the higher of the two — a dip never makes the taper too light
 */
export type PeakReference = "work3" | "recent" | "median" | "robust";
export const PEAK_REFERENCE_LABEL: Record<PeakReference, string> = {
  work3: "tre senaste arbetsveckorna före toppningen",
  recent: "snitt av senaste 6 veckorna",
  median: "median av träningsveckor, senaste 12 veckorna",
  robust: "högsta av 6-veckorssnitt och 12-veckorsmedian",
};

const HISTORY_DAYS = 92; // ~3 months
const VOLUME_WINDOW_DAYS = 42; // recent 6 weeks set the taper reference volume

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const norm = (s: string) => s.toLowerCase().trim();

/** Shared RTS estimate — same table used by EAk. */
export function peakE1rm(weight: number, reps: number, rpe: number | null): number {
  return dailyE1RM({ weight_kg: weight, reps, rpe: rpe ?? 8 });
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
export function summarizePeaking(h: PeakHistoryInput, reference: PeakReference = "work3"): PeakSummary {
  const ago = (d: string) => differenceInCalendarDays(parseISO(h.today), parseISO(d));
  const logs = h.logs.filter((l) => {
    const d = ago(l.date);
    return d >= 0 && d < HISTORY_DAYS && l.weight_kg > 0 && l.reps > 0;
  });
  const cutoff = h.startDate && h.startDate <= h.today ? h.startDate : h.today;
  const volumeAgo = (d: string) => differenceInCalendarDays(parseISO(cutoff), parseISO(d));
  const prior = logs.filter((l) => volumeAgo(l.date) > 0);
  const workWindows = Array.from({ length: 13 }, (_, i) => i).filter((i) => {
    const rows = prior.filter((l) => Math.floor((volumeAgo(l.date) - 1) / 7) === i);
    const deload = (h.deloadWeekStarts ?? []).some((start) => rows.some((l) => {
      const offset = differenceInCalendarDays(parseISO(l.date), parseISO(start));
      return offset >= 0 && offset < 7;
    }));
    return !deload && rows.some((l) => l.rpe == null || l.rpe >= 6);
  }).slice(0, 3);
  const workLogs = prior.filter((l) => workWindows.includes(Math.floor((volumeAgo(l.date) - 1) / 7)));
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
    const allHits = logs.filter((l) => match(l.exercise));
    const topByDate = new Map<string, number>();
    for (const l of allHits) topByDate.set(l.date, Math.max(topByDate.get(l.date) ?? 0, l.weight_kg));
    // Warm-up sets do not count: logged RPE under 6, or unrated sets below 80 % of that day's top weight.
    const hits = allHits.filter((l) => l.rpe != null ? l.rpe >= 6 : l.weight_kg >= (topByDate.get(l.date) ?? 0) * 0.8);
    const recentHits = recent.filter((l) => hits.includes(l));

    // Most frequently logged name for this lift — use the athlete's own wording.
    const counts = new Map<string, number>();
    for (const l of hits) counts.set(l.exercise, (counts.get(l.exercise) ?? 0) + 1);
    const name = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? FALLBACK_NAME[key];

    const estimates = hits.filter((l) => l.reps <= 8).map((l) => peakE1rm(l.weight_kg, l.reps, l.rpe));
    const logE1rm = estimates.length ? Math.max(...estimates) : null;
    const base = baselineFor(key);
    const e1rm = logE1rm != null || base != null ? Math.max(logE1rm ?? 0, base ?? 0) : null;

    // Weekly set counts over ~12 weeks (only weeks with any training count).
    const weekCounts = new Map<number, number>();
    for (const l of logs) {
      const w = Math.floor(ago(l.date) / 7);
      if (w < 12) weekCounts.set(w, weekCounts.get(w) ?? 0);
    }
    for (const l of hits) {
      const w = Math.floor(ago(l.date) / 7);
      if (w < 12) weekCounts.set(w, (weekCounts.get(w) ?? 0) + 1);
    }
    const meanRecent = weeksCovered > 0 ? recentHits.length / weeksCovered : 0;
    const med = weekCounts.size ? median([...weekCounts.values()]) : 0;
    const weeklySets =
      reference === "work3" ? (workWindows.length ? hits.filter((l) => workLogs.includes(l)).length / workWindows.length : 0) : reference === "recent" ? meanRecent : reference === "median" ? med : Math.max(meanRecent, med);

    // Exposure shape: how the lift is actually trained within a week. A lift
    // done once a week must keep its session and lose sets inside it — not
    // shrink to a single set because the weekly average is low.
    const refHits = reference === "work3" ? hits.filter((l) => workLogs.includes(l)) : recentHits;
    const refWeeks = reference === "work3" ? Math.max(1, workWindows.length) : weeksCovered;
    const byDay = new Map<string, number>();
    for (const l of refHits) byDay.set(l.date, (byDay.get(l.date) ?? 0) + 1);
    const setsPerExposure = byDay.size ? median([...byDay.values()]) : 0;
    const exposuresPerWeek = refWeeks > 0 ? byDay.size / refWeeks : 0;

    const singles = hits.filter((l) => l.reps === 1).map((l) => l.weight_kg);

    lifts[key] = {
      key,
      name,
      // A lift counts as part of the peak when it has recent logs OR a 1RM on file.
      trained: hits.length > 0 || base != null,
      e1rm: e1rm ? Math.round(e1rm * 10) / 10 : null,
      weeklySets,
      setsPerExposure,
      exposuresPerWeek,
      bestSingleKg: singles.length ? Math.max(...singles) : null,
    };
  }

  // Accessories: everything that is not one of the three competition lifts,
  // ranked by how much the athlete actually does of it.
  const accMap = new Map<string, { exercise: string; sets: number; reps: number[] }>();
  for (const l of reference === "work3" ? workLogs : recent) {
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
      weeklySets: reference === "work3" ? a.sets / Math.max(1, workWindows.length) : weeksCovered > 0 ? a.sets / weeksCovered : 0,
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
    thin: reference === "work3" ? workWindows.length < 3 : dates.size < 8,
    reference,
    referenceLabel: PEAK_REFERENCE_LABEL[reference],
    referenceWeeks: workWindows.map((w) => { const d = parseISO(cutoff); d.setDate(d.getDate() - (w + 1) * 7); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }),
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

function mainExercises(
  info: MainLiftInfo,
  cfg: WeekCfg,
  total: number,
  opts: { technique?: boolean; opener?: boolean } = {},
): TemplateExercise[] {
  const out: TemplateExercise[] = [];

  if (opts.technique) {
    return [
      {
        exercise: info.name,
        variation: "Competition technique",
        target_sets: total,
        target_reps: 2,
        target_rpe: 6,
        intensity_metric: "rpe",
        notes: "Speed and position only — same setup and commands as the platform.",
      },
    ];
  }

  out.push({
    exercise: info.name,
    variation: opts.opener ? "Opener single" : "Competition stance & commands",
    target_sets: 1,
    target_reps: opts.opener ? 1 : cfg.topReps,
    target_rpe: cfg.topRpe,
    intensity_metric: "rpe",
    notes:
      info.e1rm != null
        ? `Top set at normal working weight. Current estimated 1RM from the last 3 months: ${Math.round(info.e1rm)} kg.`
        : "Top set by feel — no 1RM on file yet.",
  });

  // Cap back-offs at the realism cap for the rep range so a high-volume
  // athlete never gets an unrealistic peaking session (e.g. 10×4 deadlift).
  const backoffs = Math.min(total - 1, compSetCap(cfg.backoffReps) - 1);
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

const PROTECTIVE = /(nordic|hamstring|leg curl|rdl|romanian|good ?morning|back ?ext|hyperext|face ?pull|pull-?apart|external rot|rotator|row|pallof|plank|dead ?bug|bird ?dog|copenhagen)/i;
const isProtective = (name: string) => PROTECTIVE.test(name);

function accessoryExercises(sum: PeakSummary, cfg: WeekCfg, slots: number): TemplateExercise[] {
  if (cfg.accFactor <= 0 || slots <= 0) return [];
  // Protective work (hamstrings, upper back, rotator cuff, core) is picked
  // first so the injury-prevention dose survives the cut.
  const ranked = [...sum.accessories].sort(
    (a, b) => Number(isProtective(b.exercise)) - Number(isProtective(a.exercise)),
  );
  return ranked.slice(0, slots).map((a) => ({
    exercise: a.exercise,
    target_sets: Math.min(4, Math.floor(a.weeklySets * cfg.accFactor)),
    target_reps: a.reps,
    target_rpe: 6.5,
    intensity_metric: "rpe" as const,
    notes: "Kept from the athlete's own recent work — maintenance dose, never to failure.",
  })).filter((e) => e.target_sets > 0);
}

const PEAK_DAYS: Record<number, number[]> = {
  2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 6],
  5: [1, 2, 3, 5, 6], 6: [1, 2, 3, 4, 5, 6],
};
const DAYS_MEET = [1, 3];

/** Longer blocks add preparation weeks, not extra weeks of deep taper. */
function peakConfigs(duration: number): WeekCfg[] {
  // Gradual main-lift set dose: 90→45% for two weeks, 90→65→40% for three.
  // Longer blocks keep preparation near normal, not six weeks of deep taper.
  const curves: Record<number, number[]> = {
    2: [0.9, 0.45], 3: [0.9, 0.65, 0.4], 4: [0.95, 0.8, 0.65, 0.4],
    5: [1, 0.9, 0.8, 0.65, 0.4], 6: [1, 0.95, 0.9, 0.8, 0.65, 0.4],
  };
  return curves[duration].map((factor, i) => ({
    ...WEEK_CFG[i === duration - 1 ? 2 : i === duration - 2 ? 1 : 0],
    label: i === duration - 1 ? "Tävlingsvecka" : `Toppning vecka ${i + 1}`,
    volFactor: factor, accFactor: i === duration - 1 ? 0 : Math.max(0, factor - 0.1),
    notes: `Arbetsset: cirka ${Math.round(factor * 100)} % av referensveckan. ${i === duration - 1 ? "Två korta teknikpass, därefter vila." : "Behåll vana arbetsvikter och minska antalet set. Inga nya övningar."} SETPOINTs coachförslag, inte en validerad RTS-kurva.`,
  }));
}

/** Build 2–6 weeks; frequency redistributes a single weekly set budget. */
export function buildPeakingWeeks(
  daysPerWeek: number,
  sum: PeakSummary | null,
  opts: { openers?: boolean; weeks?: number; days?: number } = {},
): TemplateWeek[] {
  const summary: PeakSummary =
    sum ??
    ({
      logDays: 0,
      weeksCovered: 0,
      sessionsPerWeek: 0,
      thin: true,
      reference: "recent",
      referenceLabel: PEAK_REFERENCE_LABEL.recent,
      accessories: [],
      lifts: {
        squat: { key: "squat", name: "Back squat", trained: true, e1rm: null, weeklySets: 0, setsPerExposure: 0, exposuresPerWeek: 0, bestSingleKg: null },
        bench: { key: "bench", name: "Bench press", trained: true, e1rm: null, weeklySets: 0, setsPerExposure: 0, exposuresPerWeek: 0, bestSingleKg: null },
        deadlift: { key: "deadlift", name: "Deadlift", trained: true, e1rm: null, weeklySets: 0, setsPerExposure: 0, exposuresPerWeek: 0, bestSingleKg: null },
      },
    } satisfies PeakSummary);

  const keys: MainLiftKey[] = (["squat", "bench", "deadlift"] as MainLiftKey[]).filter(
    (k) => summary.lifts[k].trained,
  );
  const active: MainLiftKey[] = keys.length > 0 ? keys : (["squat", "bench", "deadlift"] as MainLiftKey[]);
  const L = (k: MainLiftKey) => summary.lifts[k];

  const days = clamp(Math.round(daysPerWeek), 2, 6);

  const periodDays = clamp(Math.round(opts.days ?? (opts.weeks ?? 3) * 7), 14, 42);
  const duration = Math.ceil(periodDays / 7);
  const configs = peakConfigs(duration);
  return configs.map((cfg, i) => {
    const weekIndex = i + 1;
    const meetWeek = weekIndex === configs.length;
    const windowDays = i === 0 ? periodDays % 7 || 7 : 7;
    const windowScale = windowDays / 7;
    const sessionCount = meetWeek ? 2 : Math.min(days, windowDays);
    const sessions: Omit<TemplateSession, "day_of_week">[] = Array.from({ length: sessionCount }, () => ({
      title: "", notes: meetWeek ? "Short, light competition practice, then rest before the meet." : "Competition setup and commands. Stop if technique deteriorates.", exercises: [],
    }));
    const sessionSets = (index: number) => sessions[index].exercises.reduce((n, e) => n + e.target_sets, 0);
    for (const key of active) {
      const info = L(key);
      // Taper by cutting sets inside the athlete's own sessions, keeping how
      // often each lift is trained. A once-a-week lift keeps its session with
      // fewer sets — it never shrinks to a single set mid-peak.
      const perExposure = info.setsPerExposure > 0 ? info.setsPerExposure : 3;
      const freq = info.exposuresPerWeek > 0 ? info.exposuresPerWeek : info.weeklySets > 0 ? info.weeklySets / perExposure : 1;
      const desired = meetWeek ? (key === "deadlift" ? 1 : 2)
        : key === "bench" ? days : key === "squat" ? Math.min(days, 3) : days >= 5 ? 2 : 1;
      const exposures = clamp(Math.round(freq * windowScale) || 1, 1, Math.min(desired, sessionCount));
      const total = clamp(
        Math.round(perExposure * cfg.volFactor * windowScale * exposures),
        meetWeek ? exposures : exposures * 2,
        20,
      );
      const used = new Set<number>();
      for (let exposure = 0; exposure < exposures; exposure++) {
        const candidates = sessions.map((_, index) => index).filter((index) => !used.has(index));
        const index = candidates.sort((a, b) => sessionSets(a) - sessionSets(b) || a - b)[0];
        if (index === undefined) continue;
        used.add(index);
        const sets = Math.floor(total / exposures) + (exposure < total % exposures ? 1 : 0);
        sessions[index].exercises.push(...mainExercises(info, cfg, sets, { opener: !meetWeek && exposure === 0 && opts.openers }));
      }
    }
    // With sparse/single-lift history, move existing sets to any empty days.
    for (const empty of sessions.filter((session) => session.exercises.length === 0)) {
      const source = sessions.filter((session) => session.exercises.length > 1).sort((a, b) => b.exercises.length - a.exercises.length)[0];
      if (source) {
        const moved = source.exercises.pop();
        if (moved) empty.exercises.push(moved);
        continue;
      }
      const donor = sessions.flatMap((session) => session.exercises).filter((e) => e.target_sets > 1).sort((a, b) => b.target_sets - a.target_sets)[0];
      if (!donor) continue;
      donor.target_sets -= 1;
      empty.exercises.push({ ...donor, target_sets: 1 });
    }
    const accessoryBudget = accessoryExercises(summary, { ...cfg, accFactor: cfg.accFactor * windowScale }, days >= 4 ? 4 : 3);
    for (const exercise of accessoryBudget) {
      const index = sessions.map((_, index) => index).sort((a, b) => sessionSets(a) - sessionSets(b) || a - b)[0];
      if (index !== undefined) sessions[index].exercises.push(exercise);
    }
    const filled = sessions.filter((session) => session.exercises.length > 0).map((session) => ({
      ...session,
      title: [...new Set(session.exercises.filter((e) => active.some((key) => L(key).name === e.exercise)).map((e) => e.exercise))].join(" + ") + (meetWeek ? " (light)" : ""),
    }));
    const schedule = meetWeek ? DAYS_MEET : windowDays < 7 ? Array.from({ length: sessionCount }, (_, n) => 1 + Math.floor(n * windowDays / sessionCount)) : PEAK_DAYS[days];

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
      referenceSets > 0 ? Math.round((1 - plannedSets / windowScale / referenceSets) * 100) : null;

    return {
      week_index: weekIndex,
      kind: meetWeek ? ("taper" as const) : ("peak" as const),
      label: cfg.label,
      notes:
        `${cfg.notes}${windowDays < 7 ? ` Första perioden är ${windowDays} dagar; setbudgeten är proportionellt kortad, procenten avser sjudagarsdos.` : ""}` +
        (drop != null
          ? ` Main-lift volume this week: ${plannedSets} sets vs ~${Math.round(referenceSets)}/week (${summary.referenceLabel ?? "last 6 weeks"}) (${drop >= 0 ? "−" : "+"}${Math.abs(drop)}%).`
          : ""),
      sessions: filled.map((s, idx) => ({ ...s, day_of_week: schedule?.[idx] ?? idx + 1 })),
    };
  });
}

/** Human-readable lines describing what the peak was based on. */
export function peakingBasis(sum: PeakSummary): string[] {
  const out: string[] = [];
  if (sum.referenceLabel) out.push(`Reference volume: ${sum.referenceLabel}.`);
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
