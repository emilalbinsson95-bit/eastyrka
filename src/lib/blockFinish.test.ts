import { describe, expect, it } from "vitest";
import { applyAdjustments, matchBaseline, type Adjustment, type HistoryInputs } from "./individualisation";
import { applyOverload, DEFAULT_OVERLOAD } from "./overload";
import { applyWeakPoints } from "./weakPoints";
import { getTemplate, type TemplateWeek } from "./strengthTemplates";
import { fillSuggestedLoads, finishLightWeeks, suggestedOneRm } from "./blockFinish";

const all = (w: TemplateWeek) => w.sessions.flatMap((s) => s.exercises);
const compSquat = (w: TemplateWeek) => all(w).find((e) => e.exercise === "Back squat" && e.variation === "Competition stance")!;
const history: HistoryInputs = { today: "2026-11-16", logs: [], readiness: [], baselines: [{ exercise: "Squat", one_rm_kg: 140 }], unavailability: [] };
const ramp: Adjustment = { id: "ramp-in", kind: "ramp-in", multiplier: 0.8, rampWeeks: 1, title: "", effect: "", reason: "", severity: "warn", defaultOn: true };

describe("generator: squat max under another name", () => {
  it("a 'Squat' max loads the template's 'Back squat'", () => {
    expect(matchBaseline({ exercise: "Back squat", variation: "Competition stance" }, history.baselines)?.one_rm_kg).toBe(140);
  });
  it("a pause squat never gets the competition squat max", () => {
    expect(matchBaseline({ exercise: "Back squat", variation: "Pause squat / tempo" }, history.baselines)).toBeUndefined();
  });
});

describe("generator: ramp-in only lightens the first week", () => {
  it("wave weeks 2–3 keep RPE 8 and 8.5 after a ramp-in week at 6", () => {
    const base = getTemplate("standard-pl")!.buildWeeks(4);
    const adjusted = applyAdjustments(base, [ramp], history);
    const out = applyOverload(adjusted, { ...DEFAULT_OVERLOAD, waveLoading: true }, 0, 1);
    expect(compSquat(out[0]).target_rpe).toBe(6);
    expect(compSquat(out[1]).target_rpe).toBe(8);
    expect(compSquat(out[2]).target_rpe).toBe(8.5);
  });
});

describe("generator: weak points do not duplicate exercises", () => {
  it("bench-mid does not add 'Close-grip bench press' when 'Close-grip bench' is planned", () => {
    const out = applyWeakPoints(getTemplate("standard-pl")!.buildWeeks(4), ["bench-mid"]);
    const closeGrip = all(out[0]).filter((e) => /close.?grip bench/i.test(e.exercise));
    expect(closeGrip).toHaveLength(1);
  });
  it("the deload swaps no squat slot when front squat came from another weak point's accessory", () => {
    const out = applyWeakPoints(getTemplate("standard-pl")!.buildWeeks(4), ["dl-floor", "squat-hips-up"]);
    const deload = out.find((w) => w.kind === "deload")!;
    expect(all(deload).some((e) => /front squat/i.test(e.exercise))).toBe(false);
  });
});

describe("generator: light weeks", () => {
  const weeks: TemplateWeek[] = [
    { week_index: 1, kind: "working", label: "1", sessions: [{ day_of_week: 1, title: "A", exercises: [
      { exercise: "Back squat", variation: "Competition stance", target_sets: 3, target_reps: 5, target_rpe: 6, intensity_metric: "rpe" },
      { exercise: "Front squat", target_sets: 3, target_reps: 6, target_rpe: 8, intensity_metric: "rpe" },
      { exercise: "Chest-supported row", target_sets: 3, target_reps: 10, target_rpe: 5.5, intensity_metric: "rpe", lengthened_partials: true },
      { exercise: "Cable triceps pushdown", target_sets: 2, target_reps: 12, target_rpe: 5.5, intensity_metric: "rpe" },
    ] }] },
    { week_index: 2, kind: "working", label: "2", sessions: [{ day_of_week: 1, title: "A", exercises: [
      { exercise: "Front squat", target_sets: 3, target_reps: 6, target_rpe: 8, intensity_metric: "rpe" },
      { exercise: "Cable triceps pushdown", target_sets: 2, target_reps: 12, target_rpe: 7.5, intensity_metric: "rpe" },
    ] }] },
    { week_index: 3, kind: "deload", label: "D", sessions: [{ day_of_week: 1, title: "A", exercises: [
      { exercise: "Cable triceps pushdown", target_sets: 3, target_reps: 12, target_rpe: 6, intensity_metric: "rpe" },
      { exercise: "Chest-supported row", target_sets: 3, target_reps: 10, target_rpe: 6, intensity_metric: "rpe", lengthened_partials: true },
    ] }] },
  ];
  const out = finishLightWeeks(weeks, 1);
  it("ramp-in week: added rows max RPE 7, no partials to failure", () => {
    expect(all(out[0])[1].target_rpe).toBe(7);
    expect(all(out[0])[2].lengthened_partials).toBe(false);
    expect(all(out[1])[0].target_rpe).toBe(8);
  });
  it("deload: never more sets than the working weeks, no partials", () => {
    expect(all(out[2])[0].target_sets).toBe(2);
    expect(all(out[2])[1].lengthened_partials).toBe(false);
  });
});

