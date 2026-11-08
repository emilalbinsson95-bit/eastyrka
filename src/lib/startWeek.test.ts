import { describe, expect, it } from "vitest";
import { getTemplate, type TemplateExercise } from "@/lib/strengthTemplates";
import { buildFixedWeeks, isFixedTemplate } from "@/lib/fixedTemplate";
import { blockWeeks, templateBlockShape, type SeasonBlock } from "@/lib/seasonPlanning";
import { compLiftKey } from "@/lib/liftIdentity";

const template = getTemplate("start-week")!;
const all = (days: number, style: "sumo" | "conventional" | null = null) =>
  buildFixedWeeks(template, days, style).flatMap((w) => w.sessions.flatMap((s) => s.exercises));
const triples = (exs: TemplateExercise[]) => exs.filter((e) => e.target_rpe === 10);

describe("startvecka", () => {
  it("är en fast vecka", () => {
    expect(isFixedTemplate(template)).toBe(true);
    for (const d of [2, 3, 4]) expect(buildFixedWeeks(template, d, null)).toHaveLength(1);
  });

  it("ger exakt en maximal trea på RPE 10 i knäböj, bänk och mark för 2–4 dagar", () => {
    for (const d of [2, 3, 4]) {
      const t = triples(all(d));
      expect(t).toHaveLength(3);
      expect(t.every((e) => e.target_sets === 1 && e.target_reps === 3 && e.target_weight_kg == null)).toBe(true);
      expect(t.map((e) => compLiftKey(e.exercise)).sort()).toEqual(["bench", "deadlift", "squat"]);
      expect(t.every((e) => /filma/i.test(e.notes ?? ""))).toBe(true);
    }
  });

  it("ger 2, 3 och 4 pass", () => {
    for (const d of [2, 3, 4]) expect(buildFixedWeeks(template, d, null)[0].sessions).toHaveLength(d);
  });

  it("powerbuilding är 3 set med 8–12 reps på RPE 8", () => {
    const rest = all(3).filter((e) => e.target_rpe !== 10);
    expect(rest.length).toBeGreaterThan(0);
    expect(rest.every((e) => e.target_sets === 3 && e.target_reps >= 8 && e.target_reps <= 12 && e.target_rpe === 8)).toBe(true);
  });

  it("sumolyftare filmar sumo, konventionella aldrig sumo", () => {
    expect(triples(all(3, "sumo")).some((e) => e.exercise === "Sumo deadlift")).toBe(true);
    expect(all(3, "conventional").some((e) => /sumo/i.test(`${e.exercise} ${e.variation ?? ""}`))).toBe(false);
  });

  it("är alltid en vecka i säsongsplanen, även om längd har sparats", () => {
    const block: SeasonBlock = { id: "s", name: "Startvecka", focus: "strength", templateId: "start-week", startDate: "2026-11-09", daysPerWeek: 3, notes: "", workingWeeks: 6, deload: true };
    expect(templateBlockShape(block)).toEqual({ workingWeeks: 1, deload: false });
    expect(blockWeeks(block)).toBe(1);
  });
});
