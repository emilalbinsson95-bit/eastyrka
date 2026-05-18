// RPE-weighted endurance load (TRIMP-style).
// Score = sum over sessions of (minutes × weight(RPE)). Weighting taken from
// Foster's session-RPE method, with a small exponential bias to penalise hard work.

export interface LoadSession {
  date: string; // yyyy-MM-dd
  discipline: string | null;
  actual_total_seconds: number | null;
  planned_total_seconds: number | null;
  overall_rpe: number | null;
  peak_rpe: number | null;
  planned_avg_rpe: number | null;
}

/** Choose the most representative RPE for a session. */
function effectiveRpe(s: LoadSession): number | null {
  return s.overall_rpe ?? s.peak_rpe ?? s.planned_avg_rpe ?? null;
}

/** Choose minutes: actual if logged, otherwise planned. */
function effectiveMinutes(s: LoadSession): number {
  const sec = s.actual_total_seconds ?? s.planned_total_seconds ?? 0;
  return sec / 60;
}

/** RPE weight (Foster sRPE × small exponential bias). */
export function rpeWeight(rpe: number): number {
  // Linear sRPE component
  const lin = rpe;
  // Exponential bias so RPE 8-10 contribute disproportionately more
  const expo = Math.exp(0.18 * (rpe - 5));
  return lin * expo * 0.55;
}

/** Per-session load score (arbitrary units). */
export function sessionLoad(s: LoadSession): number {
  const rpe = effectiveRpe(s);
  if (rpe == null) return 0;
  const min = effectiveMinutes(s);
  return Math.round(min * rpeWeight(rpe));
}

/** RPE bands for stacked bars. */
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

export interface WeeklyBucket {
  weekStart: string; // yyyy-MM-dd (Monday)
  totalMinutes: number;
  load: number;
  perBand: Record<string, number>; // minutes per band id
  perDiscipline: Record<string, number>; // minutes
}

function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay(); // 0 = Sun
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
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
    const min = effectiveMinutes(s);
    b.totalMinutes += min;
    b.load += sessionLoad(s);
    const rpe = effectiveRpe(s);
    if (rpe != null) {
      const band = bandForRpe(rpe);
      b.perBand[band.id] += min;
    }
    const disc = s.discipline ?? "other";
    b.perDiscipline[disc] = (b.perDiscipline[disc] ?? 0) + min;
  }
  // Fill missing weeks
  const sorted = [...buckets.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  if (sorted.length === 0) return [];
  // Generate last N weeks ending today
  const today = new Date();
  const out: WeeklyBucket[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i * 7);
    const wk = mondayOf(d.toISOString().slice(0, 10));
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
