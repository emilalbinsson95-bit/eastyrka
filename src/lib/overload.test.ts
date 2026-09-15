import { describe, expect, it } from "vitest";
import { applyOverload, DEFAULT_OVERLOAD, overloadSummary } from "./overload";
import { getTemplate } from "./strengthTemplates";

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
});
