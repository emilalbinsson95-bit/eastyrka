import { describe, it, expect } from "vitest";
import { generate20WeekMarathonPlan } from "@/lib/marathonPlanGenerator";

describe("marathonPlanGenerator", () => {
  const plan = generate20WeekMarathonPlan({
    startMonday: "2026-01-05",
    tenKPbSeconds: 45 * 60,
    daysPerWeek: 5,
  });

  it("generates 20 weeks of sessions", () => {
    expect(plan.weeks).toBe(20);
    expect(plan.weeklyVolumeMin.length).toBe(20);
    expect(plan.phaseLabels.length).toBe(20);
  });

  it("race day is final Sunday", () => {
    // startMonday + 19*7+6 days = race Sunday
    expect(plan.raceDate).toBe("2026-05-17");
  });

  it("every week has at least one session", () => {
    for (let w = 1; w <= 20; w++) {
      const wkSessions = plan.sessions.filter((s) => s.weekIndex === w);
      expect(wkSessions.length).toBeGreaterThan(0);
    }
  });

  it("contains race session in week 20", () => {
    const race = plan.sessions.find((s) => s.type === "race");
    expect(race).toBeTruthy();
    expect(race!.weekIndex).toBe(20);
  });

  it("weekly volume scales with athlete fitness", () => {
    const slow = generate20WeekMarathonPlan({
      startMonday: "2026-01-05", tenKPbSeconds: 55 * 60, daysPerWeek: 5,
    });
    const fast = generate20WeekMarathonPlan({
      startMonday: "2026-01-05", tenKPbSeconds: 35 * 60, daysPerWeek: 5,
    });
    // Faster athletes get higher prescribed volume
    expect(fast.weeklyVolumeMin[5]).toBeGreaterThan(slow.weeklyVolumeMin[5]);
  });

  it("volumeAdjustment scales weekly minutes", () => {
    const lite = generate20WeekMarathonPlan({
      startMonday: "2026-01-05", tenKPbSeconds: 45 * 60, daysPerWeek: 5,
      volumeAdjustment: 0.85,
    });
    expect(lite.weeklyVolumeMin[5]).toBeLessThan(plan.weeklyVolumeMin[5]);
  });

  it("taper week (19) volume < peak week", () => {
    expect(plan.weeklyVolumeMin[18]).toBeLessThan(plan.weeklyVolumeMin[13]);
  });

  it("respects daysPerWeek", () => {
    const four = generate20WeekMarathonPlan({
      startMonday: "2026-01-05", tenKPbSeconds: 45 * 60, daysPerWeek: 4,
    });
    const six = generate20WeekMarathonPlan({
      startMonday: "2026-01-05", tenKPbSeconds: 45 * 60, daysPerWeek: 6,
    });
    const w1four = four.sessions.filter((s) => s.weekIndex === 1).length;
    const w1six = six.sessions.filter((s) => s.weekIndex === 1).length;
    expect(w1six).toBeGreaterThan(w1four);
  });

  it("all sessions have a valid date, type and steps array", () => {
    for (const s of plan.sessions) {
      expect(s.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(s.type).toBeTruthy();
      expect(Array.isArray(s.steps)).toBe(true);
    }
  });
});
