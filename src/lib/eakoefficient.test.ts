import { describe, it, expect } from "vitest";
import { dailyE1RM, readinessFromEAk, processLogs, countsForEAk } from "./eakoefficient";
import { canAddExtraSet } from "./blockVolume";

describe("EAk (RTS model)", () => {
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
