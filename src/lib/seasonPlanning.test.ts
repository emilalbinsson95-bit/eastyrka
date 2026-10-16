import { describe, expect, it } from "vitest";
import { blockEnd, defaultSeason, generatorSettingsSchema, scheduleBlocks, validateSeason } from "./seasonPlanning";

describe("coach season planning", () => {
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
    blocks[2].daysPerWeek = 6;
    expect(validateSeason(blocks, "")).toContain("träningsdagar");
  });
  it("rejects unsupported or unsafe saved generator settings", () => {
    expect(generatorSettingsSchema.safeParse({ tuning: { volume: 3, intensity: 0, accessory: 1, mainLifts: 1 } }).success).toBe(false);
    expect(generatorSettingsSchema.safeParse({ volumeDeltas: { squat: 1.5, bench: 0, deadlift: 0 } }).success).toBe(false);
    expect(generatorSettingsSchema.parse({}).volumeDeltas).toEqual({ squat: 0, bench: 0, deadlift: 0 });
  });
});