/**
 * Serverfunktioner för EAk-motorn: kör evaluateMesocycle/reboundTest mot
 * lagrade loggar och sparar resultat som FÖRSLAG (coach_decision = pending).
 * Inget i planen ändras förrän coachen godkänner.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { evaluateMesocycle, reboundTest, sessionPoints, type BlockWindow, type CheckIn, type SetLog } from "./eakSignal";
import { compLiftKey, COMP_NAME, type CompLift } from "./liftIdentity";

const LIFTS: CompLift[] = ["squat", "bench", "deadlift"];

async function assertCoachOrSelf(userId: string, athleteId: string) {
  if (userId === athleteId) return;
  const { data: link } = await (await admin())
    .from("coach_athletes")
    .select("id")
    .eq("coach_id", userId)
    .eq("athlete_id", athleteId)
    .maybeSingle();
  if (link) return;
  const { data: role } = await (await admin())
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!role) throw new Error("Not authorized for this athlete");
}

async function assertCoach(userId: string, athleteId: string) {
  if (userId === athleteId) throw new Error("Only the coach decides on EAk suggestions");
  await assertCoachOrSelf(userId, athleteId);
}

/**
 * Kör EAk-utvärdering för en atlets tävlingslyft och lagrar nya resultat
 * som väntande förslag. Körs när coachen öppnar vyer — idempotent: hoppar
 * över fönster som redan har en lagrad utvärdering.
 */
export const runEakEvaluation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ athleteId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { athleteId } = data;
    await assertCoachOrSelf(context.userId, athleteId);
    const supabaseAdmin = await admin();

    const [{ data: logs }, { data: baselines }, { data: surveys }, { data: weeks }] = await Promise.all([
      supabaseAdmin
        .from("training_logs")
        .select("date, exercise, set_number, reps, weight_kg, rpe")
        .eq("athlete_id", athleteId)
        .order("date", { ascending: true })
        .limit(5000),
      supabaseAdmin.from("baselines").select("exercise, one_rm_kg").eq("athlete_id", athleteId),
      supabaseAdmin
        .from("readiness_surveys")
        .select("date, fatigue, work_stress, life_stress, daily_form, sleep_quality")
        .eq("athlete_id", athleteId)
        .order("date", { ascending: true })
        .limit(500),
      supabaseAdmin
        .from("week_plans")
        .select("week_index, week_start_date, mesocycle_id, status, is_deload, mesocycles(label, status)")
        .eq("athlete_id", athleteId)
        .limit(200),
    ]);

    const allLogs = (logs ?? []) as SetLog[];
    const checkIns: CheckIn[] = (surveys ?? []).map((s) => ({
      date: s.date,
      fatigue: s.fatigue,
      stress: Math.max(Number(s.work_stress ?? 0), Number(s.life_stress ?? 0)) || null,
      daily_form: s.daily_form,
      sleep: s.sleep_quality,
    }));

    // Blockfönster från veckoplaner (deload/peak exkluderas ur brusberäkningen).
    const blocks: BlockWindow[] = (weeks ?? [])
      .filter((w: { week_start_date?: string | null }) => w.week_start_date)
      .map((w: Record<string, unknown> & { week_start_date: string; is_deload?: boolean }) => {
        const text = `${(w as { mesocycles?: { label?: string } | null }).mesocycles?.label ?? ""}`;
        const kind: BlockWindow["kind"] = (w as { is_deload?: boolean }).is_deload
          ? "deload"
          : /taper/i.test(text)
            ? "taper"
            : /peak|topp/i.test(text)
              ? "peak"
              : "working";
        const start = w.week_start_date as string;
        const end = new Date(new Date(start).getTime() + 6 * 864e5).toISOString().slice(0, 10);
        return { kind, start, end, mesocycleId: typeof w.mesocycle_id === "string" ? w.mesocycle_id : undefined };
      });

    const results: Array<{ lift: CompLift; status: string; stored: boolean }> = [];

    for (const lift of LIFTS) {
      const baselineRow = (baselines ?? []).find((b: { exercise: string }) => compLiftKey(b.exercise) === lift);
      const B = Number(baselineRow?.one_rm_kg ?? 0);
      if (B <= 0) continue;

      const points = sessionPoints(allLogs, lift, B);
      if (points.length < 4) continue;

      const window = points.slice(-6);
      const windowStart = window[0].date;
      const windowEnd = window[window.length - 1].date;

      // Hoppa över om fönstret redan är utvärderat.
      const { data: existing } = await (await admin())
        .from("eak_meso_evaluations")
        .select("id, window_end, l_m, n_sessions")
        .eq("athlete_id", athleteId)
        .eq("lift", lift)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing?.window_end && existing.window_end >= windowEnd) {
        results.push({ lift, status: "unchanged", stored: false });
        continue;
      }

      const previous = existing?.l_m ? { L_M: Number(existing.l_m), n: Number(existing.n_sessions) } : null;
      const r = evaluateMesocycle({ logs: allLogs, lift, baseline: B, checkIns, previous, blocks });

      // DB-statuslistan saknar low_confidence tills steg B — spara som yellow.
      const storedStatus = r.status === "low_confidence" ? "yellow" : r.status;

      const { error } = await (await admin()).from("eak_meso_evaluations").insert({
        athlete_id: athleteId,
        lift,
        window_start: windowStart,
        window_end: windowEnd,
        n_sessions: r.n,
        l_m: r.L_M,
        dl_m: r.dL_M,
        eak_m: r.EAk_M,
        slope: r.b_M,
        te_i: r.TE_i,
        threshold_i: r.threshold_i,
        readiness_signal: r.readinessSignal,
        athlete_signal: r.athleteSignal,
        status: storedStatus,
        suggestion_text: r.suggestion,
        coach_decision: "pending",
      });
      if (error) throw new Error(error.message);
      results.push({ lift, status: r.status, stored: true });

      // Rebound-test efter senaste deloadveckan (om ny).
      const deloads = blocks.filter((b) => b.kind === "deload").sort((a, b) => a.start.localeCompare(b.start));
      const lastDeload = deloads[deloads.length - 1];
      if (lastDeload) {
        const { data: existingRebound } = await (await admin())
          .from("rebound_tests")
          .select("id")
          .eq("athlete_id", athleteId)
          .eq("lift", lift)
          .eq("deload_week_start", lastDeload.start)
          .maybeSingle();
        if (!existingRebound) {
          const rb = reboundTest(points, blocks);
          if (rb.R != null) {
            await (await admin()).from("rebound_tests").insert({
              athlete_id: athleteId,
              lift,
              deload_week_start: lastDeload.start,
              r_value: rb.R,
              passed: rb.passed,
            });
          }
        }
      }
    }

    return { results };
  });

