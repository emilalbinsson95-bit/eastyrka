export interface DecisionRow {
  athlete_id: string;
  status: string;
  coach_decision: string;
  plan_changed: boolean | null;
  outcome_dl_next: number | null;
  created_at: string;
}

export const OUTCOME_STATUSES = ["red", "yellow", "push"] as const;

/** Kalenderbaserade 12 månader; inga orsakssamband eller automatiska beslut. */
export function summarizeEakDecisions(rows: DecisionRow[], now: Date) {
  const cutoff = new Date(now);
  const day = cutoff.getUTCDate();
  cutoff.setUTCDate(1);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - 12);
  const lastDay = new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0)).getUTCDate();
  cutoff.setUTCDate(Math.min(day, lastDay));
  const groups = new Map<string, DecisionRow[]>();
  for (const row of rows) {
    const time = new Date(row.created_at).getTime();
    if (time < cutoff.getTime() || time > now.getTime() || !["red", "red_strong", "yellow", "push", "low_confidence"].includes(row.status)) continue;
    groups.set(row.athlete_id, [...(groups.get(row.athlete_id) ?? []), row]);
  }
  return [...groups.entries()].map(([athleteId, suggestions]) => {
    const decided = suggestions.filter((r) => ["approved", "rejected", "modified"].includes(r.coach_decision));
    const answered = decided.filter((r) => r.plan_changed !== null);
    return {
      athleteId,
      count: suggestions.length,
      decided: decided.length,
      approvedPct: decided.length ? 100 * decided.filter((r) => r.coach_decision === "approved").length / decided.length : null,
      changedPct: answered.length ? 100 * answered.filter((r) => r.plan_changed).length / answered.length : null,
      outcomes: OUTCOME_STATUSES.map((status) => {
        const subset = decided.filter((r) => r.status === status || (status === "red" && r.status === "red_strong"));
        const avg = (changed: boolean) => {
          const valid = subset.filter((r) => r.plan_changed === changed && r.outcome_dl_next !== null && Number.isFinite(r.outcome_dl_next));
          return { n: valid.length, mean: valid.length ? valid.reduce((s, r) => s + Number(r.outcome_dl_next), 0) / valid.length : null };
        };
        return { status, changed: avg(true), unchanged: avg(false) };
      }),
    };
  });
}