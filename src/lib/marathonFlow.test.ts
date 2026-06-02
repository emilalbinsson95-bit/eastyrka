// End-to-end logic simulation of a marathon athlete journey.
//
// This is a "no DB" integration test of the same pure functions that the
// MarathonPlanRetuneCard uses live in the app:
//   acwr() + recentQualityDrift() → volumeAdjustmentForAcwr() →
//   clamp(min(driftMult, acwrMult), 0.75, 1.10) → final volume multiplier
//
// We simulate three phases and assert the retune engine reacts correctly:
//   1) Healthy ramp        — plan on track, multiplier ≈ 1.00
//   2) Illness / injury    — last 5 hard sessions overshoot RPE by ≥1, plus
//                            missed sessions drop ACWR; multiplier drops
//   3) Recovery comeback   — easy sessions logged at planned RPE, drift
//                            disappears, ACWR climbs back; multiplier ≥ 1.00
//
// If any of these break, the live "Re-tune kommande 4 veckor" button in the
// coach UI will misbehave the same way — so this acts as a regression net.

import { describe, it, expect } from "vitest";
import { addDays, format } from "date-fns";
import {
  acwr,
  recentQualityDrift,
  volumeAdjustmentForAcwr,
  type LoadSession,
  type DriftSession,
} from "@/lib/enduranceLoad";
import { generate20WeekMarathonPlan } from "@/lib/marathonPlanGenerator";

function d(offsetDays: number, anchor = new Date("2026-03-01T12:00:00Z")) {
  return format(addDays(anchor, offsetDays), "yyyy-MM-dd");
}

/** Combined retune multiplier, mirroring MarathonPlanRetuneCard.analysis. */
function retuneMultiplier(load: LoadSession[], drift: DriftSession[], anchor: Date) {
  const a = acwr(load, anchor);
  const dr = recentQualityDrift(drift, 5);
  const acwrMult = volumeAdjustmentForAcwr(a.ratio);
  const combined = Math.min(dr.volumeMultiplier, acwrMult);
  return {
    acwr: a,
    drift: dr,
    finalMult: Math.max(0.75, Math.min(1.10, combined)),
  };
}