/** Coachen godkänner, avvisar eller justerar ett EAk-förslag. */
export const decideEakEvaluation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        evaluationId: z.string().uuid(),
        decision: z.enum(["approved", "rejected", "modified"]),
        note: z.string().max(1000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row } = await (await admin())
      .from("eak_meso_evaluations")
      .select("athlete_id")
      .eq("id", data.evaluationId)
      .single();
    if (!row) throw new Error("Evaluation not found");
    await assertCoach(context.userId, row.athlete_id);

    const { error } = await (await admin())
      .from("eak_meso_evaluations")
      .update({ coach_decision: data.decision, coach_note: data.note ?? null, decided_at: new Date().toISOString() })
      .eq("id", data.evaluationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Skriver en baseline-ändring (push-signal efter godkännande, eller manuell
 * korrigering). Lagras i baseline_history och speglas till baselines.
 */
export const applyBaselineChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        athleteId: z.string().uuid(),
        lift: z.enum(["squat", "bench", "deadlift"]),
        valueKg: z.number().positive().max(700),
        source: z.enum(["push_signal", "manual_correction", "training_max", "competition"]),
        note: z.string().max(1000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCoach(context.userId, data.athleteId);
    const exercise = COMP_NAME[data.lift];

    const { error: hErr } = await (await admin()).from("baseline_history").insert({
      athlete_id: data.athleteId,
      exercise,
      one_rm_kg: data.valueKg,
      source: data.source,
      recorded_by: context.userId,
      note: data.note ?? null,
    });
    if (hErr) throw new Error(hErr.message);

    // Spegla till baselines (upsert per atlet+övning).
    const { data: existing } = await (await admin())
      .from("baselines")
      .select("id")
      .eq("athlete_id", data.athleteId)
      .eq("exercise", exercise)
      .maybeSingle();
    if (existing) {
      const { error } = await (await admin())
        .from("baselines")
        .update({ one_rm_kg: data.valueKg, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await (await admin()).from("baselines").insert({
        athlete_id: data.athleteId,
        exercise,
        one_rm_kg: data.valueKg,
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
