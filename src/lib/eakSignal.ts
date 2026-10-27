import { dailyE1RM, pickMeasurementSet } from "@/lib/eakoefficient";
import { compLiftKey, type CompLift } from "@/lib/liftIdentity";

/**
 * EAk-motorn v1 — ren signal, aldrig automatiska planändringar.
 * EAk räknas fram automatiskt och FÖRESLÅR ändringar; varje ändring av
 * planen kräver coachens godkännande. Två tidsskalor:
 *  (a) passnivå — styr dagen (befintligt beteende, se eakoefficient.ts)
 *  (b) mesocykelnivå — föreslår ändringar i upplägget (denna fil)
 */

export interface SetLog {
  date: string;
  exercise: string;
  set_number: number;
  reps: number;
  weight_kg: number;
  rpe: number | null;
  is_warmup_reference?: boolean;
  is_technique?:boolean;
}

export interface CheckIn {
  date: string;
  fatigue?: number | null;
  stress?: number | null;
  daily_form?: number | null;
  sleep?: number | null;
  /** Ömhet 1–10, högre = sämre. */
  soreness?: number | null;
  /** Motivation 1–10, lägre = sämre. */
  motivation?: number | null;
}

export interface BlockWindow {
  kind: "working" | "deload" | "peak" | "taper" | "ramp" | "intro";
  start: string;
  end: string;
  /** Mesocykel som blocket hör till; saknas den räknas blocket som egen mesocykel. */
  mesocycleId?: string;
}

/** Alla gränsvärden ligger här. Maskineriet är samma för alla atleter. */
export interface EakStrategy {
  fallStage1Pct: number;
  fallStage2Pct: number;
  pushLowPct: number;
  pushHighPct: number;
  readinessBelowPct: number;
  readinessShare: number;
  mesoMinSessions: number;
  mesoMaxSessions: number;
  inSessionDropStopPct: number;
  inSessionDropOkPct: number;
  noiseRatioFlag: number;
  poolMesocycles: number;
  defaultSem: number;
  warmupRpeDrift: number;
  subjectiveWorseDays: number;
  subjectiveWorsePoints: number;
  historyDays: number;
  pushSessionBelowPct: number;
  pushShare: number;
}

export const DEFAULT_STRATEGY: EakStrategy = {
  fallStage1Pct: 5,
  fallStage2Pct: 10,
  pushLowPct: 104,
  pushHighPct: 106,
  readinessBelowPct: 97,
  readinessShare: 0.5,
  mesoMinSessions: 4,
  mesoMaxSessions: 6,
  inSessionDropStopPct: 5,
  inSessionDropOkPct: 4,
  noiseRatioFlag: 1.5,
  poolMesocycles: 6,
  defaultSem: 2.2,
  warmupRpeDrift: 1.0,
  subjectiveWorseDays: 14,
  subjectiveWorsePoints: 1,
  historyDays: 42,
  pushSessionBelowPct: 103,
  pushShare: 0.75,
};

