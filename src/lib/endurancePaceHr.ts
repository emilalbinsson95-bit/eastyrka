// Estimate pace + HR + watts + swim pace from RPE, given athlete benchmarks.
// Running: Jack Daniels VDOT-style zones derived from a 10k PB.
// HR: % of HRmax (or Karvonen %HRR when resting HR is available).
// Bike: % of FTP. Swim: % of CSS pace.

import type { Discipline } from "@/lib/endurance";

export interface AthleteBenchmarks {
  ten_k_pb_seconds: number | null;
  max_hr: number | null;
  resting_hr: number | null;
  ftp_watts: number | null;
  css_per_100m_seconds: number | null;
}

/** Format seconds as m:ss. */
export function fmtMSS(sec: number | null | undefined): string {
  if (sec == null || !isFinite(sec) || sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Format pace as m:ss/km. */
export function fmtPacePerKm(secPerKm: number | null | undefined): string {
  if (secPerKm == null || !isFinite(secPerKm) || secPerKm <= 0) return "—";
  return `${fmtMSS(secPerKm)}/km`;
}

/** Format pace per 100m for swim. */
export function fmtPacePer100m(sec: number | null | undefined): string {
  if (sec == null || !isFinite(sec) || sec <= 0) return "—";
  return `${fmtMSS(sec)}/100m`;
}

/**
 * Daniels VDOT from race time (seconds) and distance (meters).
 * Formula: VO2 = -4.6 + 0.182258·v + 0.000104·v²  where v = m/min
 *          %VO2max = 0.8 + 0.1894393·exp(-0.012778·t) + 0.2989558·exp(-0.1932605·t)  t in minutes
 *          VDOT = VO2 / %VO2max
 */
export function vdotFromRace(timeSec: number, distanceM: number): number | null {
  if (!timeSec || !distanceM) return null;
  const tMin = timeSec / 60;
  const v = distanceM / tMin; // m/min
  const vo2 = -4.6 + 0.182258 * v + 0.000104 * v * v;
  const pct = 0.8 + 0.1894393 * Math.exp(-0.012778 * tMin) + 0.2989558 * Math.exp(-0.1932605 * tMin);
  if (pct <= 0) return null;
  return vo2 / pct;
}

/**
 * Race velocity (m/min) for a given VDOT and target %VO2max.
 * Inverts the Daniels VO2-from-velocity quadratic.
 */
function velocityForPctVo2max(vdot: number, pctVo2max: number): number {
  const target = vdot * pctVo2max; // ml/kg/min
  // 0.000104 v² + 0.182258 v - (4.6 + target) = 0
  const a = 0.000104, b = 0.182258, c = -(4.6 + target);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return 0;
  return (-b + Math.sqrt(disc)) / (2 * a); // m/min, positive root
}

/** Convert m/min to seconds per km. */
function mPerMinToSecPerKm(mPerMin: number): number {
  if (mPerMin <= 0) return 0;
  return 60000 / mPerMin;
}

/**
 * Predict the 10k race time (seconds) implied by a given VDOT.
 * Solves vdotFromRace(t, 10000) = vdot via bisection in [25:00, 4:00:00].
 */
export function predict10kFromVdot(vdot: number): number | null {
  if (!vdot || vdot <= 0) return null;
  let lo = 1500;   // 25:00 (very fast)
  let hi = 14400;  // 4:00:00 (very slow)
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    const v = vdotFromRace(mid, 10000);
    if (v == null) return null;
    // Higher VDOT → faster time (smaller t). vdotFromRace decreases as t grows.
    if (v > vdot) lo = mid; else hi = mid;
    if (hi - lo < 0.5) break;
  }
  return Math.round((lo + hi) / 2);
}

export interface RunEffort {
  /** Distance in meters for this effort segment (one rep or one step). */
  distance_m: number;
  /** Duration in seconds for this effort segment. */
  duration_s: number;
  /** Optional average HR during the effort — used to gate noise. */
  avg_hr?: number | null;
  /** Optional average RPE during the effort. */
  avg_rpe?: number | null;
}

/**
 * Compute an optimal 10k prediction from a session's actual efforts.
 * Strategy:
 *  - Consider each effort with both distance and duration recorded.
 *  - Skip very short bursts (<3 min) and easy strides (RPE ≤ 4) — too noisy.
 *  - Convert each qualifying effort to a VDOT via Jack Daniels' formula.
 *  - Take the best VDOT (fastest sustained quality) and convert to a 10k time.
 *  - If no qualifying effort but the whole session is long enough, fall back
 *    to the cumulative effort as a single "race-equivalent".
 * Returns null when there's not enough signal.
 */
export function predict10kFromEfforts(efforts: RunEffort[]): number | null {
  if (!efforts || efforts.length === 0) return null;
  const valid = efforts.filter(
    (e) => e.distance_m > 0 && e.duration_s > 0,
  );
  if (valid.length === 0) return null;

  let bestVdot = 0;

  // Per-effort VDOT — require ≥ 3 min and (when RPE is known) RPE ≥ 5.
  for (const e of valid) {
    if (e.duration_s < 180) continue;
    if (e.avg_rpe != null && e.avg_rpe < 5) continue;
    const v = vdotFromRace(e.duration_s, e.distance_m);
    if (v && v > bestVdot) bestVdot = v;
  }

  // Cumulative fallback — useful for steady runs (no single "rep").
  if (bestVdot === 0) {
    const totalSec = valid.reduce((s, e) => s + e.duration_s, 0);
    const totalM = valid.reduce((s, e) => s + e.distance_m, 0);
    if (totalSec >= 900 && totalM >= 2500) {
      const v = vdotFromRace(totalSec, totalM);
      if (v) bestVdot = v;
    }
  }

  if (bestVdot === 0) return null;
  return predict10kFromVdot(bestVdot);
}


/**
 * RPE 1..10 → target %VO2max for running.
 * Anchored on Daniels paces: E≈70%, M≈82%, T≈88%, I≈97%, R≈105% (interval/rep pace).
 */
function pctVo2maxForRpe(rpe: number): number {
  // Clamp 1..10
  const r = Math.max(1, Math.min(10, rpe));
  // Piecewise linear curve fit to common RPE↔intensity mappings.
  // RPE 1=0.55, 2=0.62, 3=0.68, 4=0.74, 5=0.80, 6=0.85, 7=0.90, 8=0.95, 9=1.00, 10=1.06
  const table: Record<number, number> = {
    1: 0.55, 2: 0.62, 3: 0.68, 4: 0.74, 5: 0.80,
    6: 0.85, 7: 0.90, 8: 0.95, 9: 1.0, 10: 1.06,
  };
  const lo = Math.floor(r), hi = Math.ceil(r);
  if (lo === hi) return table[lo];
  const t = r - lo;
  return table[lo] * (1 - t) + table[hi] * t;
}

/** RPE → %HRmax range (low..high). */
function pctHrMaxForRpe(rpe: number): [number, number] {
  const r = Math.max(1, Math.min(10, rpe));
  // Common training zone mapping:
  // RPE 1:50-60, 2:55-65, 3:60-70, 4:65-75, 5:70-80, 6:75-83, 7:80-87, 8:85-92, 9:90-96, 10:95-100
  const table: Record<number, [number, number]> = {
    1: [0.50, 0.60], 2: [0.55, 0.65], 3: [0.60, 0.70], 4: [0.65, 0.75],
    5: [0.70, 0.80], 6: [0.75, 0.83], 7: [0.80, 0.87], 8: [0.85, 0.92],
    9: [0.90, 0.96], 10: [0.95, 1.00],
  };
  const lo = Math.floor(r), hi = Math.ceil(r);
  const a = table[lo], b = table[hi];
  if (lo === hi) return a;
  const t = r - lo;
  return [a[0] * (1 - t) + b[0] * t, a[1] * (1 - t) + b[1] * t];
}

/** RPE → %FTP range for cycling (Coggan-ish). */
function pctFtpForRpe(rpe: number): [number, number] {
  const r = Math.max(1, Math.min(10, rpe));
  const table: Record<number, [number, number]> = {
    1: [0.40, 0.50], 2: [0.45, 0.55], 3: [0.50, 0.65], 4: [0.60, 0.75],
    5: [0.70, 0.83], 6: [0.80, 0.90], 7: [0.88, 0.95], 8: [0.95, 1.05],
    9: [1.05, 1.18], 10: [1.20, 1.50],
  };
  const lo = Math.floor(r), hi = Math.ceil(r);
  const a = table[lo], b = table[hi];
  if (lo === hi) return a;
  const t = r - lo;
  return [a[0] * (1 - t) + b[0] * t, a[1] * (1 - t) + b[1] * t];
}

/** RPE → % of CSS pace for swimming (1.0 = CSS, >1.0 = slower). */
function pctOfCssPaceForRpe(rpe: number): [number, number] {
  const r = Math.max(1, Math.min(10, rpe));
  // Inverse — bigger number = slower pace.
  // RPE 5 ≈ 1.15-1.10 (easy aerobic), RPE 7 ≈ CSS, RPE 9-10 ≈ faster than CSS.
  const table: Record<number, [number, number]> = {
    1: [1.40, 1.30], 2: [1.30, 1.22], 3: [1.22, 1.16], 4: [1.18, 1.12],
    5: [1.14, 1.08], 6: [1.08, 1.03], 7: [1.03, 1.00], 8: [1.00, 0.96],
    9: [0.97, 0.93], 10: [0.95, 0.90],
  };
  const lo = Math.floor(r), hi = Math.ceil(r);
  const a = table[lo], b = table[hi];
  if (lo === hi) return a;
  const t = r - lo;
  return [a[0] * (1 - t) + b[0] * t, a[1] * (1 - t) + b[1] * t];
}

export interface EstimateResult {
  paceLabel?: string;  // e.g. "5:10–5:25/km" or "1:42/100m"
  hrLabel?: string;    // e.g. "142–158 bpm"
  wattLabel?: string;  // e.g. "180–210 W"
  /** A single recommended number for sorting/exporting (sec/km or watts mid). */
  paceMidSecPerKm?: number;
  hrMid?: number;
}

/**
 * Karvonen target HR when resting HR is available; else %HRmax.
 */
function hrForRpe(rpe: number, b: AthleteBenchmarks): { lo: number; hi: number } | null {
  if (!b.max_hr) return null;
  const [pctLo, pctHi] = pctHrMaxForRpe(rpe);
  if (b.resting_hr && b.resting_hr < b.max_hr) {
    const reserve = b.max_hr - b.resting_hr;
    return {
      lo: Math.round(b.resting_hr + reserve * pctLo),
      hi: Math.round(b.resting_hr + reserve * pctHi),
    };
  }
  return { lo: Math.round(b.max_hr * pctLo), hi: Math.round(b.max_hr * pctHi) };
}

/**
 * Main entry: estimate per-discipline targets for an RPE.
 */
export function estimateForRpe(
  discipline: Discipline,
  rpe: number | null | undefined,
  b: AthleteBenchmarks,
): EstimateResult {
  if (rpe == null) return {};
  const out: EstimateResult = {};

  // Running pace (VDOT)
  if (discipline === "run" && b.ten_k_pb_seconds) {
    const vdot = vdotFromRace(b.ten_k_pb_seconds, 10000);
    if (vdot) {
      const [pctLo, pctHi] = [
        pctVo2maxForRpe(Math.max(1, rpe - 0.5)),
        pctVo2maxForRpe(Math.min(10, rpe + 0.5)),
      ];
      const vLo = velocityForPctVo2max(vdot, pctLo);
      const vHi = velocityForPctVo2max(vdot, pctHi);
      const paceHi = mPerMinToSecPerKm(vLo); // slower
      const paceLo = mPerMinToSecPerKm(vHi); // faster
      if (paceLo && paceHi) {
        out.paceLabel = `${fmtMSS(paceLo)}–${fmtPacePerKm(paceHi)}`;
        out.paceMidSecPerKm = (paceLo + paceHi) / 2;
      }
    }
  }

  // Bike watts
  if (discipline === "bike" && b.ftp_watts) {
    const [pLo, pHi] = pctFtpForRpe(rpe);
    const wLo = Math.round(b.ftp_watts * pLo);
    const wHi = Math.round(b.ftp_watts * pHi);
    out.wattLabel = `${wLo}–${wHi} W`;
  }

  // Swim pace
  if (discipline === "swim" && b.css_per_100m_seconds) {
    const [mLo, mHi] = pctOfCssPaceForRpe(rpe);
    const slow = Math.round(b.css_per_100m_seconds * mLo);
    const fast = Math.round(b.css_per_100m_seconds * mHi);
    // mLo > mHi means slower bound; fast = smaller seconds
    const lo = Math.min(slow, fast);
    const hi = Math.max(slow, fast);
    out.paceLabel = `${fmtMSS(lo)}–${fmtPacePer100m(hi)}`;
    out.paceMidSecPerKm = ((lo + hi) / 2) * 10; // sec/km equiv (rough)
  }

  // Heart rate — all disciplines if max HR present
  const hr = hrForRpe(rpe, b);
  if (hr) {
    out.hrLabel = `${hr.lo}–${hr.hi} bpm`;
    out.hrMid = Math.round((hr.lo + hr.hi) / 2);
  }

  return out;
}

/** Quick check: does the athlete have at least one benchmark? */
export function hasAnyBenchmark(b: AthleteBenchmarks): boolean {
  return !!(b.ten_k_pb_seconds || b.max_hr || b.ftp_watts || b.css_per_100m_seconds);
}

/** Parse "mm:ss" or "h:mm:ss" → seconds. */
export function parseTimeToSeconds(s: string): number | null {
  if (!s) return null;
  const parts = s.split(":").map((p) => Number(p.trim()));
  if (parts.some((n) => !isFinite(n) || n < 0)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

/** Format seconds → "h:mm:ss" or "mm:ss". */
export function secondsToTimeStr(sec: number | null | undefined): string {
  if (sec == null || !isFinite(sec) || sec <= 0) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
