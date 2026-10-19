import { describe, expect, it } from "vitest";
import { applyBlockVolume, evaluateBlock, type LiftEvaluation } from "./blockVolume";
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
const wk = (sessions: TemplateSession[], kind: TemplateWeek["kind"] = "working"): TemplateWeek => ({
  week_index: 1,
  kind,
  label: kind === "deload" ? "Deload" : "W1",
  sessions,
});

const upEval = (lift: LiftEvaluation["lift"]): LiftEvaluation => ({
  lift, sessions: 5, delta: 1, source: "data", reason: "test",
});

describe("evaluateBlock baseline lookup", () => {
  it("finds the baseline case-insensitively regardless of name spelling", () => {
    const logs = Array.from({ length: 4 }, (_, i) => ({
      date: `2026-06-0${i + 1}`,
      exercise: "back squat",
      set_number: 1,
      reps: 5,
      weight_kg: 100,
      rpe: 8,
    }));
    const evals = evaluateBlock(logs, { "Back Squat": 160 }, "normal", "2026-06-10");
    // With the baseline found case-insensitively, the trend reads ~77% of
    // baseline → data-driven -1. Without it, baseline would be 0 and the
    // evaluation would look rising (+1).
    const squat = evals.find((e) => e.lift === "squat")!;
    expect(squat.source).toBe("data");
    expect(squat.delta).toBe(-1);
  });
});

describe("applyBlockVolume", () => {
  it("never adds sets to over-warm or opener singles", () => {
    const weeks = [wk([sess([ex("Back squat", 4), ex("Back squat", 1, "Over-warm single")])])];
    const { weeks: out } = applyBlockVolume(weeks, [upEval("squat")]);
    const single = out[0].sessions[0].exercises.find((e) => e.variation === "Over-warm single")!;
    expect(single.target_sets).toBe(1);
  });

  it("adds the extra set to a regular comp lift, not the single", () => {
    const weeks = [wk([sess([ex("Back squat", 1, "Opener single"), ex("Back squat", 4)])])];
    const { weeks: out } = applyBlockVolume(weeks, [upEval("squat")]);
    const work = out[0].sessions[0].exercises.find((e) => !e.variation)!;
    expect(work.target_sets).toBe(5);
  });

  it("leaves deload, taper and peak weeks untouched", () => {
    for (const kind of ["deload", "taper", "peak"] as const) {
      const weeks = [wk([sess([ex("Back squat", 3)])], kind)];
      expect(applyBlockVolume(weeks, [upEval("squat")]).weeks).toEqual(weeks);
    }
  });
});
