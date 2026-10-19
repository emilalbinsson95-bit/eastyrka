import { describe, expect, it } from "vitest";
import { blockEnd, blockWeeks, defaultSeason, generatorSettingsSchema, rescheduleFuture, seasonBlocksSchema, scheduleBlocks, validateSeason } from "./seasonPlanning";

describe("coach season planning", () => {
  it("accepts 2–6 peak weeks and 2–6 training days and rejects values outside those ranges", () => {
    for (const weeks of [2, 3, 4, 5, 6]) for (const days of [2, 3, 4, 5, 6]) {
      const block = { ...defaultSeason("2026-10-19")[2], startDate: "2026-10-19", peakWeeks: weeks, daysPerWeek: days };
      expect(validateSeason([block], "")).toBeNull();
      expect(blockWeeks(block)).toBe(weeks);
    }
    const block = defaultSeason("2026-10-19")[2];
    expect(blockEnd({ ...block, startDate: "2026-10-19", peakWeeks: 6 })).toBe("2026-11-29");
    for (const peakWeeks of [1, 7, 2.5]) expect(seasonBlocksSchema.safeParse([{ ...block, peakWeeks }]).success).toBe(false);
    for (const daysPerWeek of [1, 7]) expect(validateSeason([{ ...block, daysPerWeek }], "")).not.toBeNull();
  });
  it("supports own blocks of 1–24 weeks without a generator template", () => {
    const block = { ...defaultSeason("2026-10-19")[0], templateId: "manual", manualWeeks: 6, daysPerWeek: 2 };
    expect(seasonBlocksSchema.safeParse([block]).success).toBe(true);
    expect(blockWeeks(block)).toBe(6);
    expect(blockEnd(block)).toBe("2026-11-29");
    expect(validateSeason([block], "2026-11-30")).toBeNull();
    expect(validateSeason([block], "2026-11-29")).toContain("tävlingsdatumet");
    for (const weeks of [0, 25, 2.5]) expect(seasonBlocksSchema.safeParse([{ ...block, manualWeeks: weeks }]).success).toBe(false);
  });
  it("reflows future blocks when own block length changes and preserves prepared programs", () => {
    const blocks = defaultSeason("2026-10-19");
    blocks[0] = { ...blocks[0], templateId: "manual", manualWeeks: 4 };
    blocks[2].mesocycleId = "22222222-2222-2222-2222-222222222222";
    const next = rescheduleFuture(blocks, blocks[0].id, { manualWeeks: 6 });
    expect(next[1].startDate).toBe("2026-11-30");
    expect(next[2].startDate).toBe(blocks[2].startDate);
    expect(blocks[0].manualWeeks).toBe(4);
    expect(blockWeeks({ ...blocks[0], manualWeeks: undefined })).toBe(4);
  });
  it("places the three blocks consecutively before the meet", () => {
    const blocks = defaultSeason("2026-10-19");
    expect(blocks.map((b) => b.startDate)).toEqual(["2026-10-19", "2026-11-16", "2026-12-14"]);
    expect(blockEnd(blocks[2])).toBe("2027-01-03");
    expect(validateSeason(blocks, "2027-01-04")).toBeNull();
  });
  it("rejects overlap with a competition or between blocks", () => {
    const blocks = defaultSeason("2026-10-19");
    expect(validateSeason(blocks, "2027-01-03")).toContain("tävlingsdatumet");
    blocks[1].startDate = blocks[0].startDate;
    expect(validateSeason(blocks, "")).toContain("överlapp");
  });
  it("reschedules after a template duration change without changing the input", () => {
    const blocks = defaultSeason("2026-10-19");
    const changed = blocks.map((b, i) => i === 0 ? { ...b, templateId: "peak-3w", daysPerWeek: 3 } : b);
    const result = scheduleBlocks(changed, "2026-10-19");
    expect(result[1].startDate).toBe("2026-11-09");
    expect(blocks[1].startDate).toBe("2026-11-16");
  });
  it("validates frequency for the selected template", () => {
    const blocks = defaultSeason("2026-10-19");
    blocks[2].templateId = "runner-strength";
    blocks[2].daysPerWeek = 3;
    expect(validateSeason(blocks, "")).toContain("träningsdagar");
  });
  it("rejects unsupported or unsafe saved generator settings", () => {
    expect(generatorSettingsSchema.safeParse({ tuning: { volume: 3, intensity: 0, accessory: 1, mainLifts: 1 } }).success).toBe(false);
    expect(generatorSettingsSchema.safeParse({ volumeDeltas: { squat: 1.5, bench: 0, deadlift: 0 } }).success).toBe(false);
    expect(generatorSettingsSchema.parse({}).volumeDeltas).toEqual({ squat: 0, bench: 0, deadlift: 0 });
  });
});