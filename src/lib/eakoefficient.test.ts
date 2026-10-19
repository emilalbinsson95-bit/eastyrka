import { describe, it, expect } from "vitest";
import { dailyE1RM, readinessFromEAk, processLogs, countsForEAk, rollingE1RMBySession, measurementE1RMBySession, pickMeasurementSet } from "./eakoefficient";
import { canAddExtraSet } from "./blockVolume";

describe("EAk (RTS model)", () => {
  it("preserves athlete and exercise keys without mixing lifts or athletes", () => {
    const logs = [
      { date: "2026-01-01", exercise: "athlete-a::Back squat", set_number: 1, reps: 1, weight_kg: 100, rpe: 10 },
      { date: "2026-01-02", exercise: "athlete-a::Back squat", set_number: 1, reps: 1, weight_kg: 120, rpe: 10 },
      { date: "2026-01-02", exercise: "athlete-a::Bench press", set_number: 1, reps: 1, weight_kg: 80, rpe: 10 },
      { date: "2026-01-02", exercise: "athlete-b::Back squat", set_number: 1, reps: 1, weight_kg: 200, rpe: 10 },
    ];
    const trend = rollingE1RMBySession(logs);
    expect(trend.get("2026-01-02::athlete-a::Back squat")).toBe(110);
    expect(trend.get("2026-01-02::athlete-a::Bench press")).toBe(80);
    expect(trend.get("2026-01-02::athlete-b::Back squat")).toBe(200);
    expect(measurementE1RMBySession(logs).get("2026-01-02::athlete-a::Back squat")).toBe(120);
  });
  it("uses the numbered measurement set rather than query order or backoffs", () => {
    const logs = [
      { date: "2026-01-01", exercise: "athlete-a::Back squat", set_number: 3, reps: 5, weight_kg: 100, rpe: 9 },
      { date: "2026-01-01", exercise: "athlete-a::Back squat", set_number: 1, reps: 5, weight_kg: 120, rpe: 8 },
      { date: "2026-01-01", exercise: "athlete-a::Back squat", set_number: 2, reps: 5, weight_kg: 120, rpe: 8.5 },
    ];
    expect(measurementE1RMBySession(logs).get("2026-01-01::athlete-a::Back squat"))
      .toBe(dailyE1RM(logs[1]));
  });
  it("130×5@8 ≈ 160.3", () => expect(dailyE1RM({ weight_kg: 130, reps: 5, rpe: 8 })).toBeCloseTo(160.3, 1));
  it("150×1@10 = 150", () => expect(dailyE1RM({ weight_kg: 150, reps: 1, rpe: 10 })).toBeCloseTo(150, 5));
  it("interpolates RPE, never rounds down", () => {
    const a = dailyE1RM({ weight_kg: 100, reps: 3, rpe: 8.25 });
    expect(a).toBeLessThan(dailyE1RM({ weight_kg: 100, reps: 3, rpe: 8 }));
    expect(a).toBeGreaterThan(dailyE1RM({ weight_kg: 100, reps: 3, rpe: 8.5 }));
  });
  it("RPE < 7 does not count", () => expect(countsForEAk({ weight_kg: 100, reps: 5, rpe: 6.5 })).toBe(false));
  it("bands", () => {
    expect(readinessFromEAk(91)).toBe("exhausted");
    expect(readinessFromEAk(95)).toBe("undertrained");
    expect(readinessFromEAk(103)).toBe("adapting");
    expect(readinessFromEAk(103.1)).toBe("peaking");
  });
  it("measurement set = heavy single, else first RPE≥7 set", () => {
    const logs = [
      { id: "a", date: "2026-01-01", exercise: "Back squat", variation: null, set_number: 1, reps: 5, weight_kg: 100, rpe: 6 },
      { id: "b", date: "2026-01-01", exercise: "Back squat", variation: null, set_number: 2, reps: 5, weight_kg: 120, rpe: 8 },
      { id: "c", date: "2026-01-01", exercise: "Back squat", variation: null, set_number: 3, reps: 5, weight_kg: 120, rpe: 9 },
    ];
    const p = processLogs(logs, { "Back squat": 148 });
    expect(p[1].isMeasurement).toBe(true);
    expect(p[0].volume).toBe("unknown");
    expect(p[2].dropPercent).toBeGreaterThan(0);
  });
  it("extra set allowed only with small drop", () => {
    const sets = [1, 2, 3].map((n) => ({ set_number: n, reps: 5, weight_kg: 120, rpe: 8 }));
    expect(canAddExtraSet({ plannedSets: 3, doneSets: sets, targetRpe: 8, isLightOrSingle: false }).allowed).toBe(true);
    expect(canAddExtraSet({ plannedSets: 3, doneSets: [...sets, { set_number: 4, reps: 5, weight_kg: 120, rpe: 8 }, { set_number: 5, reps: 5, weight_kg: 120, rpe: 8 }], targetRpe: 8, isLightOrSingle: false }).allowed).toBe(false);
  });
});

describe("pickMeasurementSet (heavy singles)", () => {
  it("uses a leading over-warm single as the measurement set", () => {
    const sets = [
      { set_number: 1, reps: 1, weight_kg: 140, rpe: 8 },
      { set_number: 2, reps: 5, weight_kg: 120, rpe: 8 },
    ];
    expect(pickMeasurementSet(sets)?.set_number).toBe(1);
  });
  it("never lets a single logged after the working sets replace the first working set", () => {
    const sets = [
      { set_number: 1, reps: 5, weight_kg: 120, rpe: 8 },
      { set_number: 2, reps: 5, weight_kg: 120, rpe: 8 },
      { set_number: 3, reps: 1, weight_kg: 150, rpe: 9 },
    ];
    expect(pickMeasurementSet(sets)?.set_number).toBe(1);
  });
});
