import { describe, it, expect } from "vitest";
import { applyPushProgression, decidePush, PUSH_WEEK_NOTE, type PushConfig } from "./pushProgression";
import type { TemplateWeek } from "./strengthTemplates";

const cfg: PushConfig = { lift: "bench", enabled: true, plan_e1rm: 140, step_pct: 1.25, rounding_kg: 2.5, main_sets: 4, main_reps: 4, main_rpe: 7.5 };
const wk = (i: number, kind: any, ex: any[]): TemplateWeek => ({ week_index: i, label: `W${i}`, kind, notes: "Add ~2.5kg on top set", sessions: [{ day_of_week: 1, title: "A", exercises: ex }] } as any);
const set = (kg: number) => ({ confirmed: true, prescribedReps: 4, prescribedKg: 115, reps: 4, kg, rpe: 7.5 });

describe("push rules 2", () => {
  it("accepts a start weight within 2.5 kg of the plan", () => {
    const r = decidePush({ plan: 140, start: 140, step: 1.25, misses: 0, expectedSets: 2, sets: [set(117.5), set(117.5)], firstSetMode: true, targetRpe: 7.5 });
    expect(r.decision).toBe("push");
  });
  it("skips when the start weight is more than 2.5 kg off", () => {
    const r = decidePush({ plan: 140, start: 140, step: 1.25, misses: 0, expectedSets: 2, sets: [set(120), set(120)], firstSetMode: true, targetRpe: 7.5 });
    expect(r.decision).toBe("skip");
  });
  it("deload weight is never above the push working weight", () => {
    const out = applyPushProgression([
      wk(1, "working", [{ exercise: "Bench Press", target_sets: 4, target_reps: 5, target_rpe: 7 }]),
      wk(2, "deload", [{ exercise: "Bench Press", target_sets: 2, target_reps: 3, target_rpe: 6 }]),
    ], [cfg]);
    const main = out[0].sessions[0].exercises[0].target_weight_kg!;
    expect(out[1].sessions[0].exercises[0].target_weight_kg!).toBeLessThanOrEqual(main);
  });
  it("folds a heavy single into push sets and uses Swedish push notes", () => {
    const out = applyPushProgression([
      wk(1, "working", [{ exercise: "Bench Press", target_sets: 4, target_reps: 5, target_rpe: 7 }]),
      wk(2, "working", [{ exercise: "Bench Press", target_sets: 1, target_reps: 1, target_rpe: 9 }, { exercise: "Bench Press", target_sets: 2, target_reps: 4, target_rpe: 8 }]),
    ], [cfg]);
    const ex = out[1].sessions[0].exercises;
    expect(ex.length).toBe(1);
    expect(ex[0].target_sets).toBe(3);
    expect(out[1].notes).toBe(PUSH_WEEK_NOTE);
  });
});
