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

import { reflowAfter } from "./seasonPlanning";
describe("adjusting a running season", () => {
  const mk = (id: string, start: string, extra: Partial<SeasonBlock> = {}): SeasonBlock => ({ id, name: id, focus: "strength", templateId: "standard-pl", startDate: start, daysPerWeek: 4, notes: "", ...extra });
  it("an extra week on a prepared block moves the next unprepared block one week, keeping its gap", () => {
    const before = [mk("a", "2026-11-02", { mesocycleId: "00000000-0000-4000-8000-000000000001", adjustedWeeks: 4 }), mk("b", "2026-12-07")];
    const after = reflowAfter([{ ...before[0], adjustedWeeks: 5 }, before[1]], 0, before);
    expect(after[1].startDate).toBe("2026-12-14");
  });
  it("prepared later blocks never move", () => {
    const id = "00000000-0000-4000-8000-000000000002";
    const before = [mk("a", "2026-11-02", { mesocycleId: id, adjustedWeeks: 4 }), mk("b", "2026-12-07", { mesocycleId: id })];
    expect(reflowAfter([{ ...before[0], adjustedWeeks: 5 }, before[1]], 0, before)[1].startDate).toBe("2026-12-07");
  });
});

import { peakTarget, validateSeason } from "./seasonPlanning";
describe("primary and secondary competitions", () => {
  const sec = [{ id: "serie", name: "Serietävling", date: "2026-12-12" }];
  const peak = (start: string, end: string, competitionId?: string): SeasonBlock => ({ id: `p${start}`, name: "Topp", focus: "competition", templateId: "peak-3w", startDate: start, endDate: end, peakWeeks: 2, daysPerWeek: 4, notes: "", competitionId });
  it("a peak aimed at the secondary meet must end the day before it", () => {
    expect(peakTarget(peak("2026-11-28", "2026-12-11", "serie"), "2027-03-06", sec)).toBe("2026-12-12");
    expect(validateSeason([peak("2026-11-28", "2026-12-11", "serie")], "2027-03-06", sec)).toBeNull();
    expect(validateSeason([peak("2026-11-27", "2026-12-10", "serie")], "2027-03-06", sec)).toMatch(/före sin tävling/);
  });
  it("secondary meets must come before the primary meet", () => {
    expect(validateSeason([peak("2026-11-28", "2026-12-11", "serie")], "2026-12-01", sec)).toMatch(/före huvudtävlingen/);
  });
  it("no block may run across a competition day", () => {
    const b: SeasonBlock = { id: "v", name: "Volym", focus: "volume", templateId: "standard-pl", startDate: "2026-12-07", daysPerWeek: 4, notes: "" };
    expect(validateSeason([b], "2027-03-06", sec)).toMatch(/tävlingsdag/);
  });
});

import { rescheduleFuture } from "./seasonPlanning";
describe("peaks stay anchored", () => {
  it("shortening an earlier block does not move or lengthen a 2-week peak", () => {
    const v: SeasonBlock = { id: "v", name: "V", focus: "volume", templateId: "standard-pl", startDate: "2026-11-03", daysPerWeek: 4, notes: "" };
    const pk: SeasonBlock = { id: "p", name: "P", focus: "competition", templateId: "peak-3w", startDate: "2026-11-28", endDate: "2026-12-11", peakWeeks: 2, daysPerWeek: 4, notes: "" };
    const out = rescheduleFuture([v, pk], "v", { workingWeeks: 3, deload: false });
    expect(out[1].startDate).toBe("2026-11-28");
    expect(blockWeeks(out[1])).toBe(2);
  });
});
