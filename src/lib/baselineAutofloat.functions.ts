/**
 * Auto-flytande baseline för EAk (endast den egna övningen).
 * - Mätset per pass (tung singel eller första arbetsset, RPE ≥ 7).
 * - Höjning: minst 12 av de senaste 16 mätpassen efter senaste ändringen
 *   ligger på ≥ 103 %. Ny baseline = median(topp-E1RM) × 0,98, högst +5 %.
 * - Varning nedåt: 6 av de 8 senaste mätpassen under 92 %. Sänkningar görs
 *   manuellt av coachen. Trösklarna är egna designval, inte forskningsvärden.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dailyE1RM, pickMeasurementSet, EAK_PEAK_PCT } from "./eakoefficient";

const PEAK_THRESHOLD = 12;          // minst 12 av de senaste WINDOW mätpassen
const WINDOW = 16;
const PEAK_EAK_PCT = EAK_PEAK_PCT;
const MAX_RAISE = 1.05;             // högst +5 % per höjning
const LOW_PCT = 92, LOW_COUNT = 6, LOW_WINDOW = 8;
const NEW_BASELINE_BUFFER = 0.98;   // ny baseline = median(peak) × 0.98
const MIN_DELTA_KG = 1;             // ignorera ändringar < 1 kg (brus)

export interface BaselineAutoUpdate {
  exercise: string;
  oldBaseline: number;
  newBaseline: number;
  peakCount: number;
  medianPeakE1RM: number;
}

export interface BaselineAutoSkip {
  exercise: string;
  baseline: number;
  peakCount: number;
  reason: "not_enough_peaks" | "no_improvement" | "no_logs";
}

export interface BaselineLowWarning {
  exercise: string;
  baseline: number;
  lowCount: number;
}

export interface BaselineAutoResult {
  updated: BaselineAutoUpdate[];
  skipped: BaselineAutoSkip[];
  warnings: BaselineLowWarning[];
  threshold: number;
  peakEakPct: number;
}

export const autoFloatBaselines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ athleteId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<BaselineAutoResult> => {
    const { athleteId } = data;
    const { userId } = context;

    // Authorize: caller must be the athlete or a coach linked to them.
    if (userId !== athleteId) {
      const { data: link, error: linkErr } = await supabaseAdmin
        .from("coach_athletes")
        .select("id")
        .eq("coach_id", userId)
        .eq("athlete_id", athleteId)
        .maybeSingle();
      if (linkErr) throw new Error(linkErr.message);
      if (!link) throw new Error("Not authorized for this athlete");
    }

    const { data: baselines, error: bErr } = await supabaseAdmin
      .from("baselines")
      .select("id, exercise, one_rm_kg, updated_at")
      .eq("athlete_id", athleteId);
    if (bErr) throw new Error(bErr.message);

    const updated: BaselineAutoUpdate[] = [];
    const skipped: BaselineAutoSkip[] = [];
    const warnings: BaselineLowWarning[] = [];

    for (const b of baselines ?? []) {
      const baseline = Number(b.one_rm_kg);
      if (!baseline || baseline <= 0) continue;

      // Set-1 logs for this exercise AFTER the baseline was last touched.
      const sinceIso = (b.updated_at ?? "1970-01-01").slice(0, 10);
      const { data: logs, error: lErr } = await supabaseAdmin
        .from("training_logs")
        .select("reps, weight_kg, rpe, date, set_number")
        .eq("athlete_id", athleteId)
        .eq("exercise", b.exercise)
        .gte("date", sinceIso)
        .order("date", { ascending: false })
        .limit(600);
      if (lErr) throw new Error(lErr.message);

      const byDate = new Map<string, Array<{ reps: number; weight_kg: number; rpe: number; set_number: number }>>();
      for (const l of logs ?? []) {
        const g = byDate.get(l.date) ?? [];
        g.push({ reps: Number(l.reps), weight_kg: Number(l.weight_kg), rpe: Number(l.rpe), set_number: Number(l.set_number) });
        byDate.set(l.date, g);
      }
      const sessions = [...byDate.keys()].sort().reverse()
        .map((d) => pickMeasurementSet(byDate.get(d)!))
        .filter((m): m is NonNullable<typeof m> => !!m)
        .map((m) => dailyE1RM(m));

      if (sessions.length === 0) {
        skipped.push({ exercise: b.exercise, baseline, peakCount: 0, reason: "no_logs" });
        continue;
      }

      const lowCount = sessions.slice(0, LOW_WINDOW).filter((e) => (e / baseline) * 100 < LOW_PCT).length;
      if (lowCount >= LOW_COUNT) warnings.push({ exercise: b.exercise, baseline, lowCount });

      const peakE1RMs = sessions.slice(0, WINDOW).filter((e) => (e / baseline) * 100 >= PEAK_EAK_PCT);

      if (peakE1RMs.length < PEAK_THRESHOLD) {
        skipped.push({
          exercise: b.exercise,
          baseline,
          peakCount: peakE1RMs.length,
          reason: "not_enough_peaks",
        });
        continue;
      }

      peakE1RMs.sort((a, c) => a - c);
      const mid = Math.floor(peakE1RMs.length / 2);
      const median = peakE1RMs.length % 2
        ? peakE1RMs[mid]
        : (peakE1RMs[mid - 1] + peakE1RMs[mid]) / 2;

      // Round to nearest 0.5 kg.
      const proposed = Math.round(Math.min(median * NEW_BASELINE_BUFFER, baseline * MAX_RAISE) * 2) / 2;

      if (proposed - baseline < MIN_DELTA_KG) {
        skipped.push({
          exercise: b.exercise,
          baseline,
          peakCount: peakE1RMs.length,
          reason: "no_improvement",
        });
        continue;
      }

      const { error: uErr } = await supabaseAdmin
        .from("baselines")
        .update({ one_rm_kg: proposed, updated_at: new Date().toISOString() })
        .eq("id", b.id);
      if (uErr) throw new Error(uErr.message);

      updated.push({
        exercise: b.exercise,
        oldBaseline: baseline,
        newBaseline: proposed,
        peakCount: peakE1RMs.length,
        medianPeakE1RM: Math.round(median * 10) / 10,
      });
    }

    return { updated, skipped, warnings, threshold: PEAK_THRESHOLD, peakEakPct: PEAK_EAK_PCT };
  });
