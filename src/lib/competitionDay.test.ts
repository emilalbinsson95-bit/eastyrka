import { describe, expect, it } from "vitest";
import { attemptOrderWarning, attemptsFromOpener, meetResult, parseAttempts, resolveAttemptPlan, warmupLadder } from "./competitionDay";

describe("competition day", () => {
  it("derives second and third attempt from the opener", () => {
    expect(attemptsFromOpener(145)).toEqual([145, 152.5, 157.5]);
    expect(attemptsFromOpener(202.5)).toEqual([202.5, 212.5, 220]);
    expect(attemptsFromOpener(null)).toEqual([null, null, null]);
  });
  it("always increases by at least 2.5 kg", () => {
    expect(attemptsFromOpener(20)).toEqual([20, 22.5, 25]);
  });
  it("keeps saved coach suggestions and fills gaps from the opener", () => {
    const plan = resolveAttemptPlan({ squat: [140, 147.5, null] }, { squat: 130, bench: 67.5 });
    expect(plan.squat).toEqual([140, 147.5, 152.5]);
    expect(plan.bench).toEqual([67.5, 70, 72.5]);
    expect(plan.deadlift).toEqual([null, null, null]);
  });
  it("builds increasing warmups below the opener", () => {
    expect(warmupLadder("squat", 202.5)).toEqual([
      { kg: 20, reps: 5 }, { kg: 80, reps: 5 }, { kg: 110, reps: 3 }, { kg: 140, reps: 2 }, { kg: 160, reps: 1 }, { kg: 180, reps: 1 }, { kg: 190, reps: 1 },
    ]);
    const light = warmupLadder("bench", 57.5);
    expect(light[0]).toEqual({ kg: 20, reps: 8 });
    expect(light.every((s, i) => s.kg < 57.5 && (i === 0 || s.kg > light[i - 1].kg))).toBe(true);
    expect(warmupLadder("deadlift", 127.5)[0]).toEqual({ kg: 60, reps: 3 });
  });
  it("warns when an attempt is lighter than the one before", () => {
    expect(attemptOrderWarning([140, 135, null])).toMatch(/Försök 2/);
    expect(attemptOrderWarning([140, 140, 145])).toBeNull();
  });
  it("totals only when all three lifts have a good attempt", () => {
    const attempts = parseAttempts({ squat: [{ kg: 140, success: true }, { kg: 147.5, success: false }], bench: [{ kg: 70, success: true }], deadlift: [{ kg: 150, success: false }] });
    expect(meetResult(attempts)).toEqual({ best: { squat: 140, bench: 70, deadlift: null }, total: null });
    attempts.deadlift = [{ kg: 150, success: true }];
    expect(meetResult(attempts).total).toBe(360);
  });
});
