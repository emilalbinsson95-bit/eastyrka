import { describe, expect, it } from "vitest";
import { applyOverload, DEFAULT_OVERLOAD, overloadSummary } from "./overload";
import { getTemplate } from "./strengthTemplates";
import { pctOf1RM } from "./intensity";

const weeks = () => getTemplate("standard-pl")!.buildWeeks(4);

describe("overload options", () => {
  it("is a no-op when nothing is selected", () => {
    const base = weeks();
    expect(applyOverload(base, DEFAULT_OVERLOAD)).toEqual(base);
  });

  it("adds one RPE 8 over-warm single before main work, never on deload", () => {
    const out = applyOverload(weeks(), { ...DEFAULT_OVERLOAD, overWarmSingles: true });
    const working = out.filter((w) => !/deload/i.test(w.label));
    const singles = working.flatMap((w) =>
      w.sessions.flatMap((s) => s.exercises.filter((e) => e.variation === "Over-warm single")),
    );
    expect(singles.length).toBeGreaterThan(0);
    for (const s of singles) {
      expect(s.target_sets).toBe(1);
      expect(s.target_reps).toBe(1);
      expect(s.target_rpe).toBe(8);
    }
    for (const w of working) {
      for (const s of w.sessions) {
        expect(s.exercises.filter((e) => e.variation === "Over-warm single").length).toBeLessThanOrEqual(1);
      }
    }
    const deload = out.find((w) => /deload/i.test(w.label))!;
    expect(
      deload.sessions.flatMap((s) => s.exercises).some((e) => e.variation === "Over-warm single"),
    ).toBe(false);
  });

  it("waves main lifts 5s/4s/3s across working weeks", () => {
    const out = applyOverload(weeks(), { ...DEFAULT_OVERLOAD, waveLoading: true });
    const mainReps = (i: number) =>
      out[i].sessions
        .flatMap((s) => s.exercises)
        .filter((e) => e.exercise === "Back squat" && !e.variation?.includes("Pause"))
        .map((e) => e.target_reps);
    expect(mainReps(0)).toContain(5);
    expect(mainReps(1)).toContain(4);
    expect(mainReps(2)).toContain(3);
  });

  it("keeps only one main-stance pull per week when a stance is committed", () => {
    const out = applyOverload(weeks(), { ...DEFAULT_OVERLOAD, deadliftStance: "sumo" });
    for (const w of out) {
      const mains = w.sessions
        .flatMap((s) => s.exercises)
        .filter((e) => e.exercise === "Deadlift");
      expect(mains.length).toBeLessThanOrEqual(1);
      if (mains[0]) expect(mains[0].variation).toBe("Sumo stance");
    }
  });

  it("consolidates bench into at most three differentiated days", () => {
    const out = applyOverload(weeks(), { ...DEFAULT_OVERLOAD, benchConsolidation: true });
    for (const w of out) {
      const benchDays = w.sessions.filter((s) =>
        s.exercises.some((e) => /bench/i.test(`${e.exercise} ${e.variation ?? ""}`)),
      );
      expect(benchDays.length).toBeLessThanOrEqual(3);
    }
  });

  it("summarises selected options", () => {
    expect(overloadSummary({ ...DEFAULT_OVERLOAD, waveLoading: true })).toHaveLength(1);
  });
  it("recalculates same-lift kilos when wave reps and effort change", () => {
    const base = weeks().map(w => ({ ...w, sessions: w.sessions.map(s => ({ ...s, exercises: s.exercises.map(e => ({ ...e, target_weight_kg: 100 })) })) }));
    const out = applyOverload(base, { ...DEFAULT_OVERLOAD, waveLoading: true });
    const before = base[1]?.sessions[0]?.exercises[0];
    const after = out[1]?.sessions[0]?.exercises[0];
    if (!before || !after) throw new Error("Missing squat");
    const from = pctOf1RM(before.target_rpe ?? 7, before.target_reps) ?? 1;
    const to = pctOf1RM(after.target_rpe ?? 7, after.target_reps) ?? 1;
    expect(after.target_weight_kg).toBe(Math.round(100 * to / from / 2.5) * 2.5);
    expect(after.target_weight_kg).not.toBe(100);
  });
  it("clears load when the exercise truly changes, but keeps it on a stance commit", () => {
    const base = weeks().map(w => ({ ...w, sessions: w.sessions.map(s => ({ ...s, exercises: s.exercises.map(e => ({ ...e, target_weight_kg: 100 })) })) }));
    const out = applyOverload(base, { ...DEFAULT_OVERLOAD, deadliftStance: "sumo", benchConsolidation: true });
    for (const w of out) for (const [si, s] of w.sessions.entries()) for (const [ei, e] of s.exercises.entries()) {
      const before = base.find(b => b.week_index === w.week_index)?.sessions[si]?.exercises[ei];
      // A true exercise change (secondary pull becomes RDL, bench variant swap) clears the load.
      if (e.exercise === "Romanian deadlift" || (e.variation === "Touch-and-go" && before?.variation !== "Touch-and-go")) expect(e.target_weight_kg).toBeUndefined();
      // A stance label on the same lift keeps the prescribed kg (fix 7).
      if (e.exercise === "Deadlift" && e.variation === "Sumo stance") expect(e.target_weight_kg).toBe(100);
    }
  });
});

