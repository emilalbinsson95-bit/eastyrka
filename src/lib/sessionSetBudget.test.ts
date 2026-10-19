import { describe, expect, it } from "vitest";
import { applySessionSetBudget } from "./sessionSetBudget";
import type { TemplateExercise, TemplateSession, TemplateWeek } from "./strengthTemplates";

const ex = (exercise: string, sets: number, variation?: string): TemplateExercise => ({
  exercise,
  variation,
  target_sets: sets,
  target_reps: 5,
  target_rpe: 8,
  intensity_metric: "rpe",
});

const sess = (exercises: TemplateExercise[]): TemplateSession => ({ day_of_week: 1, title: "D", exercises });
const wk = (sessions: TemplateSession[]): TemplateWeek => ({ week_index: 1, kind: "working", label: "W1", sessions });

describe("session set budget", () => {
  it("trims accessory sets first and keeps main lifts at 3+ sets", () => {
    const base = wk([sess([ex("Back squat", 5), ex("Bench press", 5), ex("Barbell row", 4)])]);
    const inflated = wk([sess([ex("Back squat", 6), ex("Bench press", 6), ex("Barbell row", 6)])]);
    const out = applySessionSetBudget(inflated, base, 12);
    const e = out[0].sessions[0].exercises;
    expect(e.find((x) => x.exercise === "Back squat")?.target_sets).toBeGreaterThanOrEqual(3);
    expect(e.find((x) => x.exercise === "Bench press")?.target_sets).toBeGreaterThanOrEqual(3);
    expect(e.reduce((a, x) => a + x.target_sets, 0)).toBeLessThanOrEqual(12);
    expect(e.find((x) => x.exercise === "Barbell row")?.target_sets).toBeLessThan(6);
  });

  it("matches exercises by name, never by index, when weak-point work reordered them", () => {
    const base = wk([sess([ex("Back squat", 5), ex("Bench press", 5)])]);
    // Weak-point insertion put a new exercise first.
    const reordered = wk([sess([ex("Leg press", 3), ex("Back squat", 6), ex("Bench press", 6)])]);
    const out = applySessionSetBudget(reordered, base, 10);
    const e = out[0].sessions[0].exercises;
    // Base caps still apply to the named exercises.
    expect(e.find((x) => x.exercise === "Back squat")?.target_sets).toBeLessThanOrEqual(5);
    expect(e.find((x) => x.exercise === "Bench press")?.target_sets).toBeLessThanOrEqual(5);
  });

  it("drops the lowest-priority added exercise before touching base exercises", () => {
    const base = wk([sess([ex("Back squat", 4), ex("Bench press", 4)])]);
    const withAdded = wk([sess([ex("Back squat", 4), ex("Bench press", 4), ex("Hip thrust", 3), ex("Cable fly", 3)])]);
    const out = applySessionSetBudget(withAdded, base, 9);
    const names = out[0].sessions[0].exercises.map((x) => x.exercise);
    expect(names).toContain("Back squat");
    expect(names).toContain("Bench press");
    expect(out[0].sessions[0].exercises.reduce((a, x) => a + x.target_sets, 0)).toBeLessThanOrEqual(9);
  });
});
