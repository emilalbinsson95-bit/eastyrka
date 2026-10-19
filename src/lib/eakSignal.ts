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
}

export interface CheckIn {
  date: string;
  fatigue?: number | null;
  stress?: number | null;
  daily_form?: number | null;
  sleep?: number | null;
}

export interface BlockWindow {
  kind: "working" | "deload" | "peak" | "taper" | "ramp";
  start: string;
  end: string;
}

export type MesoStatus = "insufficient_data" | "red_strong" | "red" | "yellow" | "push" | "green";

export interface MesoResult {
  status: MesoStatus;
  /** Svensk förklaring + förslag till coachen. */
  suggestion: string;
  /** Antal pass i fönstret M. */
  n: number;
  /** Medel av mätsets-e1RM i M (kg). */
  L_M: number;
  /** Procentuell förändring mot föregående mesocykel (fallback: baseline). */
  dL_M: number;
  /** 100 * L_M / B. */
  EAk_M: number;
  /** Lutning e1RM per pass i M (minsta kvadrat). */
  b_M: number;
  /** Individuell brusnivå i %, null om < 8 pass. */
  TE_i: number | null;
  /** Individanpassad tröskel i %. */
  threshold_i: number;
  /** Minst hälften av passen i M hade EAk_d < 97. */
  readinessSignal: boolean;
  /** Atletens incheckningar sämre än eget snitt (stödjer bara, triggar aldrig ensamt). */
  athleteSignal: boolean;
  /** EAk_d ≥ 103 i minst 3/4 av passen. */
  sustainedPush: boolean;
}

export interface MesoInput {
  logs: SetLog[];
  lift: CompLift;
  /** Baseline B (kg). */
  baseline: number;
  checkIns?: CheckIn[];
  /** Föregående mesocykels resultat (L_M används som L_prev). */
  previous?: Pick<MesoResult, "L_M"> | null;
  /** Blockfönster för att exkludera deload/peak vid TE_i-beräkning. */
  blocks?: BlockWindow[];
}

const MIN_SESSIONS = 4;
const MAX_SESSIONS = 6;
const DEFAULT_TE = 2.2;

/** Mätsets-e1RM och EAk_d per pass för ett lyft, kronologiskt. */
export function sessionPoints(logs: SetLog[], lift: CompLift, baseline: number): { date: string; e1rm: number; eak: number }[] {
  const rows = logs.filter((l) => compLiftKey(l.exercise.trim()) === lift && l.rpe != null);
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

function sd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

/** Individuellt brus: SD av differenser mellan efterföljande pass / √2, i % av nivån. */
export function individualNoise(
  points: { date: string; e1rm: number }[],
  blocks?: BlockWindow[],
): number | null {
  const light = (d: string) => blocks?.some((b) => (b.kind === "deload" || b.kind === "peak" || b.kind === "taper") && d >= b.start && d <= b.end);
  const usable = points.filter((p) => !light(p.date)).slice(-20);
  if (usable.length < 8) return null;
  const diffs: number[] = [];
  for (let i = 1; i < usable.length; i++) diffs.push(usable[i].e1rm - usable[i - 1].e1rm);
  const level = mean(usable.map((p) => p.e1rm));
  if (level <= 0) return null;
  return (sd(diffs) / Math.sqrt(2) / level) * 100;
}

function athleteSignal(checkIns: CheckIn[], mStart: string): boolean {
  const inWindow = checkIns.filter((c) => c.date >= mStart);
  const before = checkIns.filter((c) => c.date < mStart);
  if (inWindow.length < 2 || before.length < 2) return false;
  const worse = (cur: (number | null | undefined)[], prev: (number | null | undefined)[], dir: 1 | -1): boolean => {
    const c = cur.filter((x): x is number => typeof x === "number");
    const p = prev.filter((x): x is number => typeof x === "number");
    if (!c.length || !p.length) return false;
    return dir === 1 ? mean(c) - mean(p) > 1 : mean(p) - mean(c) > 1;
  };
  return (
    worse(inWindow.map((c) => c.fatigue), before.map((c) => c.fatigue), 1) ||
    worse(inWindow.map((c) => c.stress), before.map((c) => c.stress), 1) ||
    worse(inWindow.map((c) => c.daily_form), before.map((c) => c.daily_form), -1) ||
    worse(inWindow.map((c) => c.sleep), before.map((c) => c.sleep), -1)
  );
}

/** Mesocykelutvärdering — ger status + förslag, ändrar aldrig planen själv. */
export function evaluateMesocycle(input: MesoInput): MesoResult {
  const { logs, lift, baseline, checkIns = [], previous = null, blocks } = input;
  const points = sessionPoints(logs, lift, baseline);
  const window = points.slice(-MAX_SESSIONS);
  const n = window.length;

  const base: Omit<MesoResult, "status" | "suggestion"> = {
    n,
    L_M: 0,
    dL_M: 0,
    EAk_M: 0,
    b_M: 0,
    TE_i: null,
    threshold_i: 5,
    readinessSignal: false,
    athleteSignal: false,
    sustainedPush: false,
  };

  if (n < MIN_SESSIONS || baseline <= 0) {
    return { ...base, status: "insufficient_data", suggestion: "För lite data — minst 4 pass behövs innan EAk kan föreslå något." };
  }

  const L_M = mean(window.map((p) => p.e1rm));
  const L_prev = previous?.L_M && previous.L_M > 0 ? previous.L_M : baseline;
  const dL_M = (100 * (L_M - L_prev)) / L_prev;
  const EAk_M = (100 * L_M) / baseline;
  const b_M = slope(window.map((p) => p.e1rm));
  const TE_i = individualNoise(points, blocks);
  const te = TE_i ?? DEFAULT_TE;
  const threshold_i = Math.max(5, 1.96 * te * Math.sqrt(2 / n));
  const readinessSignal = window.filter((p) => p.eak < 97).length >= Math.ceil(n / 2);
  const aSignal = athleteSignal(checkIns, window[0].date);
  const sustainedPush = window.filter((p) => p.eak >= 103).length >= Math.ceil((3 * n) / 4);

  const numbers = { ...base, n, L_M, dL_M, EAk_M, b_M, TE_i, threshold_i, readinessSignal, athleteSignal: aSignal, sustainedPush };

  if (dL_M <= -10) {
    return { ...numbers, status: "red_strong", suggestion: "Minska volymen eller tidigarelägg avlastning." };
  }
  if (EAk_M >= 104 && sustainedPush) {
    return { ...numbers, status: "push", suggestion: "Atleten ligger före planen: tyngre vikter, mer volym eller uppdatera baseline." };
  }
  if (dL_M <= -threshold_i && b_M <= 0 && (readinessSignal || aSignal)) {
    return { ...numbers, status: "red", suggestion: "Minska volymen nästa block." };
  }
  if (dL_M <= -threshold_i || (b_M < 0 && dL_M < 0)) {
    return { ...numbers, status: "yellow", suggestion: "Behåll planerad progression, bevaka nästa mesocykel." };
  }
  return { ...numbers, status: "green", suggestion: "Planerad progression fortsätter." };
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
