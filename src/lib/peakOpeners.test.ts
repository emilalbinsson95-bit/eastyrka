import { describe, expect, it } from "vitest";
import { applyPeakSingles, suggestOpeners } from "./peakOpeners";
import { buildPeakingWeeks } from "./peaking";
import { generatorSettingsSchema } from "./seasonPlanning";

describe("editable peak openers", () => {
  it("uses recent first qualifying sets, not stale PRs, late singles or another stance", () => {
    const log = { date: "2026-10-15", exercise: "Sumo Deadlift", variation: null, reps: 3, weight_kg: 200, rpe: 8 };
    const result = suggestOpeners({ today: "2026-10-16", baselines: [{ exercise: "Sumo Deadlift", one_rm_kg: 350 }], logs: [log, { ...log, reps: 1, weight_kg: 300 }, { ...log, date: "2026-07-01", weight_kg: 350 }, { ...log, exercise: "Conventional Deadlift", weight_kg: 400 }, { ...log, date: "2026-10-14", variation: "Deficit", weight_kg: 400 }] }, "sumo");
    expect(result[2].count).toBe(1);
    expect(result[2].kg).toBeGreaterThan(200);
    expect(result[2].kg).toBeLessThan(230);
    expect(result[2].source).toBe("logs");
    expect(result[0].kg).toBeNull();
    const fallback = suggestOpeners({ today: "2026-10-16", baselines: [{ exercise: "Squat", one_rm_kg: 200 }], logs: [] });
    expect(fallback[0].source).toBe("baseline");
    expect(fallback[0].kg).toBeGreaterThan(170);
  });
  it.each([2,3,4])("keeps taper set budget for %i weeks and respects opt-out, edited weight and weeks", (duration) => {
    const base = buildPeakingWeeks(3, null, { weeks: duration });
    expect(applyPeakSingles(base, false, 8, {}, [1])).toBe(base);
    const result = applyPeakSingles(base, true, 8.5, { squat: 155 }, [1]);
    expect(result.at(-1)).toEqual(base.at(-1));
    const count = (weeks: typeof base) => weeks.flatMap((w) => w.sessions.flatMap((s) => s.exercises)).reduce((a,e) => a+e.target_sets,0);
    expect(count(result)).toBe(count(base));
    const single = result[0].sessions[0].exercises[0];
    expect(single.target_weight_kg).toBe(155);
    expect(single.target_reps).toBe(1);
    expect(single.target_rpe).toBe(8.5);
    if (duration > 2) expect(result[1]).toEqual(base[1]);
  });
  it("restores old settings safely and rejects invalid opener weights", () => {
    expect(generatorSettingsSchema.parse({}).peak.singles).toBe("unset");
    expect(generatorSettingsSchema.safeParse({ peak: { singles: "yes", rpe: 8, weeks: [1], openers: { squat: -5 } } }).success).toBe(false);
  });
});