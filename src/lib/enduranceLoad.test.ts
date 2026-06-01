import { describe, it, expect } from "vitest";
import {
  sessionLoad,
  bandForRpe,
  acwr,
  polarizedDistribution,
  fitnessFatigueSeries,
  recentQualityDrift,
  volumeAdjustmentForAcwr,
  polarizationTargetForVolume,
  type LoadSession,
} from "@/lib/enduranceLoad";
import { format, addDays } from "date-fns";

const dayStr = (d: Date) => format(d, "yyyy-MM-dd");

describe("enduranceLoad", () => {
  describe("sessionLoad — Foster sRPE", () => {
    it("60 min × RPE 5 = 300 AU", () => {
      const s: LoadSession = {
        date: "2026-05-01", discipline: "run",
        actual_total_seconds: 3600, planned_total_seconds: null,
        overall_rpe: 5, peak_rpe: null, planned_avg_rpe: null,
      };
      expect(sessionLoad(s)).toBe(300);
    });
    it("uses segments when present", () => {
      const s: LoadSession = {
        date: "2026-05-01", discipline: "run",
        actual_total_seconds: 3600, planned_total_seconds: null,
        overall_rpe: 5, peak_rpe: null, planned_avg_rpe: null,
        segments: [
          { seconds: 600, rpe: 4 }, // 10 × 4 = 40
          { seconds: 1200, rpe: 9 }, // 20 × 9 = 180
        ],
      };
      expect(sessionLoad(s)).toBe(220);
    });
    it("ignores peak_rpe, falls back to planned_avg_rpe", () => {
      const s: LoadSession = {
        date: "2026-05-01", discipline: "run",
        actual_total_seconds: 600, planned_total_seconds: null,
        overall_rpe: null, peak_rpe: 10, planned_avg_rpe: 6,
      };
      // 10 min × 6 = 60
      expect(sessionLoad(s)).toBe(60);
    });
    it("0 when no RPE", () => {
      const s: LoadSession = {
        date: "2026-05-01", discipline: "run",
        actual_total_seconds: 600, planned_total_seconds: null,
        overall_rpe: null, peak_rpe: null, planned_avg_rpe: null,
      };
      expect(sessionLoad(s)).toBe(0);
    });
  });

  describe("bandForRpe", () => {
    it.each([
      [1, "easy"], [4, "easy"], [5, "mod"], [6, "mod"],
      [7, "hard"], [8, "hard"], [9, "max"], [10, "max"],
    ])("rpe=%s → %s", (r, id) => {
      expect(bandForRpe(r as number).id).toBe(id);
    });
  });

  describe("acwr", () => {
    it("insufficient when chronic ≤ 50", () => {
      const r = acwr([], new Date());
      expect(r.zone).toBe("insufficient");
      expect(r.ratio).toBeNull();
    });
    it("optimal zone in 0.8–1.3", () => {
      // 28 days each with 60min @ RPE 5 = 300 AU/day → acute=2100, chronic=2100, ratio=1.0
      const anchor = new Date("2026-05-28");
      const sessions: LoadSession[] = [];
      for (let i = 0; i < 28; i++) {
        sessions.push({
          date: dayStr(addDays(anchor, -i)),
          discipline: "run",
          actual_total_seconds: 3600,
          planned_total_seconds: null,
          overall_rpe: 5, peak_rpe: null, planned_avg_rpe: null,
        });
      }
      const r = acwr(sessions, anchor);
      expect(r.ratio).toBeCloseTo(1.0, 1);
      expect(r.zone).toBe("optimal");
    });
    it("danger when acute spikes", () => {
      const anchor = new Date("2026-05-28");
      const sessions: LoadSession[] = [];
      // 21 days of low load + 7 days of huge load
      for (let i = 7; i < 28; i++) {
        sessions.push({
          date: dayStr(addDays(anchor, -i)),
          discipline: "run", actual_total_seconds: 3600, planned_total_seconds: null,
          overall_rpe: 3, peak_rpe: null, planned_avg_rpe: null,
        });
      }
      for (let i = 0; i < 7; i++) {
        sessions.push({
          date: dayStr(addDays(anchor, -i)),
          discipline: "run", actual_total_seconds: 7200, planned_total_seconds: null,
          overall_rpe: 9, peak_rpe: null, planned_avg_rpe: null,
        });
      }
      const r = acwr(sessions, anchor);
      expect(r.ratio).toBeGreaterThan(1.5);
      expect(r.zone).toBe("danger");
    });
  });

  describe("polarizedDistribution", () => {
    it("computes easy/hard split", () => {
      const anchor = new Date("2026-05-28");
      const sessions: LoadSession[] = [
        { date: dayStr(anchor), discipline: "run", actual_total_seconds: 4800, planned_total_seconds: null, overall_rpe: 3, peak_rpe: null, planned_avg_rpe: null }, // 80 min easy
        { date: dayStr(addDays(anchor, -1)), discipline: "run", actual_total_seconds: 1200, planned_total_seconds: null, overall_rpe: 9, peak_rpe: null, planned_avg_rpe: null }, // 20 min max
      ];
      const r = polarizedDistribution(sessions, anchor, 28);
      expect(r.totalMin).toBe(100);
      expect(r.easyPct).toBe(80);
      expect(r.maxPct).toBe(20);
    });
  });

  describe("fitnessFatigueSeries", () => {
    it("CTL > ATL when fatigue decays after big load week", () => {
      const anchor = new Date("2026-05-28");
      const sessions: LoadSession[] = [];
      // 60 days of consistent 300 AU/day, then 14 days off
      for (let i = 14; i < 74; i++) {
        sessions.push({
          date: dayStr(addDays(anchor, -i)),
          discipline: "run", actual_total_seconds: 3600, planned_total_seconds: null,
          overall_rpe: 5, peak_rpe: null, planned_avg_rpe: null,
        });
      }
      const series = fitnessFatigueSeries(sessions, 30, anchor);
      const last = series[series.length - 1];
      // After 14 days off, fatigue (ATL τ=7) decays faster than fitness (CTL τ=42)
      expect(last.ctl).toBeGreaterThan(last.atl);
      expect(last.tsb).toBeGreaterThan(0); // fresh
    });
  });

  describe("recentQualityDrift", () => {
    it("hold when too few quality sessions", () => {
      const r = recentQualityDrift([
        { date: "2026-05-01", planned_avg_rpe: 7, overall_rpe: 8, peak_rpe: null, status: "completed" },
      ]);
      expect(r.recommendation).toBe("hold");
      expect(r.volumeMultiplier).toBe(1.0);
    });
    it("reduce_volume when 4+ drifted", () => {
      const sessions = Array.from({ length: 5 }, (_, i) => ({
        date: `2026-05-${10 + i}`,
        planned_avg_rpe: 7,
        overall_rpe: 9,
        peak_rpe: null,
        status: "completed",
      }));
      const r = recentQualityDrift(sessions);
      expect(r.recommendation).toBe("reduce_volume");
      expect(r.volumeMultiplier).toBe(0.85);
    });
    it("easy_week when 3 drifted", () => {
      const sessions = [
        { date: "2026-05-10", planned_avg_rpe: 7, overall_rpe: 8, peak_rpe: null, status: "completed" },
        { date: "2026-05-11", planned_avg_rpe: 7, overall_rpe: 8, peak_rpe: null, status: "completed" },
        { date: "2026-05-12", planned_avg_rpe: 7, overall_rpe: 8, peak_rpe: null, status: "completed" },
        { date: "2026-05-13", planned_avg_rpe: 7, overall_rpe: 7, peak_rpe: null, status: "completed" },
        { date: "2026-05-14", planned_avg_rpe: 7, overall_rpe: 7, peak_rpe: null, status: "completed" },
      ];
      const r = recentQualityDrift(sessions);
      expect(r.recommendation).toBe("easy_week");
      expect(r.volumeMultiplier).toBe(0.9);
    });
  });

  describe("volumeAdjustmentForAcwr", () => {
    it.each([
      [null, 1.0], [1.0, 1.0], [1.4, 0.9], [1.6, 0.8], [0.6, 1.05],
    ])("ratio=%s → %s", (ratio, expected) => {
      expect(volumeAdjustmentForAcwr(ratio as number | null)).toBe(expected);
    });
  });

  describe("polarizationTargetForVolume", () => {
    it("40/60 (HIIT-weighted) at low volume", () => {
      const t = polarizationTargetForVolume(120);
      expect(t.easyPct).toBe(40);
      expect(t.hardPct).toBe(60);
      expect(t.bucket).toBe("low");
    });
    it("80/20 at elite volume", () => {
      const t = polarizationTargetForVolume(540);
      expect(t.easyPct).toBe(80);
      expect(t.bucket).toBe("high");
    });
    it("interpolates linearly between 150 and 450", () => {
      const t = polarizationTargetForVolume(300);
      // midpoint between 40 and 80 → 60
      expect(t.easyPct).toBe(60);
    });
  });
});
