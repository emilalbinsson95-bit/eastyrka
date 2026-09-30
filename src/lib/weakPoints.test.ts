import { describe, expect, it } from "vitest";
import { applyWeakPoints, normalizeWeakIds, sessionCap, exercisePriority } from "@/lib/weakPoints";
import { STRENGTH_TEMPLATES } from "@/lib/strengthTemplates";

describe("weak points", () => {
  it("keeps one weak point per lift", () => {
    expect(normalizeWeakIds(["squat-bottom", "squat-midrange", "bench-mid", "dl-hinge", "dl-hitch"])).toEqual([
      "squat-bottom", "bench-mid", "dl-hinge",
    ]);
  });

  it("never exceeds the session cap and keeps comp lifts", () => {
    for (const t of STRENGTH_TEMPLATES) {
      if (t.id === "peak-3w") continue;
      for (const d of [2, 3, 4]) {
        const base = t.buildWeeks(d);
        const out = applyWeakPoints(base, ["squat-quads", "bench-elbows", "dl-hitch"]);
        out.forEach((w, wi) =>
          w.sessions.forEach((s, si) => {
            const before = base[wi].sessions[si].exercises.length;
            expect(s.exercises.length).toBeLessThanOrEqual(Math.max(sessionCap(d), before));
          }),
        );
      }
    }
  });

  it("ranks specificity above isolation", () => {
    expect(exercisePriority({ exercise: "Back squat", target_sets: 3, target_reps: 5 } as never)).toBe(100);
    expect(exercisePriority({ exercise: "Incline dumbbell curl", target_sets: 3, target_reps: 10 } as never)).toBeLessThan(
      exercisePriority({ exercise: "Chest-supported row", target_sets: 3, target_reps: 10 } as never),
    );
  });
  it("gives the athlete only actionable exercise cues, not a diagnosis", () => {
    const weeks = STRENGTH_TEMPLATES.find((t) => t.id !== "peak-3w")?.buildWeeks(3) ?? [];
    const out = applyWeakPoints(weeks, ["squat-hips-up", "dl-hips-up", "bench-mid"]);
    const exercises = out.flatMap((w) => w.sessions.flatMap((s) => s.exercises));
    expect(exercises.some((e) => e.notes?.includes("Keep your chest tall"))).toBe(true);
    expect(exercises.some((e) => /weak point|weakness|hips shoot up|prioritised/i.test(e.notes ?? ""))).toBe(false);
  });
});

import { setVolumeWeight, resolveVariantExercise } from "@/lib/exerciseVariants";
import { templateWeeklySets } from "@/lib/individualisation";
describe("1.5-reps", () => {
  it("counts 1.25 sets and resolves as own exercise", () => {
    expect(setVolumeWeight({ exercise: "1.5-rep squat" })).toBe(1.25);
    expect(resolveVariantExercise("Back squat", "1.5 reps").exercise).toBe("1.5-rep squat");
    const w = [{ week_index: 1, label: "Week 1", sessions: [{ day_of_week: 1, title: "S", exercises: [
      { exercise: "1.5-rep squat", target_sets: 4, target_reps: 4, target_rpe: 7, intensity_metric: "rpe" as const },
    ] }] }];
    expect(templateWeeklySets(w as never).get("squat")).toBe(5);
  });
});