/** Fyller tomma värden (null/undefined) med standard. */
export function resolveStrategy(partial?: Partial<Record<keyof EakStrategy, number | null>> | null): EakStrategy {
  const out = { ...DEFAULT_STRATEGY };
  if (!partial) return out;
  for (const k of Object.keys(out) as (keyof EakStrategy)[]) {
    const v = partial[k];
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

export type MesoStatus = "insufficient_data" | "red_strong" | "red" | "yellow" | "low_confidence" | "push" | "green";

export interface WarmupLog {
  date: string;
  lift: CompLift;
  load_kg: number;
  rpe: number;
}

export interface SupportingSignals {
  readiness: boolean;
  subjective: boolean;
  warmupDrift: boolean;
}

export interface MesoResult {
  status: MesoStatus;
  /** Svensk förklaring + förslag till coachen. */
  suggestion: string;
  /** Extra varning, t.ex. ovanligt brusigt block. */
  warning: string | null;
  n: number;
  L_M: number;
  dL_M: number;
  EAk_M: number;
  b_M: number;
  /** Poolat, trendjusterat brus i % (SEM_pool); null tills två mesocykler räcker. */
  TE_i: number | null;
  semPool: number | null;
  semCurrent: number | null;
  /** SEM_current / SEM_pool. */
  noiseRatio: number | null;
  /** Ändringströskel theta i %. */
  threshold_i: number;
  readinessSignal: boolean;
  athleteSignal: boolean;
  warmupDrift: boolean;
  supportingSignals: SupportingSignals;
  sustainedPush: boolean;
  nforFlag: boolean;
  strategy: EakStrategy;
  weeklyLoad: WeeklyLoad[];
}

export interface MesoInput {
  logs: SetLog[];
  lift: CompLift;
  baseline: number;
  checkIns?: CheckIn[];
  /** Föregående mesocykel: L_M och gärna antal pass. */
  previous?: { L_M: number; n?: number } | null;
  blocks?: BlockWindow[];
  strategy?: Partial<Record<keyof EakStrategy, number | null>> | null;
  warmups?: WarmupLog[];
  /** Fast uppvärmningsvikt per lyft (kg). */
  warmupLoads?: Partial<Record<CompLift, number>>;
  /** Senaste rebound-test, används för NFOR-flaggan. */
  rebound?: ReboundResult | null;
  sessionLoads?: SessionLoadLog[];
}

/** Mätsets-e1RM och EAk_d per pass för ett lyft, kronologiskt. */
export function sessionPoints(logs: SetLog[], lift: CompLift, baseline: number): { date: string; e1rm: number; eak: number }[] {
  const rows = logs.filter((l) => !l.is_warmup_reference && !l.is_technique && compLiftKey(l.exercise.trim()) === lift && l.rpe != null);
  const byDate = new Map<string, SetLog[]>();
  for (const r of rows) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]);
  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, sets]) => {
      const m = pickMeasurementSet(sets.map((s, i) => ({ ...s, rpe: Number(s.rpe), set_number: s.set_number ?? i + 1 })));
      if (!m) return null;
      const e1rm = dailyE1RM(m);
      return { date, e1rm, eak: baseline > 0 ? (100 * e1rm) / baseline : 0 };
    })
    .filter((p): p is NonNullable<typeof p> => !!p);
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function slope(ys: number[]): number {
  const n = ys.length;
  if (n < 2) return 0;
  const mx = (n - 1) / 2;
  const my = mean(ys);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - mx) * (ys[i] - my);
    den += (i - mx) ** 2;
  }
  return den ? num / den : 0;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface NoiseGroup {
  key: string;
  n: number;
  /** Summa av kvadrerade residualer i % av mesocykelns nivå. */
  ss: number;
  /** SEM_k i %. */
  sem: number;
}

export interface NoiseResult {
  groups: NoiseGroup[];
  semPool: number | null;
  semCurrent: number | null;
}

/**
 * Trendjusterat, poolat brus (Amdi). Bara arbetsveckor räknas; deload, taper,
 * toppning, ramp och första veckan i varje mesocykel tas bort. Mesocykler med
 * färre än tre pass slås ihop med föregående.
 */
export function pooledNoise(
  points: { date: string; e1rm: number }[],
  blocks?: BlockWindow[],
  strategyInput?: Partial<Record<keyof EakStrategy, number | null>> | null,
  opts: { detrend?: boolean } = {},
): NoiseResult {
  const strategy = resolveStrategy(strategyInput);
  const detrend = opts.detrend ?? true;
  const keyOf = (b: BlockWindow) => b.mesocycleId ?? `${b.start}_${b.end}`;
  const mesoStart = new Map<string, string>();
  for (const b of blocks ?? []) {
    const k = keyOf(b);
    const cur = mesoStart.get(k);
    if (!cur || b.start < cur) mesoStart.set(k, b.start);
  }
  const raw = new Map<string, { date: string; e1rm: number }[]>();
  const order: string[] = [];
  for (const p of [...points].sort((a, b) => a.date.localeCompare(b.date))) {
    let key = "all";
    if (blocks?.length) {
      const b = blocks.find((w) => p.date >= w.start && p.date <= w.end);
      if (!b || b.kind !== "working") continue;
      key = keyOf(b);
      const start = mesoStart.get(key);
      if (!start || p.date < addDays(start, 7)) continue;
    }
    if (!raw.has(key)) {
      raw.set(key, []);
      order.push(key);
    }
    raw.get(key)?.push(p);
  }
  // Slå ihop små mesocykler med föregående (bara för brusskattning).
  const merged: { key: string; pts: { date: string; e1rm: number }[] }[] = [];
  for (const k of order) {
    const pts = raw.get(k);
    if (!pts) continue;
    if (pts.length < 3 && merged.length) merged[merged.length - 1].pts.push(...pts);
    else merged.push({ key: k, pts: [...pts] });
  }
  const groups: NoiseGroup[] = [];
  for (const g of merged) {
    const n = g.pts.length;
    if (n < 3) continue;
    const ys = g.pts.map((p) => p.e1rm);
    const level = mean(ys);
    if (level <= 0) continue;
    const b = detrend ? slope(ys) : 0;
    const a = detrend ? level - b * ((n - 1) / 2) : level;
    const ss = ys.reduce((acc, y, t) => acc + ((100 * (y - (a + b * t))) / level) ** 2, 0);
    const df = detrend ? n - 2 : n - 1;
    groups.push({ key: g.key, n, ss, sem: Math.sqrt(ss / df) });
  }
  const pool = groups.slice(-strategy.poolMesocycles);
  const dfSum = pool.reduce((a, g) => a + (detrend ? g.n - 2 : g.n - 1), 0);
  const semPool = pool.length >= 2 && dfSum > 0 ? Math.sqrt(pool.reduce((a, g) => a + g.ss, 0) / dfSum) : null;
  return { groups, semPool, semCurrent: groups.length ? groups[groups.length - 1].sem : null };
}

