export type Discipline = "run" | "bike" | "swim" | "other";
export type Mode = "quick" | "structured";

export const DISCIPLINES: { value: Discipline; label: string; emoji: string }[] = [
  { value: "run", label: "Run", emoji: "🏃" },
  { value: "bike", label: "Bike", emoji: "🚴" },
  { value: "swim", label: "Swim", emoji: "🏊" },
  { value: "other", label: "Other", emoji: "🏋️" },
];

export function disciplineLabel(d: Discipline | null | undefined) {
  return DISCIPLINES.find((x) => x.value === d)?.label ?? "—";
}
export function disciplineEmoji(d: Discipline | null | undefined) {
  return DISCIPLINES.find((x) => x.value === d)?.emoji ?? "•";
}

export function formatDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || isNaN(totalSeconds) || totalSeconds <= 0) return "—";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  if (m > 0) return s > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${m}m`;
  return `${s}s`;
}

export function parseHMS(h: string, m: string, s: string): number {
  const H = Number(h) || 0;
  const M = Number(m) || 0;
  const S = Number(s) || 0;
  return H * 3600 + M * 60 + S;
}

export function rpeLabel(rpe: number | null | undefined): string {
  if (rpe == null) return "—";
  if (rpe <= 2) return "Very easy";
  if (rpe <= 4) return "Easy";
  if (rpe <= 6) return "Moderate";
  if (rpe <= 8) return "Hard";
  return "Max";
}

export function rpeTone(rpe: number | null | undefined): string {
  if (rpe == null) return "bg-muted text-muted-foreground";
  if (rpe <= 4) return "bg-status-peaking/30 text-status-peaking-foreground";
  if (rpe <= 7) return "bg-status-adapting/30 text-status-adapting-foreground";
  return "bg-status-exhausted/30 text-status-exhausted-foreground";
}

export interface StepInput {
  id?: string;
  parent_id?: string | null;
  order_index: number;
  is_group: boolean;
  repeat_count: number;
  discipline: Discipline | null;
  duration_seconds: number | null;
  target_rpe: number | null;
  notes: string | null;
}

/** Sum total planned seconds across steps, expanding repeat groups. */
export function totalPlannedSeconds(steps: StepInput[]): number {
  // Build groups
  const groups = new Map<string | null, StepInput[]>();
  for (const s of steps) {
    const key = s.parent_id ?? null;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }
  function sumChildren(parentId: string | null): number {
    const kids = (groups.get(parentId) ?? []).sort((a, b) => a.order_index - b.order_index);
    let total = 0;
    for (const k of kids) {
      if (k.is_group) {
        total += k.repeat_count * sumChildren(k.id ?? null);
      } else {
        total += (k.duration_seconds ?? 0) * (k.repeat_count || 1);
      }
    }
    return total;
  }
  return sumChildren(null);
}

/** Average target RPE weighted by planned seconds. */
export function avgTargetRpe(steps: StepInput[]): number | null {
  let weighted = 0;
  let total = 0;
  for (const s of steps) {
    if (s.is_group || s.target_rpe == null || s.duration_seconds == null) continue;
    const sec = s.duration_seconds * (s.repeat_count || 1);
    weighted += s.target_rpe * sec;
    total += sec;
  }
  if (total === 0) return null;
  return Math.round((weighted / total) * 10) / 10;
}
