// On-demand weekly review: compares recent logged sets to the upcoming
// week's plan and proposes weight/set changes. Pure — no DB access.

export interface ReviewPlanned {
  id: string;
  exercise: string;
  target_sets: number;
  target_reps: number;
  target_rpe: number | null;
  target_rir: number | null;
  target_weight_kg: number | null;
}

export interface ReviewLog {
  date: string;
  exercise: string;
  reps: number;
  weight_kg: number;
  rpe: number;
  planned_target_rpe: number | null;
}

export interface ReviewSuggestion {
  plannedId: string;
  exercise: string;
  kind: "weight" | "sets";
  from: number | null;
  to: number;
  reason: string;
}

const norm = (s: string) => s.trim().toLowerCase();

/** RIR-adjusted Epley estimate. */
export function e1rm(weight: number, reps: number, rpe: number): number {
  const rir = Math.max(0, 10 - rpe);
  return weight * (1 + (reps + rir) / 30);
}

export function weightFor(e1: number, reps: number, rpe: number): number {
  const rir = Math.max(0, 10 - rpe);
  return Math.round(e1 / (1 + (reps + rir) / 30) / 2.5) * 2.5;
}

function targetRpeOf(p: ReviewPlanned): number | null {
  if (p.target_rpe != null) return Number(p.target_rpe);
  if (p.target_rir != null) return 10 - Number(p.target_rir);
  return null;
}

export function buildWeeklyReview(
  planned: ReviewPlanned[],
  logs: ReviewLog[],
): ReviewSuggestion[] {
  const byEx = new Map<string, ReviewLog[]>();
  for (const l of logs) {
    if (!l.weight_kg || !l.reps || !l.rpe) continue;
    const k = norm(l.exercise);
    const arr = byEx.get(k) ?? [];
    arr.push(l);
    byEx.set(k, arr);
  }
  const out: ReviewSuggestion[] = [];

  for (const p of planned) {
    const hist = byEx.get(norm(p.exercise));
    if (!hist?.length) continue;
    const lastDate = hist.reduce((m, l) => (l.date > m ? l.date : m), "");
    const last = hist.filter((l) => l.date === lastDate);
    const tRpe = targetRpeOf(p);

    // 1. RPE-based weight feedback
    if (tRpe != null && p.target_reps > 0 && p.target_reps <= 12) {
      const best = Math.max(...last.map((l) => e1rm(Number(l.weight_kg), l.reps, Number(l.rpe))));
      const suggested = weightFor(best, p.target_reps, tRpe);
      const cur = p.target_weight_kg != null ? Number(p.target_weight_kg) : null;
      const diff = cur == null ? Infinity : Math.abs(suggested - cur);
      if (suggested > 0 && diff >= 2.5 && (cur == null || diff / cur >= 0.02)) {
        const top = last.reduce((a, b) => (e1rm(b.weight_kg, b.reps, b.rpe) > e1rm(a.weight_kg, a.reps, a.rpe) ? b : a));
        out.push({
          plannedId: p.id,
          exercise: p.exercise,
          kind: "weight",
          from: cur,
          to: suggested,
          reason: `Last session (${lastDate}): ${top.weight_kg} kg × ${top.reps} @ RPE ${top.rpe} → ~${Math.round(best)} kg e1RM. ${p.target_reps} reps @ RPE ${tRpe} ≈ ${suggested} kg.`,
        });
      }
    }

    // 2. Set count feedback from RPE drift vs. prescribed
    const drifts = last
      .filter((l) => l.planned_target_rpe != null)
      .map((l) => Number(l.rpe) - Number(l.planned_target_rpe));
    if (drifts.length >= 2) {
      const avg = drifts.reduce((a, b) => a + b, 0) / drifts.length;
      if (avg >= 1 && p.target_sets >= 4) {
        out.push({
          plannedId: p.id, exercise: p.exercise, kind: "sets",
          from: p.target_sets, to: p.target_sets - 1,
          reason: `Sets ran ~${avg.toFixed(1)} RPE above target last session — trim one set to manage fatigue.`,
        });
      } else if (avg <= -1.5 && p.target_sets < 6) {
        out.push({
          plannedId: p.id, exercise: p.exercise, kind: "sets",
          from: p.target_sets, to: p.target_sets + 1,
          reason: `Sets ran ~${Math.abs(avg).toFixed(1)} RPE below target last session — room for one more set.`,
        });
      }
    }
  }
  return out;
}
