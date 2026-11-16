import { describe, expect, it } from "vitest";
import { estimateRpe, liftMetrics, metricLiftKey, missingHeavyStreaks, plannedRowSets, emptyLiftMetrics, round1 } from "./liftMetrics";

const baselines = { "Bench press": 160 };
const sets = (n: number, reps: number, weight: number) =>
  Array.from({ length: n }, () => ({ exercise: "Bench press", reps, weight_kg: weight, rpe: 0 }));

describe("liftMetrics (steg 1, Alex bänkbaslinje 160 kg, set loggade utan RPE)", () => {
  it("10 × 10 på 92,5 kg: 0 hårda, 10 lätta, mängd 57,8, 0 tunga", () => {
    const m = liftMetrics(sets(10, 10, 92.5), baselines).bench;
    expect(m.hardSets).toBe(0);
    expect(m.lightSets).toBe(10);
    expect(round1(m.volume)).toBe(57.8);
    expect(m.heavySets).toBe(0);
  });
  it("5 × 5 på 127,5 kg: 5 hårda, mängd 19,9", () => {
    const m = liftMetrics(sets(5, 5, 127.5), baselines).bench;
    expect(m.hardSets).toBe(5);
    expect(m.lightSets).toBe(0);
    expect(round1(m.volume)).toBe(19.9);
  });
  it("3 × 1 på 145 kg: 3 hårda, 3 tunga, mängd 2,7", () => {
    const m = liftMetrics(sets(3, 1, 145), baselines).bench;
    expect(m.hardSets).toBe(3);
    expect(m.heavySets).toBe(3);
    expect(round1(m.volume)).toBe(2.7);
  });
  it("loggad RPE vinner över uppskattning", () => {
    const m = liftMetrics([{ exercise: "Bench press", reps: 10, weight_kg: 92.5, rpe: 7 }], baselines).bench;
    expect(m.hardSets).toBe(1);
  });
  it("flaggade uppvärmningsset och teknikset räknas inte", () => {
    const m = liftMetrics([
      { exercise: "Bench press", reps: 5, weight_kg: 60, rpe: 0, is_warmup_reference: true },
      { exercise: "Bench press", reps: 5, weight_kg: 60, rpe: 0, is_technique: true },
    ], baselines).bench;
    expect(m.hardSets + m.lightSets).toBe(0);
  });
  it("saknad baslinje: set räknas, mängd och tunga set blir tomma", () => {
    const m = liftMetrics([{ exercise: "Back squat", reps: 5, weight_kg: 140, rpe: 8 }], baselines).squat;
    expect(m.hardSets).toBe(1);
    expect(m.volume).toBeNull();
    expect(m.heavySets).toBeNull();
    expect(m.baselineMissing).toBe(true);
  });
  it("varianter räknas till huvudlyftet, assistans aldrig", () => {
    expect(metricLiftKey("Pause squat")).toBe("squat");
    expect(metricLiftKey("Spoto press")).toBe("bench");
    expect(metricLiftKey("Deficit deadlift")).toBe("deadlift");
    expect(metricLiftKey("Leg press")).toBeNull();
    expect(metricLiftKey("Romanian deadlift")).toBeNull();
    expect(metricLiftKey("Dumbbell bench press")).toBeNull();
  });
  it("mer än 12 reps använder kolumnen för 12 reps", () => {
    expect(estimateRpe(85, 15, 160)).toBeNull();
    expect(estimateRpe(100, 15, 160)).not.toBeNull();
  });
  it("planerade RPE-rader är alltid hårda set", () => {
    const planned = plannedRowSets({ exercise: "Bench press", target_sets: 4, target_reps: 5, target_rpe: 7.5, target_weight_kg: null }, baselines);
    const m = liftMetrics(planned, baselines).bench;
    expect(m.hardSets).toBe(4);
    expect(m.volume).toBeGreaterThan(0);
  });
  it("inga tunga set två arbetsveckor i rad flaggas, avlastning hoppas över", () => {
    const light = liftMetrics(sets(5, 5, 120), baselines);
    const heavy = liftMetrics(sets(3, 1, 145), baselines);
    const streak = missingHeavyStreaks([
      { week: "v1", working: true, metrics: light },
      { week: "v2", working: false, metrics: emptyLiftMetrics() },
      { week: "v3", working: true, metrics: light },
      { week: "v4", working: true, metrics: heavy },
    ]);
    expect(streak.bench).toEqual(["v3"]);
    expect(streak.squat).toEqual([]);
  });
});
