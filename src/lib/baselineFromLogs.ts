/**
 * Derive per-exercise "form baseline" from recent set-1 training logs.
 *
 * Used for cold-start (no coach baseline yet) AND for post-break return-to-load
 * so the 60% × 3×5 prescription tracks the athlete's actual recent form
 * instead of a stale coach input.
 *
 * Method:
 *  - Pull set-1 logs from the last `lookbackDays` days (default 120).
 *  - Compute daily E1RM via the same RPE-Epley used elsewhere.
 *  - Take the **trimmed median of the top 5 E1RMs** per exercise, × 0.98.
 *    Median-of-peaks avoids single lucky logs and matches the 0.98 buffer
 *    used by autoFloatBaselines so the numbers agree.
 */
import { supabase } from "@/integrations/supabase/client";
import { dailyE1RM } from "@/lib/eakoefficient";

export type DerivedBaseline = { exercise: string; oneRmKg: number; sampleCount: number };

export async function deriveBaselinesFromLogs(
  athleteId: string,
  lookbackDays = 120,
): Promise<DerivedBaseline[]> {
  const since = new Date();
  since.setDate(since.getDate() - lookbackDays);
  const sinceIso = since.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("training_logs")
    .select("exercise, reps, weight_kg, rpe, date")
    .eq("athlete_id", athleteId)
    .eq("set_number", 1)
    .gte("date", sinceIso)
    .order("date", { ascending: false })
    .limit(500);
  if (error) throw error;

  const byExercise = new Map<string, number[]>();
  for (const r of data ?? []) {
    const e1rm = dailyE1RM({
      reps: Number(r.reps),
      weight_kg: Number(r.weight_kg),
      rpe: Number(r.rpe),
    });
    if (!isFinite(e1rm) || e1rm <= 0) continue;
    const arr = byExercise.get(r.exercise as string) ?? [];
    arr.push(e1rm);
    byExercise.set(r.exercise as string, arr);
  }

  const out: DerivedBaseline[] = [];
  for (const [exercise, arr] of byExercise) {
    if (arr.length === 0) continue;
    arr.sort((a, b) => b - a);
    const top = arr.slice(0, Math.min(5, arr.length));
    top.sort((a, b) => a - b);
    const mid = Math.floor(top.length / 2);
    const median = top.length % 2 ? top[mid] : (top[mid - 1] + top[mid]) / 2;
    const buffered = Math.round(median * 0.98 * 2) / 2;
    out.push({ exercise, oneRmKg: buffered, sampleCount: arr.length });
  }
  return out;
}
