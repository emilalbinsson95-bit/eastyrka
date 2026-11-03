import { describe, expect, it } from "vitest";
import { resizeTemplateWeeks, templateShape } from "./blockLength";
import { getTemplate } from "./strengthTemplates";
import { blockWeeks, type SeasonBlock } from "./seasonPlanning";

const t = getTemplate("standard-pl")!;
const base = t.buildWeeks(4);
const maxRpe = (w: ReturnType<typeof t.buildWeeks>) => Math.max(...w.flatMap((x) => x.sessions.flatMap((s) => s.exercises.map((e) => e.target_rpe ?? 0))));

describe("block length", () => {
  it("standard template is 3 working weeks + deload", () => {
    expect(templateShape(base)).toEqual({ workingWeeks: 3, deload: true });
  });
  it("6 working weeks + deload gives 7 weeks, deload last", () => {
    const w = resizeTemplateWeeks(base, 6, true);
    expect(w).toHaveLength(7);
    expect(w.map((x) => x.week_index)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(w[6].kind).toBe("deload");
    expect(w.slice(0, 6).every((x) => x.kind !== "deload")).toBe(true);
  });
  it("longer blocks never exceed the template's hardest week", () => {
    expect(maxRpe(resizeTemplateWeeks(base, 9, false))).toBe(maxRpe(base));
  });
  it("deload can be turned off", () => {
    const w = resizeTemplateWeeks(base, 5, false);
    expect(w).toHaveLength(5);
    expect(w.some((x) => x.kind === "deload")).toBe(false);
  });
  it("season block length follows coach choice", () => {
    const b: SeasonBlock = { id: "a", name: "A", focus: "volume", templateId: "standard-pl", startDate: "2026-11-02", daysPerWeek: 4, notes: "" };
    expect(blockWeeks(b)).toBe(4);
    expect(blockWeeks({ ...b, workingWeeks: 6, deload: true })).toBe(7);
    expect(blockWeeks({ ...b, workingWeeks: 5, deload: false })).toBe(5);
  });
});
