import { describe, it, expect } from "vitest";
import {
  pctOf1RM,
  pctOf1RMFromRir,
  rirToRpe,
  rpeToRir,
  prescribedWeightKg,
} from "@/lib/intensity";

describe("intensity", () => {
  describe("pctOf1RM", () => {
    it("RPE 10 @ 1 rep = 100%", () => {
      expect(pctOf1RM(10, 1)).toBe(100);
    });
    it("RPE 8 @ 5 reps = 81.1%", () => {
      expect(pctOf1RM(8, 5)).toBe(81.1);
    });
    it("snaps RPE down to nearest 0.5", () => {
      expect(pctOf1RM(8.7, 3)).toBe(pctOf1RM(8.5, 3));
    });
    it("clamps reps 1–12", () => {
      expect(pctOf1RM(8, 20)).toBe(pctOf1RM(8, 12));
      expect(pctOf1RM(8, 0)).toBe(pctOf1RM(8, 1));
    });
  });

  describe("rirToRpe / rpeToRir", () => {
    it("RIR 0 = RPE 10", () => {
      expect(rirToRpe(0)).toBe(10);
    });
    it("RIR 3 = RPE 7", () => {
      expect(rirToRpe(3)).toBe(7);
    });
    it("RPE 8 = RIR 2", () => {
      expect(rpeToRir(8)).toBe(2);
    });
    it("RIR clamped to RPE ≥6", () => {
      expect(rirToRpe(10)).toBe(6);
    });
  });

  describe("pctOf1RMFromRir", () => {
    it("RIR 2, 5 reps → RPE 8, 5 reps = 81.1%", () => {
      expect(pctOf1RMFromRir(2, 5)).toBe(81.1);
    });
  });

  describe("prescribedWeightKg", () => {
    it("100kg 1RM × 80% rounded to 2.5kg", () => {
      // RPE 8, 5 reps = 81.1% → 81.1 kg → rounded to 80
      expect(prescribedWeightKg({ oneRmKg: 100, reps: 5, metric: "rpe", rpe: 8 })).toBe(80);
    });
    it("respects custom roundTo", () => {
      expect(prescribedWeightKg({ oneRmKg: 100, reps: 5, metric: "rpe", rpe: 8, roundTo: 5 })).toBe(80);
    });
    it("returns null without 1RM", () => {
      expect(prescribedWeightKg({ oneRmKg: 0, reps: 5, metric: "rpe", rpe: 8 })).toBeNull();
    });
    it("RIR path", () => {
      expect(prescribedWeightKg({ oneRmKg: 100, reps: 5, metric: "rir", rir: 2 })).toBe(80);
    });
  });
});