/** Bakåtkompatibelt: poolat brus i %, null tills två mesocykler räcker. */
export function individualNoise(points: { date: string; e1rm: number }[], blocks?: BlockWindow[]): number | null {
  return pooledNoise(points, blocks).semPool;
}

type Metric = { key: keyof CheckIn; dir: 1 | -1 };
const SUBJECTIVE: Metric[] = [
  { key: "fatigue", dir: 1 },
  { key: "stress", dir: 1 },
  { key: "soreness", dir: 1 },
  { key: "daily_form", dir: -1 },
  { key: "sleep", dir: -1 },
  { key: "motivation", dir: -1 },
];

function worseThan(cur: CheckIn[], prev: CheckIn[], threshold: number): boolean {
  return SUBJECTIVE.some(({ key, dir }) => {
    const c = cur.map((x) => x[key]).filter((x): x is number => typeof x === "number");
    const p = prev.map((x) => x[key]).filter((x): x is number => typeof x === "number");
    if (!c.length || !p.length) return false;
    return dir === 1 ? mean(c) - mean(p) > threshold : mean(p) - mean(c) > threshold;
  });
}

/** Mående sämre än atletens eget snitt de 4–6 veckorna före fönstret. */
export function subjectiveSignal(checkIns: CheckIn[], mStart: string, strategyInput?: Partial<EakStrategy>): boolean {
  const strategy = resolveStrategy(strategyInput);
  const inWindow = checkIns.filter((c) => c.date >= mStart);
  const before = checkIns.filter((c) => c.date < mStart && c.date >= addDays(mStart, -strategy.historyDays));
  if (inWindow.length < 2 || before.length < 2) return false;
  return worseThan(inWindow, before, strategy.subjectiveWorsePoints);
}

/** Har måendet varit sämre i minst `days` dagar (räknat bakåt från senaste incheckningen)? */
export function subjectiveWorseFor(checkIns: CheckIn[], days: number, strategyInput?: Partial<EakStrategy>): boolean {
  const strategy = resolveStrategy(strategyInput);
  if (!checkIns.length) return false;
  const sorted = [...checkIns].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted[sorted.length - 1].date;
  const start = addDays(last, -(days - 1));
  const recent = sorted.filter((c) => c.date >= start);
  // Kräver dokumenterade sämre dagar; två glest placerade värden bevisar inte varaktighet.
  if (new Set(recent.map((c) => c.date)).size < days) return false;
  const before = sorted.filter((c) => c.date < start && c.date >= addDays(start, -strategy.historyDays));
  if (before.length < 2) return false;
  return recent.every((c) => worseThan([c], before, strategy.subjectiveWorsePoints));
}

/** Uppvärmnings-RPE vid samma vikt ligger högre än atletens eget snitt 4–6 veckor tillbaka. */
export function warmupRpeDrift(
  warmups: WarmupLog[],
  lift: CompLift,
  loadKg: number | undefined,
  mStart: string,
  driftThreshold: number,
  historyDays = DEFAULT_STRATEGY.historyDays,
): boolean {
  if (!loadKg) return false;
  const same = warmups.filter((w) => w.lift === lift && w.load_kg === loadKg && Number.isFinite(w.rpe));
  const cur = same.filter((w) => w.date >= mStart).map((w) => w.rpe);
  const prev = same.filter((w) => w.date < mStart && w.date >= addDays(mStart, -historyDays)).map((w) => w.rpe);
  if (!cur.length || !prev.length) return false;
  return mean(cur) - mean(prev) >= driftThreshold;
}

export interface SessionLoadLog {
  date: string;
  sessionRpe: number;
  durationMin: number;
  /** Kondition ingår aldrig i styrkans träningsstatus. */
  sport?: "strength" | "endurance";
}

