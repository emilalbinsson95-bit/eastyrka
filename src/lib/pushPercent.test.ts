import { describe, expect, it } from "vitest";
import { applyPushProgression, decidePush, PUSH_PCT_RULES_VERSION, pushPctWeightKg, type PushConfig, type PushExercise } from "./pushProgression";
import type { TemplateWeek } from "./strengthTemplates";

const bench: PushConfig = { lift: "bench", enabled: true, plan_e1rm: 165, step_pct: 1.25, rounding_kg: 2.5, main_sets: 4, main_reps: 5, main_rpe: 7.5, push_type: "percent", main_pct: 80, rpe_cap: 9 };
const week = (kind: TemplateWeek["kind"], week_index: number): TemplateWeek => ({
  week_index, kind, sessions: [{ day_of_week: 1, title: "A", exercises: [
    { exercise: "Bench press", variation: "Competition grip & pause", target_sets: 4, target_reps: 5, target_rpe: 7, intensity_metric: "rpe" },
    { exercise: "Back squat", target_sets: 4, target_reps: 5, target_rpe: 7, intensity_metric: "rpe" },
  ] }],
} as TemplateWeek);

describe("steg 5: push i fast procent", () => {
  it("4 × 5 @ 80 % av plan-e1RM 165 kg ger 132,5 kg på alla fyra set", () => {
    expect(pushPctWeightKg(165, 80, 2.5)).toBe(132.5);
    const [w] = applyPushProgression([week("working", 1)], [bench]);
    const row = w.sessions[0].exercises[0] as PushExercise;
    expect(row).toMatchObject({ target_sets: 4, target_reps: 5, target_pct: 80, target_weight_kg: 132.5, rpe_cap: 9, push_main: true, push_load_pct: 0.8, rules_version: PUSH_PCT_RULES_VERSION });
    expect(row.target_rpe).toBeUndefined();
    // Other lifts stay untouched.
    expect(w.sessions[0].exercises[1]).toMatchObject({ exercise: "Back squat", target_rpe: 7 });
  });
  it("RPE-start is unchanged when the push type is RPE", () => {
    const [w] = applyPushProgression([week("working", 1)], [{ ...bench, push_type: "rpe" }]);
    expect((w.sessions[0].exercises[0] as PushExercise).target_pct).toBeUndefined();
  });
  const sets = Array.from({ length: 4 }, () => ({ confirmed: true, prescribedReps: 5, prescribedKg: 132.5, reps: 5, kg: 132.5, rpe: 8 }));
  const base = { plan: 165, start: 165, step: 1.25, misses: 0, sets, expectedSets: 4, pctMode: true, rpeCap: 9 };
  it("klarade set under taket föreslår nästa steg (coachen kan ångra)", () => {
    expect(decidePush(base)).toMatchObject({ decision: "push", misses: 0 });
    expect(decidePush(base).after).toBeCloseTo(167.06, 2);
  });
  it("ett set över RPE-taket räknas som miss", () => {
    expect(decidePush({ ...base, sets: sets.map((s, i) => ({ ...s, rpe: i === 2 ? 9.5 : 8 })) })).toMatchObject({ decision: "miss", misses: 1 });
  });
  it("saknad RPE eller vikt utanför ±2,5 kg ger inget beslut", () => {
    expect(decidePush({ ...base, sets: sets.map((s, i) => ({ ...s, rpe: i === 1 ? undefined : 8 })) }).decision).toBe("skip");
    expect(decidePush({ ...base, sets: sets.map((s, i) => ({ ...s, kg: i === 1 ? 127.5 : 132.5 })) }).decision).toBe("skip");
    expect(decidePush({ ...base, sets: sets.map((s, i) => ({ ...s, kg: i === 1 ? 130 : 132.5 })) }).decision).toBe("push");
  });
});