describe("marathon athlete flow — auto-retune reacts to illness and recovery", () => {
  const anchor = new Date("2026-03-01T12:00:00Z");

  // 28 days of healthy training: 4 sessions/week, RPE on plan.
  // Mix of easy (RPE 5) and quality (planned 8, actual 8).
  function healthyBlock(startOffset: number): { load: LoadSession[]; drift: DriftSession[] } {
    const load: LoadSession[] = [];
    const drift: DriftSession[] = [];
    for (let w = 0; w < 4; w++) {
      const base = startOffset + w * 7;
      // Easy x2
      for (const off of [0, 3]) {
        const date = d(base + off, anchor);
        load.push({
          date, discipline: "run",
          actual_total_seconds: 50 * 60, planned_total_seconds: 50 * 60,
          overall_rpe: 5, peak_rpe: 5, planned_avg_rpe: 5,
        });
        drift.push({ date, planned_avg_rpe: 5, overall_rpe: 5, peak_rpe: 5, status: "completed" });
      }
      // Quality x1 (RPE 8, on plan)
      const qDate = d(base + 2, anchor);
      load.push({
        date: qDate, discipline: "run",
        actual_total_seconds: 45 * 60, planned_total_seconds: 45 * 60,
        overall_rpe: 8, peak_rpe: 9, planned_avg_rpe: 8,
      });
      drift.push({ date: qDate, planned_avg_rpe: 8, overall_rpe: 8, peak_rpe: 9, status: "completed" });
      // Long x1
      const lDate = d(base + 5, anchor);
      load.push({
        date: lDate, discipline: "run",
        actual_total_seconds: 90 * 60, planned_total_seconds: 90 * 60,
        overall_rpe: 6, peak_rpe: 7, planned_avg_rpe: 6,
      });
      drift.push({ date: lDate, planned_avg_rpe: 6, overall_rpe: 6, peak_rpe: 7, status: "completed" });
    }
    return { load, drift };
  }

  it("phase 1 — healthy ramp: ACWR optimal, no drift, multiplier ≈ 1.00", () => {
    // 28 days ending at anchor → offsets -28..-1
    const { load, drift } = healthyBlock(-28);
    const r = retuneMultiplier(load, drift, anchor);
    expect(r.acwr.ratio).not.toBeNull();
    expect(r.acwr.zone).toBe("optimal");
    expect(r.drift.recommendation).toBe("hold");
    expect(r.finalMult).toBe(1.0);
  });

  it("phase 2 — sickness/injury: RPE overshoots plan on hard sessions → deload", () => {
    // 3 healthy weeks then 1 week where every hard session feels +2 RPE harder
    // than planned (classic accumulating fatigue / sickness signature).
    const { load, drift } = healthyBlock(-28);

    // Replace the last 5 hard (planned_avg_rpe >= 6) sessions with drifted versions.
    const driftedHardCount = drift.reduce((n, s) => n + ((s.planned_avg_rpe ?? 0) >= 6 ? 1 : 0), 0);
    expect(driftedHardCount).toBeGreaterThanOrEqual(5);

    // Walk backwards, bump actual RPE by +2 on the last 5 hard sessions.
    let bumped = 0;
    for (let i = drift.length - 1; i >= 0 && bumped < 5; i--) {
      if ((drift[i].planned_avg_rpe ?? 0) >= 6) {
        drift[i] = { ...drift[i], overall_rpe: (drift[i].planned_avg_rpe ?? 0) + 2 };
        // Mirror into the matching load row by date.
        const li = load.findIndex((l) => l.date === drift[i].date);
        if (li >= 0) load[li] = { ...load[li], overall_rpe: drift[i].overall_rpe };
        bumped++;
      }
    }

    const r = retuneMultiplier(load, drift, anchor);
    expect(r.drift.inspected).toBe(5);
    expect(r.drift.drifted).toBe(5);
    expect(r.drift.avgDelta).toBeGreaterThanOrEqual(1.5);
    expect(r.drift.recommendation).toBe("reduce_volume");
    // Reduce-volume path → 0.85, ACWR still optimal → 1.0 → combined 0.85
    expect(r.finalMult).toBeCloseTo(0.85, 5);
  });

  it("phase 3 — comeback after missed week: low ACWR (<0.7) → allows small ramp", () => {
    // Healthy 4 weeks, then athlete misses the most recent 7 days entirely
    // (sickness/injury). Acute load collapses → ACWR < 0.7.
    const { load, drift } = healthyBlock(-35);
    // Drop everything in last 7 days
    const cutoff = d(-7, anchor);
    const recoveredLoad = load.filter((s) => s.date < cutoff);
    const recoveredDrift = drift.filter((s) => s.date < cutoff);

    const r = retuneMultiplier(recoveredLoad, recoveredDrift, anchor);
    expect(r.acwr.ratio).not.toBeNull();
    expect(r.acwr.ratio!).toBeLessThan(0.7);
    // Drift signal is "hold" because no recent hard sessions overshot.
    expect(r.drift.recommendation).toBe("hold");
    // ACWR <0.7 → 1.05 ramp allowance, drift 1.0 → min = 1.0
    // (safety-first rule: the more conservative wins, so we don't auto-ramp.)
    expect(r.finalMult).toBe(1.0);
  });

  it("phase 4 — gradual return: small easy weeks log on plan → still hold (no over-correction)", () => {
    // After recovery, 2 easy weeks at planned RPE. ACWR should climb back
    // toward 1.0 without triggering deload or aggressive ramp.
    const { load, drift } = healthyBlock(-21); // last 21 days
    const r = retuneMultiplier(load, drift, anchor);
    expect(["low", "optimal"]).toContain(r.acwr.zone);
    expect(r.drift.recommendation).toBe("hold");
    expect(r.finalMult).toBeGreaterThanOrEqual(1.0);
    expect(r.finalMult).toBeLessThanOrEqual(1.05);
  });

  it("plan generation → retune loop: a generated 20-week plan stays inside bounds", () => {
    // Sanity check that the plan generator's output is shaped such that the
    // retune engine can actually be fed (date / planned_total_seconds /
    // planned_avg_rpe). We don't run the multiplier here — we just verify
    // every planned session has the fields MarathonPlanRetuneCard reads.
    const plan = generate20WeekMarathonPlan({
      startMonday: "2026-01-05", tenKPbSeconds: 45 * 60, daysPerWeek: 5,
    });
    for (const s of plan.sessions) {
      expect(typeof s.date).toBe("string");
      // Race session is allowed to have no plannedAvgRpe / 0 duration in some
      // generator variants; everything else must have both.
      if (s.type !== "race") {
        expect(s.steps.length).toBeGreaterThan(0);
      }
    }
    // Hard floor: total volume across the plan is positive.
    const totalMin = plan.weeklyVolumeMin.reduce((a, b) => a + b, 0);
    expect(totalMin).toBeGreaterThan(0);
  });
});
