import { describe, it, expect } from "vitest";
import {
  vdotFromRace,
  predict10kFromVdot,
  predict10kFromEfforts,
  blendPrediction,
  estimateForRpe,
  parseTimeToSeconds,
  secondsToTimeStr,
  fmtMSS,
  fmtPacePerKm,
} from "@/lib/endurancePaceHr";

describe("endurancePaceHr", () => {
  describe("vdotFromRace", () => {
    it("VDOT in elite range for 38:00 10k", () => {
      const v = vdotFromRace(38 * 60, 10000);
      expect(v).not.toBeNull();
      // Daniels VDOT for 38:00 10k ≈ 55
      expect(v!).toBeGreaterThan(52);
      expect(v!).toBeLessThan(58);
    });
    it("null for zero inputs", () => {
      expect(vdotFromRace(0, 10000)).toBeNull();
      expect(vdotFromRace(2000, 0)).toBeNull();
    });
  });

  describe("predict10kFromVdot", () => {
    it("round-trip — 45:00 10k → vdot → ≈ 45:00", () => {
      const v = vdotFromRace(45 * 60, 10000)!;
      const t = predict10kFromVdot(v);
      expect(t).not.toBeNull();
      expect(t!).toBeGreaterThan(45 * 60 - 5);
      expect(t!).toBeLessThan(45 * 60 + 5);
    });
  });

  describe("predict10kFromEfforts", () => {
    it("returns null when no efforts", () => {
      expect(predict10kFromEfforts([])).toBeNull();
    });
    it("skips short bursts <3 min", () => {
      expect(predict10kFromEfforts([{ distance_m: 400, duration_s: 80, avg_rpe: 9 }])).toBeNull();
    });
    it("uses best quality effort", () => {
      // A 5k @ 22:00 → strong VDOT
      const t = predict10kFromEfforts([{ distance_m: 5000, duration_s: 22 * 60, avg_rpe: 8 }]);
      expect(t).not.toBeNull();
      // Should be roughly 46-48 min 10k
      expect(t!).toBeGreaterThan(40 * 60);
      expect(t!).toBeLessThan(55 * 60);
    });
    it("cumulative fallback for steady runs", () => {
      const t = predict10kFromEfforts([
        { distance_m: 6000, duration_s: 30 * 60, avg_rpe: 4 },
      ]);
      expect(t).not.toBeNull();
    });
  });

  describe("blendPrediction (EWMA)", () => {
    it("returns raw current when no history", () => {
      expect(blendPrediction(2700, [])).toBe(2700);
    });
    it("dampens single outlier toward history", () => {
      // Recent history all around 2700 (45:00); single fast estimate 2400 (40:00)
      const blended = blendPrediction(2400, [2700, 2700, 2700, 2700]);
      // alpha=0.4 → blended ≈ 0.4*2400 + 0.6*2700 = 2580
      expect(blended).toBeCloseTo(2580, -1);
    });
    it("null current → null", () => {
      expect(blendPrediction(null, [2700])).toBeNull();
    });
  });

  describe("estimateForRpe", () => {
    it("run pace from 10k PB & RPE", () => {
      const r = estimateForRpe("run", 5, {
        ten_k_pb_seconds: 45 * 60,
        max_hr: 190, resting_hr: 50,
        ftp_watts: null, css_per_100m_seconds: null,
      });
      expect(r.paceLabel).toBeTruthy();
      expect(r.hrLabel).toBeTruthy();
      expect(r.paceMidSecPerKm).toBeGreaterThan(0);
    });
    it("coach pace override wins", () => {
      const r = estimateForRpe("run", 5, {
        ten_k_pb_seconds: 45 * 60, max_hr: 190, resting_hr: 50,
        ftp_watts: null, css_per_100m_seconds: null,
      }, { paceOverrideSecPerKm: 270 });
      expect(r.paceMidSecPerKm).toBe(270);
      expect(r.paceLabel).toContain("(target)");
    });
    it("HR override wins", () => {
      const r = estimateForRpe("run", 5, {
        ten_k_pb_seconds: 45 * 60, max_hr: 190, resting_hr: 50,
        ftp_watts: null, css_per_100m_seconds: null,
      }, { hrOverrideBpm: 165 });
      expect(r.hrMid).toBe(165);
    });
    it("bike → watts from FTP", () => {
      const r = estimateForRpe("bike", 7, {
        ten_k_pb_seconds: null, max_hr: 190, resting_hr: 50,
        ftp_watts: 250, css_per_100m_seconds: null,
      });
      expect(r.wattLabel).toMatch(/W$/);
    });
    it("swim → /100m from CSS", () => {
      const r = estimateForRpe("swim", 6, {
        ten_k_pb_seconds: null, max_hr: 190, resting_hr: 50,
        ftp_watts: null, css_per_100m_seconds: 90,
      });
      expect(r.paceLabel).toContain("/100m");
    });
    it("Karvonen HR uses HRR when resting present", () => {
      const a = estimateForRpe("run", 5, {
        ten_k_pb_seconds: 45 * 60, max_hr: 190, resting_hr: null,
        ftp_watts: null, css_per_100m_seconds: null,
      });
      const b = estimateForRpe("run", 5, {
        ten_k_pb_seconds: 45 * 60, max_hr: 190, resting_hr: 50,
        ftp_watts: null, css_per_100m_seconds: null,
      });
      expect(a.hrMid).not.toBe(b.hrMid);
    });
  });

  describe("parseTimeToSeconds / secondsToTimeStr", () => {
    it("round-trips mm:ss", () => {
      expect(parseTimeToSeconds("45:30")).toBe(45 * 60 + 30);
      expect(secondsToTimeStr(45 * 60 + 30)).toBe("45:30");
    });
    it("round-trips h:mm:ss", () => {
      expect(parseTimeToSeconds("1:45:30")).toBe(3600 + 45 * 60 + 30);
      expect(secondsToTimeStr(3600 + 45 * 60 + 30)).toBe("1:45:30");
    });
    it("invalid → null", () => {
      expect(parseTimeToSeconds("foo")).toBeNull();
      expect(parseTimeToSeconds("")).toBeNull();
    });
  });

  describe("fmtMSS / fmtPacePerKm", () => {
    it("pads seconds", () => {
      expect(fmtMSS(305)).toBe("5:05");
      expect(fmtPacePerKm(310)).toBe("5:10/km");
    });
    it("— for null/invalid", () => {
      expect(fmtMSS(null)).toBe("—");
      expect(fmtMSS(0)).toBe("—");
    });
  });
});