export interface WeeklyLoad {
  weekStart: string;
  load: number;
  /** Förändring i % mot snittet av de fyra föregående veckorna (null om de saknas). */
  changePct: number | null;
}

/** Veckobelastning = summa av sRPE × minuter. Endast information, styr inga beslut. */
export function weeklySessionLoad(sessions: SessionLoadLog[]): WeeklyLoad[] {
  const byWeek = new Map<string, number>();
  for (const s of sessions) {
    if (s.sport === "endurance" || !Number.isFinite(s.sessionRpe) || s.sessionRpe < 1 || s.sessionRpe > 10 || !Number.isFinite(s.durationMin) || !(s.durationMin > 0)) continue;
    const d = new Date(`${s.date}T00:00:00Z`);
    const dow = (d.getUTCDay() + 6) % 7;
    const wk = addDays(s.date, -dow);
    byWeek.set(wk, (byWeek.get(wk) ?? 0) + s.sessionRpe * s.durationMin);
  }
  const keys = [...byWeek.keys()].sort();
  const first = keys[0];
  const last = keys.at(-1);
  if (!first || !last) return [];
  const weeks: Array<[string, number]> = [];
  for (let date = first; date <= last; date = addDays(date, 7)) weeks.push([date, byWeek.get(date) ?? 0]);
  return weeks.map(([weekStart, load], i) => {
    const prev = weeks.slice(Math.max(0, i - 4), i).map((w) => w[1]);
    const m = prev.length === 4 ? mean(prev) : 0;
    return { weekStart, load, changePct: m > 0 ? (100 * (load - m)) / m : null };
  });
}

const NOISY_TEXT = "Ovanligt brusigt block – dra inte slutsatser för snabbt";
const NFOR_TEXT =
  "Prestationen återhämtar sig inte och atletens mående är sämre sedan över två veckor – utred återhämtningen (sömn, energiintag, sjukdom), inte bara programmet.";

/** Mesocykelutvärdering — ger status + förslag, ändrar aldrig planen själv. */
export function evaluateMesocycle(input: MesoInput): MesoResult {
  const { logs, lift, baseline, checkIns = [], previous = null, blocks, warmups = [], warmupLoads, rebound = null } = input;
  const strategy = resolveStrategy(input.strategy);
  const points = sessionPoints(logs, lift, baseline);
  const window = points.slice(-strategy.mesoMaxSessions);
  const n = window.length;
  const nfor = !!rebound && rebound.R != null && rebound.R < 1 && subjectiveWorseFor(checkIns, strategy.subjectiveWorseDays, strategy);

  const base: Omit<MesoResult, "status" | "suggestion"> = {
    warning: nfor ? NFOR_TEXT : null,
    n,
    L_M: 0,
    dL_M: 0,
    EAk_M: 0,
    b_M: 0,
    TE_i: null,
    semPool: null,
    semCurrent: null,
    noiseRatio: null,
    threshold_i: strategy.fallStage1Pct,
    readinessSignal: false,
    athleteSignal: false,
    warmupDrift: false,
    supportingSignals: { readiness: false, subjective: false, warmupDrift: false },
    sustainedPush: false,
    nforFlag: nfor,
    strategy,
    weeklyLoad: weeklySessionLoad(input.sessionLoads ?? []),
  };

  if (n < strategy.mesoMinSessions || baseline <= 0) {
    return {
      ...base,
      status: "insufficient_data",
      suggestion: `För lite data — minst ${strategy.mesoMinSessions} pass behövs innan EAk kan föreslå något.`,
    };
  }

  const L_M = mean(window.map((p) => p.e1rm));
  const L_prev = previous?.L_M && previous.L_M > 0 ? previous.L_M : baseline;
  const nPrev = previous?.n && previous.n > 0 ? previous.n : n;
  const dL_M = (100 * (L_M - L_prev)) / L_prev;
  const EAk_M = (100 * L_M) / baseline;
  const b_M = slope(window.map((p) => p.e1rm));
  const noise = pooledNoise(points, blocks, strategy);
  const sem = noise.semPool ?? strategy.defaultSem;
  const threshold_i = Math.max(strategy.fallStage1Pct, 1.96 * sem * Math.sqrt(1 / n + 1 / nPrev));
  const noiseRatio = noise.semPool && noise.semCurrent != null ? noise.semCurrent / noise.semPool : null;
  const noisy = noiseRatio != null && noiseRatio > strategy.noiseRatioFlag;
  const readinessSignal =
    window.filter((p) => p.eak < strategy.readinessBelowPct).length >= Math.ceil(n * strategy.readinessShare);
  const mStart = window[0].date;
  const aSignal = subjectiveSignal(checkIns, mStart, strategy);
  const drift = warmupRpeDrift(warmups, lift, warmupLoads?.[lift], mStart, strategy.warmupRpeDrift, strategy.historyDays);
  const sustainedPush = window.filter((p) => p.eak >= strategy.pushSessionBelowPct).length >= Math.ceil(n * strategy.pushShare);
  const supporting = { readiness: readinessSignal, subjective: aSignal, warmupDrift: drift };

  const numbers = {
    ...base,
    n, L_M, dL_M, EAk_M, b_M,
    TE_i: noise.semPool,
    semPool: noise.semPool,
    semCurrent: noise.semCurrent,
    noiseRatio,
    threshold_i,
    readinessSignal,
    athleteSignal: aSignal,
    warmupDrift: drift,
    supportingSignals: supporting,
    sustainedPush,
  };
  const withNoise = (w: string | null) => [w, noisy ? NOISY_TEXT : null].filter(Boolean).join(" ") || null;

  if (dL_M <= -strategy.fallStage2Pct) {
    return { ...numbers, warning: withNoise(numbers.warning), status: "red_strong", suggestion: "Minska volymen eller tidigarelägg avlastning." };
  }
  if (EAk_M >= strategy.pushHighPct || (EAk_M >= strategy.pushLowPct && sustainedPush)) {
    return { ...numbers, status: "push", suggestion: "Atleten ligger före planen: tyngre vikter, mer volym eller uppdatera baseline." };
  }
  const anySupport = readinessSignal || aSignal || drift;
  let status: MesoStatus = "green";
  if (dL_M <= -threshold_i && b_M <= 0 && anySupport) status = "red";
  else if (dL_M <= -threshold_i || (b_M < 0 && dL_M < 0)) status = "yellow";
  if (noisy && (status === "red" || status === "yellow")) {
    return { ...numbers, status: "low_confidence", suggestion: NOISY_TEXT };
  }
  if (status === "red") return { ...numbers, status, suggestion: "Minska volymen nästa block." };
  if (status === "yellow") return { ...numbers, status, suggestion: "Behåll planerad progression, bevaka nästa mesocykel." };
  return { ...numbers, status, suggestion: "Planerad progression fortsätter." };
}