describe("wave loading (fix 6)", () => {
  it("applies RPE as an offset so coach tuning is preserved, not overwritten", () => {
    const base = weeks();
    // Simulate coach intensity tuning: week 1 squat at RPE 8.5 instead of 8.
    const tuned = base.map((w, i) => i === 0
      ? { ...w, sessions: w.sessions.map((s) => ({ ...s, exercises: s.exercises.map((e) => e.exercise === "Back squat" && (!e.variation || e.variation === "Competition stance") ? { ...e, target_rpe: 8.5 } : e) })) }
      : w);
    const out = applyOverload(tuned, { ...DEFAULT_OVERLOAD, waveLoading: true });
    const compSquat = (e: { exercise: string; variation?: string }) =>
      e.exercise === "Back squat" && (!e.variation || e.variation === "Competition stance");
    const w1 = out[0].sessions.flatMap((s) => s.exercises).find(compSquat);
    expect(w1?.target_rpe).toBe(8.5);
    // Week 2 wave step is +0.5 RPE relative to week 1.
    const w2 = out[1].sessions.flatMap((s) => s.exercises).find(compSquat);
    expect(w2?.target_rpe).toBe(9);
  });

  it("never waves pause, tempo or touch-and-go variants", () => {
    const out = applyOverload(weeks(), { ...DEFAULT_OVERLOAD, waveLoading: true });
    const variants = out.flatMap((w) => w.sessions.flatMap((s) => s.exercises))
      .filter((e) => e.variation && /pause|tempo|touch/i.test(e.variation) && e.variation !== "Over-warm single" && e.variation !== "Competition grip & pause");
    for (const v of variants) expect(v.notes ?? "").not.toMatch(/Wave week/);
  });
});

describe("reconcileLoad with stance labels (fix 7)", () => {
  it("keeps the prescribed kg when a deadlift stance is committed", () => {
    const base = weeks().map((w) => ({
      ...w,
      sessions: w.sessions.map((s) => ({
        ...s,
        exercises: s.exercises.map((e) => e.exercise === "Deadlift" && (!e.variation || e.variation === "Competition stance") ? { ...e, target_weight_kg: 200 } : e),
      })),
    }));
    const out = applyOverload(base, { ...DEFAULT_OVERLOAD, deadliftStance: "sumo" });
    const committed = out.flatMap((w) => w.sessions.flatMap((s) => s.exercises))
      .filter((e) => e.exercise === "Deadlift" && e.variation === "Sumo stance");
    expect(committed.length).toBeGreaterThan(0);
    for (const e of committed) expect(e.target_weight_kg).toBe(200);
  });
});