describe("generator: suggested weights on RPE rows", () => {
  const baselines = [{ exercise: "Squat", one_rm_kg: 140 }, { exercise: "Bench Press", one_rm_kg: 75 }, { exercise: "Sumo Deadlift", one_rm_kg: 140 }];
  it("pause squat uses 85 % of the squat max, close-grip 90 % of bench", () => {
    expect(suggestedOneRm({ exercise: "Pause squat", target_sets: 3, target_reps: 5, intensity_metric: "rpe" }, baselines)).toBeCloseTo(119);
    expect(suggestedOneRm({ exercise: "Close-grip bench press", target_sets: 3, target_reps: 8, intensity_metric: "rpe" }, baselines)).toBeCloseTo(67.5);
  });
  it("the athlete's own max for the exact lift wins over the estimate", () => {
    expect(suggestedOneRm({ exercise: "Front squat", target_sets: 3, target_reps: 6, intensity_metric: "rpe" }, [...baselines, { exercise: "Front Squat", one_rm_kg: 75 }])).toBe(75);
  });
  it("sumo deficit uses the sumo max; a conventional lifter never gets the sumo max", () => {
    expect(suggestedOneRm({ exercise: "Deficit deadlift", variation: "Sumo stance", target_sets: 4, target_reps: 5, intensity_metric: "rpe" }, baselines, "sumo")).toBeCloseTo(126);
    expect(suggestedOneRm({ exercise: "Deficit deadlift", target_sets: 4, target_reps: 5, intensity_metric: "rpe" }, baselines, "conventional")).toBeNull();
  });
  it("fills empty RPE rows, keeps given weights and leaves unknown lifts empty", () => {
    const filled = fillSuggestedLoads([{ week_index: 1, kind: "working", label: "1", sessions: [{ day_of_week: 1, title: "A", exercises: [
      { exercise: "Back squat", variation: "Competition stance", target_sets: 3, target_reps: 5, target_rpe: 6, intensity_metric: "rpe" },
      { exercise: "Bench press", target_sets: 3, target_reps: 5, target_rpe: 6, intensity_metric: "rpe", target_weight_kg: 57.5 },
      { exercise: "Leg extension", target_sets: 3, target_reps: 12, target_rpe: 7, intensity_metric: "rpe" },
    ] }] }], baselines);
    const [squat, bench, legExt] = all(filled[0]);
    expect(squat.target_weight_kg).toBeGreaterThan(95);
    expect(squat.target_weight_kg).toBeLessThan(115);
    expect(bench.target_weight_kg).toBe(57.5);
    expect(legExt.target_weight_kg).toBeUndefined();
  });
});

describe("generator: build exercises keep weak-point work", () => {
  it("bench build row goes to a day with room instead of replacing the leg extension", async () => {
    const { applyBuilders } = await import("./builderExercises");
    const wp = applyWeakPoints(getTemplate("standard-pl")!.buildWeeks(4), ["dl-floor", "bench-mid", "squat-hips-up"]);
    const { weeks } = applyBuilders(wp, {
      squat: { exercise: "Leg Press", perWeek: 1, sets: 3, repMin: 6, repMax: 10, mode: "add", stepKg: 5 },
      bench: { exercise: "Dumbbell Bench Press", perWeek: 1, sets: 3, repMin: 6, repMax: 10, mode: "add", stepKg: 2.5 },
    }, { protect: ["Leg extension", "Front squat", "Spoto press", "Close-grip bench press", "Deficit deadlift"] });
    const names = all(weeks[0]).map((e) => e.exercise);
    expect(names).toContain("Leg extension");
    expect(names).toContain("Dumbbell Bench Press");
    expect(names).toContain("Leg Press");
  });
});
