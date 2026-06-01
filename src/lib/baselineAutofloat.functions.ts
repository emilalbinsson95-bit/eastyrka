/**
 * Auto-flytande baseline för EAkoefficient.
 *
 * Princip: baseline ska följa atletens verkliga form över tid — annars
 * fastnar EAk på "Peaking" hela mesocykeln när atleten faktiskt har lyft
 * baseline. Men den får inte vingla från ett bra pass. Vi gör därför
 * uppdateringen TRÖG: kräver minst PEAK_THRESHOLD (=12) set-1-observationer
 * med EAk ≥ 103 % efter senaste baseline-ändringen för det lyftet innan vi
 * höjer baseline.
 *
 * Ny baseline = medianen av dessa peak-E1RM × 0.98. Det placerar atletens
 * snitt-peak runt 102 % på det nya basvärdet (= "Adapting"), vilket är där
 * progression ska fortsätta drivas. Endast höjningar tillåts (autoflytande
 * är till för progression, inte regression — coach hanterar nedjusteringar
 * manuellt).
 *
 * Säkerhet: serverFn använder admin-klient eftersom RLS på `baselines`
 * tillåter bara coachen att uppdatera. Vi gate:ar på att caller är antingen
 * atleten själv eller en länkad coach (is_coach_of).
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dailyE1RM } from "./eakoefficient";

const PEAK_THRESHOLD = 12;          // minst 12 peak-pass innan baseline flyter
const PEAK_EAK_PCT = 103;           // EAk ≥ 103 % räknas som "peak"
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

export interface BaselineAutoResult {
  updated: BaselineAutoUpdate[];
  skipped: BaselineAutoSkip[];
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

    for (const b of baselines ?? []) {
      const baseline = Number(b.one_rm_kg);
      if (!baseline || baseline <= 0) continue;

      // Set-1 logs for this exercise AFTER the baseline was last touched.
      const sinceIso = (b.updated_at ?? "1970-01-01").slice(0, 10);
      const { data: logs, error: lErr } = await supabaseAdmin
        .from("training_logs")
        .select("reps, weight_kg, rpe, date")
        .eq("athlete_id", athleteId)
        .eq("exercise", b.exercise)
        .eq("set_number", 1)
        .gte("date", sinceIso)
        .order("date", { ascending: false })
        .limit(60);
      if (lErr) throw new Error(lErr.message);

      if (!logs || logs.length === 0) {
        skipped.push({ exercise: b.exercise, baseline, peakCount: 0, reason: "no_logs" });
        continue;
      }

      const peakE1RMs: number[] = [];
      for (const l of logs) {
        const e1rm = dailyE1RM({
          reps: Number(l.reps),
          weight_kg: Number(l.weight_kg),
          rpe: Number(l.rpe),
        });
        const eak = (e1rm / baseline) * 100;
        if (eak >= PEAK_EAK_PCT) peakE1RMs.push(e1rm);
      }

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
      const proposed = Math.round(median * NEW_BASELINE_BUFFER * 2) / 2;

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

    return { updated, skipped, threshold: PEAK_THRESHOLD, peakEakPct: PEAK_EAK_PCT };
  });
