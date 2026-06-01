import { describe, it, expect } from "vitest";
import {
  dailyE1RM,
  eaKoefficient,
  readinessFromEAk,
  volumeQualityFromDrop,
  processLogs,
  type RawLog,
} from "@/lib/eakoefficient";

describe("eakoefficient", () => {
  describe("dailyE1RM", () => {
    it("computes Epley with RPE adjustment", () => {
      // 100kg × 5 @ RPE 10 → 100 × (1 + (5+0)/30) = 116.67
      expect(dailyE1RM({ weight_kg: 100, reps: 5, rpe: 10 })).toBeCloseTo(116.67, 1);
    });
    it("caps reps at 8", () => {
      // 12 reps should be treated as 8
      const a = dailyE1RM({ weight_kg: 100, reps: 12, rpe: 8 });
      const b = dailyE1RM({ weight_kg: 100, reps: 8, rpe: 8 });
      expect(a).toBeCloseTo(b, 5);
    });
    it("RPE 8 vs RPE 10 same reps → RPE 10 higher E1RM", () => {
      const e10 = dailyE1RM({ weight_kg: 100, reps: 5, rpe: 10 });
      const e8 = dailyE1RM({ weight_kg: 100, reps: 5, rpe: 8 });
      expect(e10).toBeGreaterThan(e8);
    });
  });

  describe("eaKoefficient", () => {
    it("returns 0 when baseline missing", () => {
      expect(eaKoefficient({ weight_kg: 100, reps: 5, rpe: 8 }, 0)).toBe(0);
    });
    it("100% when daily E1RM equals baseline", () => {
      const e = dailyE1RM({ weight_kg: 100, reps: 5, rpe: 8 });
      expect(eaKoefficient({ weight_kg: 100, reps: 5, rpe: 8 }, e)).toBeCloseTo(100, 5);
    });
  });

  describe("readinessFromEAk", () => {
    it.each([
      [0, "unknown"],
      [80, "exhausted"],
      [91.9, "exhausted"],
      [92, "undertrained"],
      [97, "undertrained"],
      [97.5, "adapting"],
      [102, "adapting"],
      [103, "peaking"],
    ])("eak=%s → %s", (eak, status) => {
      expect(readinessFromEAk(eak as number)).toBe(status);
    });
  });

  describe("volumeQualityFromDrop", () => {
    it("set 1 is baseline reference", () => {
      expect(volumeQualityFromDrop(1, 0)).toBe("baseline");
    });
    it("drop ≤4% → optimal", () => {
      expect(volumeQualityFromDrop(2, 3)).toBe("optimal");
      expect(volumeQualityFromDrop(2, 4)).toBe("optimal");
    });
    it("4 < drop < 5 → acceptable", () => {
      expect(volumeQualityFromDrop(3, 4.5)).toBe("acceptable");
    });
    it("drop ≥5 → fatigue_limit", () => {
      expect(volumeQualityFromDrop(3, 5)).toBe("fatigue_limit");
      expect(volumeQualityFromDrop(4, 10)).toBe("fatigue_limit");
    });
  });

  describe("processLogs", () => {
    it("computes drop% relative to set 1 of same day & exercise", () => {
      const logs: RawLog[] = [
        { id: "1", date: "2026-05-01", exercise: "Squat", variation: null, set_number: 1, weight_kg: 100, reps: 5, rpe: 8 },
        { id: "2", date: "2026-05-01", exercise: "Squat", variation: null, set_number: 2, weight_kg: 100, reps: 5, rpe: 9 },
      ];
      const out = processLogs(logs, { Squat: 120 });
      expect(out[0].volume).toBe("baseline");
      // Set 2 has higher RPE → lower E1RM → drop > 0
      expect(out[1].dropPercent).toBeGreaterThan(0);
      expect(out[0].eaKoefficient).toBeCloseTo((out[0].dailyE1RM / 120) * 100, 5);
    });
  });
});
