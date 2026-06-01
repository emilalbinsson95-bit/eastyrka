import { describe, it, expect } from "vitest";
import {
  formatDuration,
  parseHMS,
  totalPlannedSeconds,
  avgTargetRpe,
  paceLabelFromDistance,
  type StepInput,
} from "@/lib/endurance";

describe("endurance", () => {
  describe("formatDuration", () => {
    it("handles null / 0", () => {
      expect(formatDuration(null)).toBe("—");
      expect(formatDuration(0)).toBe("—");
    });
    it("formats h/m/s", () => {
      expect(formatDuration(3600)).toBe("1h 00m");
      expect(formatDuration(90)).toBe("1m 30s");
      expect(formatDuration(45)).toBe("45s");
      expect(formatDuration(120)).toBe("2m");
    });
  });

  describe("parseHMS", () => {
    it("parses individual fields", () => {
      expect(parseHMS("1", "30", "15")).toBe(3600 + 1800 + 15);
      expect(parseHMS("", "5", "")).toBe(300);
    });
  });

  describe("paceLabelFromDistance", () => {
    it("min/km for run", () => {
      // 5km in 25 min = 5:00/km
      expect(paceLabelFromDistance("run", 5000, 25 * 60)).toBe("5:00 /km");
    });
    it("km/h for bike", () => {
      // 30km in 1h = 30 km/h
      expect(paceLabelFromDistance("bike", 30000, 3600)).toBe("30.0 km/h");
    });
    it("/100m for swim", () => {
      // 1000m in 20 min = 2:00/100m
      expect(paceLabelFromDistance("swim", 1000, 1200)).toBe("2:00 /100m");
    });
    it("null when missing", () => {
      expect(paceLabelFromDistance("run", 0, 100)).toBeNull();
      expect(paceLabelFromDistance("run", 1000, 0)).toBeNull();
    });
  });

  describe("totalPlannedSeconds", () => {
    it("sums flat steps", () => {
      const steps: StepInput[] = [
        { id: "a", parent_id: null, order_index: 0, is_group: false, repeat_count: 1, discipline: "run", duration_seconds: 600, target_rpe: 4, notes: null },
        { id: "b", parent_id: null, order_index: 1, is_group: false, repeat_count: 2, discipline: "run", duration_seconds: 120, target_rpe: 8, notes: null },
      ];
      // 600 + 2*120 = 840
      expect(totalPlannedSeconds(steps)).toBe(840);
    });
    it("expands group repeat_count", () => {
      const steps: StepInput[] = [
        { id: "g", parent_id: null, order_index: 0, is_group: true, repeat_count: 4, discipline: null, duration_seconds: null, target_rpe: null, notes: null },
        { id: "work", parent_id: "g", order_index: 0, is_group: false, repeat_count: 1, discipline: "run", duration_seconds: 240, target_rpe: 9, notes: null },
        { id: "rest", parent_id: "g", order_index: 1, is_group: false, repeat_count: 1, discipline: "run", duration_seconds: 120, target_rpe: 3, notes: null },
      ];
      // 4 × (240 + 120) = 1440
      expect(totalPlannedSeconds(steps)).toBe(1440);
    });
  });

  describe("avgTargetRpe", () => {
    it("weights by planned seconds", () => {
      const steps: StepInput[] = [
        { id: "a", parent_id: null, order_index: 0, is_group: false, repeat_count: 1, discipline: "run", duration_seconds: 600, target_rpe: 4, notes: null },
        { id: "b", parent_id: null, order_index: 1, is_group: false, repeat_count: 1, discipline: "run", duration_seconds: 600, target_rpe: 8, notes: null },
      ];
      // (600*4 + 600*8) / 1200 = 6.0
      expect(avgTargetRpe(steps)).toBe(6);
    });
    it("returns null when no weighted seconds", () => {
      expect(avgTargetRpe([])).toBeNull();
    });
  });
});
