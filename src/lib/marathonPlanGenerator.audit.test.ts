import { describe, it, expect } from "vitest";
import { generate20WeekMarathonPlan } from "./marathonPlanGenerator";

describe("marathonPlanGenerator audit fixes", () => {
  it("weekly sessions sum to approximately the prescribed weekly volume (6 days)", () => {
    const plan = generate20WeekMarathonPlan({
      startMonday: "2026-01-05",
      tenKPbSeconds: 45 * 60,
      daysPerWeek: 6,
    });

    for (let w = 1; w <= 19; w++) { // Week 20 has race which is null duration
      const wkSessions = plan.sessions.filter((s) => s.weekIndex === w);
      const actualMin = wkSessions.reduce((acc, s) => acc + s.planned_total_seconds, 0) / 60;
      const prescribedMin = plan.weeklyVolumeMin[w - 1];
      
      // Allow for small rounding differences (+/- 5-10%)
      const diff = Math.abs(actualMin - prescribedMin) / prescribedMin;
      expect(diff, `Week ${w} overshoot too high: prescribed ${prescribedMin}, actual ${actualMin}`).toBeLessThan(0.1);
    }
  });

  it("cutback weeks 8 and 12 have only one hard quality session", () => {
    const plan = generate20WeekMarathonPlan({
      startMonday: "2026-01-05",
      tenKPbSeconds: 45 * 60,
      daysPerWeek: 5,
    });

    [8, 12].forEach(w => {
      const wkSessions = plan.sessions.filter((s) => s.weekIndex === w);
      const qualityTypes = wkSessions.filter(s => ["lt_tempo", "vo2"].includes(s.type));
      // Should have 1 hard session (LT or VO2), not both.
      expect(qualityTypes.length).toBeLessThanOrEqual(1);
    });
  });

  it("slow runners get sensible long runs (at least 90m for peak)", () => {
    const slowPlan = generate20WeekMarathonPlan({
      startMonday: "2026-01-05",
      tenKPbSeconds: 65 * 60, // Very slow
      daysPerWeek: 4,
    });
    
    // Week 14 is a peak week
    const longRun = slowPlan.sessions.find(s => s.weekIndex === 14 && (s.type === "long" || s.type === "long_mp"));
    expect(longRun!.planned_total_seconds / 60).toBeGreaterThanOrEqual(90);
  });
});
