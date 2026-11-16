import { describe, expect, it } from "vitest";
import { applyPercentLadder, ladderTopSets, ladderWavePct, LADDER_NOTE_TOP } from "./percentLadder";
import { getTemplate } from "./strengthTemplates";
import { resizeTemplateWeeks } from "./blockLength";
import { metricLiftKey } from "./liftMetrics";

const standard = (working = 4) => {
  const t = getTemplate("standard-pl")!;
  return resizeTemplateWeeks(t.buildWeeks(t.daysPerWeek), working, true);
};

describe("steg 9: procenttrappa", () => {
  it("vågen 70/75/80/85 och nästa varv 2,5 högre", () => {
    expect([1, 2, 3, 4, 5, 6].map(ladderWavePct)).toEqual([70, 75, 80, 85, 72.5, 77.5]);
    expect(ladderTopSets(70)).toEqual({ sets: 5, reps: 5 });
    expect(ladderTopSets(77.5)).toEqual({ sets: 5, reps: 4 });
    expect(ladderTopSets(85)).toEqual({ sets: 4, reps: 2 });
    expect(ladderTopSets(92)).toEqual({ sets: 3, reps: 1 });
  });
  it("Standard powerlifting, 4 arbetsveckor, trappa på bänk: toppset 5×5@70, 5×4@75, 5×3@80, 4×2@85", () => {
    const base = standard(4);
    const weeks = applyPercentLadder(base, { bench: true });
    const tops = weeks.filter((w) => w.kind === "working").map((w) => w.sessions.flatMap((s) => s.exercises).filter((e) => e.notes === LADDER_NOTE_TOP).map((e) => [e.target_sets, e.target_reps, e.target_pct]));
    expect(tops).toEqual([[[5, 5, 70]], [[5, 4, 75]], [[5, 3, 80]], [[4, 2, 85]]]);
    // Ramp: 50 × 5, 60 × 4, 67,5 × 3 before 75 % (67,5 is 7,5 below the top).
    const w2 = weeks.find((w) => w.kind === "working" && w.week_index === base.filter((x) => x.kind === "working")[1].week_index)!;
    const heavy = w2.sessions.find((s) => s.exercises.some((e) => e.notes === LADDER_NOTE_TOP))!;
    expect(heavy.exercises.filter((e) => e.target_pct != null && metricLiftKey(e.exercise) === "bench").slice(0, 4).map((e) => [e.target_pct, e.target_reps])).toEqual([[50, 5], [60, 4], [67.5, 3], [75, 4]]);
  });
  it("70 % hoppar över 67,5-steget (mindre än 5 procentenheter under)", () => {
    const weeks = applyPercentLadder(standard(4), { bench: true });
    const first = weeks.find((w) => w.kind === "working")!;
    const heavy = first.sessions.find((s) => s.exercises.some((e) => e.notes === LADDER_NOTE_TOP))!;
    expect(heavy.exercises.filter((e) => e.target_pct != null && e.target_pct < 70 && e.notes !== "Procenttrappa · lättare dag").map((e) => e.target_pct)).toEqual([50, 60]);
  });
  it("böj och mark är identiska med ett block utan valet", () => {
    const base = standard(4);
    const weeks = applyPercentLadder(base, { bench: true });
    const other = (w: typeof base) => w.map((x) => x.sessions.map((s) => s.exercises.filter((e) => metricLiftKey(e.exercise, e.variation) !== "bench")));
    expect(other(weeks)).toEqual(other(base));
  });
  it("övriga bänkdagar blir 62,5 % 5 × 4 och avlastning 70 % med halverade set", () => {
    const base = standard(4);
    const weeks = applyPercentLadder(base, { bench: true });
    const light = weeks.filter((w) => w.kind === "working").flatMap((w) => w.sessions.flatMap((s) => s.exercises)).filter((e) => e.notes === "Procenttrappa · lättare dag");
    expect(light.length).toBeGreaterThan(0);
    expect(light.every((e) => e.target_pct === 62.5 && e.target_sets === 5 && e.target_reps === 4)).toBe(true);
    const deload = weeks.find((w) => w.kind === "deload");
    const baseDeload = base.find((w) => w.kind === "deload");
    if (deload && baseDeload) {
      const before = baseDeload.sessions.flatMap((s) => s.exercises).filter((e) => metricLiftKey(e.exercise, e.variation) === "bench");
      const after = deload.sessions.flatMap((s) => s.exercises).filter((e) => metricLiftKey(e.exercise, e.variation) === "bench");
      expect(after.map((e) => [e.target_pct, e.target_sets])).toEqual(before.map((e) => [70, Math.max(1, Math.ceil(e.target_sets / 2))]));
    }
  });
  it("utan val är blocket oförändrat", () => {
    const base = standard(4);
    expect(applyPercentLadder(base, {})).toBe(base);
  });
});
