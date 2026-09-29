import { describe, it, expect } from "vitest";
import { summarizePeaking, buildPeakingWeeks, type PeakLog } from "@/lib/peaking";

const today = "2026-03-01";

function log(daysAgo: number, exercise: string, reps: number, weight: number, rpe = 8): PeakLog {
  const d = new Date("2026-03-01T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return { date: d.toISOString().slice(0, 10), exercise, variation: null, reps, weight_kg: weight, rpe };
}

function history(): PeakLog[] {
  const out: PeakLog[] = [];
  for (let w = 0; w < 10; w++) {
    const base = w * 7;
    for (let s = 0; s < 5; s++) out.push(log(base + 1, "Back squat", 5, 170, 8));
    for (let s = 0; s < 6; s++) out.push(log(base + 3, "Bench press", 5, 120, 8));
    for (let s = 0; s < 4; s++) out.push(log(base + 5, "Deadlift", 3, 210, 8.5));
    for (let s = 0; s < 3; s++) out.push(log(base + 3, "Chest-supported row", 10, 70, 7));
  }
  return out;
}

describe("summarizePeaking", () => {
  const sum = summarizePeaking({ today, logs: history(), baselines: [] });

  it("finds the competition lifts the athlete actually trains", () => {
    expect(sum.lifts.squat.trained).toBe(true);
    expect(sum.lifts.bench.name).toBe("Bench press");
    expect(sum.lifts.deadlift.trained).toBe(true);
    expect(sum.thin).toBe(false);
  });

  it("estimates 1RM above the heaviest working weight", () => {
    expect(sum.lifts.squat.e1rm!).toBeGreaterThan(170);
    expect(sum.lifts.squat.e1rm!).toBeLessThan(230);
  });

  it("measures recent weekly sets per lift", () => {
    expect(sum.lifts.squat.weeklySets).toBeGreaterThan(4);
    expect(sum.lifts.squat.weeklySets).toBeLessThan(7);
  });

  it("keeps the athlete's own accessories, not template ones", () => {
    expect(sum.accessories.map((a) => a.exercise)).toContain("Chest-supported row");
  });

  it("ignores variations when picking the competition lift", () => {
    const s = summarizePeaking({
      today,
      logs: [...history(), log(4, "Bulgarian split squat", 10, 40, 7), log(4, "Romanian deadlift", 8, 120, 7)],
      baselines: [],
    });
    expect(s.lifts.squat.name).toBe("Back squat");
    expect(s.lifts.deadlift.name).toBe("Deadlift");
  });

  it("prefers a coach baseline when it is higher than the log estimate", () => {
    const s = summarizePeaking({
      today,
      logs: history(),
      baselines: [{ exercise: "Back squat", one_rm_kg: 250 }],
    });
    expect(s.lifts.squat.e1rm).toBe(250);
  });
});

describe("buildPeakingWeeks", () => {
  const sum = summarizePeaking({ today, logs: history(), baselines: [] });
  const weeks = buildPeakingWeeks(3, sum);

  const mainSets = (wi: number) =>
    weeks[wi].sessions
      .flatMap((s) => s.exercises)
      .filter((e) => /squat|bench|deadlift/i.test(e.exercise))
      .reduce((a, e) => a + e.target_sets, 0);

  it("is three weeks long", () => {
    expect(weeks).toHaveLength(3);
    expect(weeks.map((w) => w.week_index)).toEqual([1, 2, 3]);
  });

  it("drops volume every week (taper) while holding intensity in weeks 1-2", () => {
    expect(mainSets(0)).toBeGreaterThan(mainSets(1));
    expect(mainSets(1)).toBeGreaterThan(mainSets(2));
    const recentWeekly =
      sum.lifts.squat.weeklySets + sum.lifts.bench.weeklySets + sum.lifts.deadlift.weeklySets;
    expect(mainSets(0)).toBeLessThan(recentWeekly);
  });

  it("gets heaviest in week 2 and easy in meet week", () => {
    const topRpe = (wi: number) =>
      Math.max(...weeks[wi].sessions.flatMap((s) => s.exercises.map((e) => e.target_rpe ?? 0)));
    expect(topRpe(1)).toBeGreaterThanOrEqual(topRpe(0));
    expect(topRpe(2)).toBeLessThan(topRpe(1));
  });

  it("cuts the meet week to openers plus one flush and no accessories", () => {
    expect(weeks[2].sessions.length).toBe(2);
    const names = weeks[2].sessions.flatMap((s) => s.exercises.map((e) => e.exercise));
    expect(names.every((n) => /squat|bench|deadlift/i.test(n))).toBe(true);
  });

  it("leaves out a lift the athlete has not trained", () => {
    const noDl = summarizePeaking({
      today,
      logs: history().filter((l) => l.exercise !== "Deadlift"),
      baselines: [],
    });
    const w = buildPeakingWeeks(3, noDl);
    const names = w.flatMap((x) => x.sessions.flatMap((s) => s.exercises.map((e) => e.exercise)));
    expect(names.some((n) => /^deadlift$/i.test(n))).toBe(false);
  });

  it("assigns spread weekdays and never duplicates a day inside a week", () => {
    for (const w of weeks) {
      const days = w.sessions.map((s) => s.day_of_week);
      expect(new Set(days).size).toBe(days.length);
      expect(days.every((d) => d >= 1 && d <= 7)).toBe(true);
    }
  });

  it("still produces a sane block with no history at all", () => {
    const w = buildPeakingWeeks(3, null);
    expect(w).toHaveLength(3);
    expect(w.every((x) => x.sessions.length > 0)).toBe(true);
    expect(w.every((x) => x.sessions.every((s) => s.exercises.length > 0))).toBe(true);
  });

  it("adds a maintenance day at 4 days/week but not in meet week", () => {
    const w4 = buildPeakingWeeks(4, sum);
    expect(w4[0].sessions.length).toBeGreaterThanOrEqual(weeks[0].sessions.length);
    expect(w4[2].sessions.length).toBe(2);
  });
});