export interface ReboundResult {
  R: number | null;
  passed: boolean;
  explanation: string;
}

/**
 * Rebound-test efter en deloadvecka: medel-EAk_d för de tre första passen
 * efter avlastningen mot de tre första passen i blocket före.
 */
export function reboundTest(
  points: { date: string; eak: number }[],
  blocks: BlockWindow[],
): ReboundResult {
  const sorted = [...blocks].sort((a, b) => a.start.localeCompare(b.start));
  const deloadIdx = sorted.map((b, i) => ({ b, i })).filter(({ b }) => b.kind === "deload").pop();
  if (!deloadIdx || deloadIdx.i === 0) {
    return { R: null, passed: false, explanation: "Ingen avlastningsvecka med föregående block hittades." };
  }
  const deload = deloadIdx.b;
  const prevBlock = sorted[deloadIdx.i - 1];
  const post = points.filter((p) => p.date > deload.end).slice(0, 3).map((p) => p.eak);
  const prev = points.filter((p) => p.date >= prevBlock.start && p.date <= prevBlock.end).slice(0, 3).map((p) => p.eak);
  if (post.length < 3 || prev.length < 3) {
    return { R: null, passed: false, explanation: "För få pass för rebound-test (behöver 3 före och 3 efter avlastningen)." };
  }
  const R = mean(post) / mean(prev);
  return R >= 1
    ? { R, passed: true, explanation: "Överbelastningen var funktionell – nästa block kan gå längre." }
    : { R, passed: false, explanation: "Ingen återhämtning efter avlastning – dra ner." };
}

export type BaselineSource = "competition" | "training_max" | "push_signal" | "manual_correction";

export interface BaselineChange {
  lift: CompLift;
  from: number;
  to: number;
  source: BaselineSource;
  date: string;
}

/**
 * Baseline höjs vid nytt tävlings-/träningsmax eller när coachen godkänner
 * en "push"-signal. Aldrig automatiskt. Coachen kan alltid korrigera manuellt.
 */
export function proposeBaselineChange(current: number, next: number, source: BaselineSource, lift: CompLift, date: string): BaselineChange | null {
  if (next <= 0 || next === current) return null;
  if (source !== "manual_correction" && next < current) return null; // bara manuell korrigering får sänka
  return { lift, from: current, to: next, source, date };
}
