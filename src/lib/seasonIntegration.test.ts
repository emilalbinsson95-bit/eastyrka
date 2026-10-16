import { describe, it, expect } from "vitest";
import { defaultSeason, rescheduleFuture, validateSeason, blockEnd } from "./seasonPlanning";
import { buildPeakingWeeks, peakE1rm } from "./peaking";
import { dailyE1RM } from "./eakoefficient";
import { applyCoachSingles } from "./coachSingles";
import { getTemplate } from "./strengthTemplates";
import { compareStrength } from "./strengthComparison";
describe("integrated flexible season", () => {
  it("permits pauses and moves future blocks without changing prepared programs", () => {
    const blocks = defaultSeason("2026-10-19");
    blocks[0].mesocycleId = "22222222-2222-2222-2222-222222222222";
    const shifted = rescheduleFuture(blocks, "strength", { startDate: "2026-11-23" });
    expect(shifted[0]).toEqual(blocks[0]);
    expect(shifted[2].startDate).toBe("2026-12-21");
    expect(validateSeason(shifted, "2027-01-12")).toBeNull();
    expect(rescheduleFuture(blocks, "volume", { startDate: "2026-10-26" })).toEqual(blocks);
  });
  it("does not silently move a prepared later block", () => {
    const blocks = defaultSeason("2026-10-19");
    blocks[2].mesocycleId = "22222222-2222-2222-2222-222222222222";
    const shifted = rescheduleFuture(blocks, "strength", { startDate: "2026-11-23" });
    expect(shifted[2]).toEqual(blocks[2]);
    expect(validateSeason(shifted, "2027-02-01")).toContain("överlapp");
  });
  it("validates real dates and honors peak duration", () => {
    const blocks = defaultSeason("2026-10-19");
    blocks[2].peakWeeks = 2;
    expect(blockEnd(blocks[2])).toBe("2026-12-27");
    blocks[0].startDate = "2026-02-30";
    expect(validateSeason(blocks, "")).toContain("startdatumet");
  });
  it.each([2,3,4])("builds %i peak weeks ending in two taper sessions", (weeks) => {
    const result = buildPeakingWeeks(4, null, { weeks });
    expect(result).toHaveLength(weeks);
    expect(result.at(-1)?.sessions).toHaveLength(2);
    expect(result.map((w) => w.week_index)).toEqual(Array.from({ length: weeks }, (_, i) => i+1));
    for (const w of result) for (const s of w.sessions) expect(s.exercises.reduce((a,e) => a+e.target_sets,0)).toBeLessThanOrEqual(30);
    expect(peakE1rm(150,5,8)).toBe(dailyE1RM({ weight_kg:150, reps:5,rpe:8 }));
  });
  it("replaces volume for coach singles, leaves deloads and excluded templates alone", () => {
    const base = getTemplate("standard-pl")?.buildWeeks(4) ?? [];
    const opts = { enabled:true, rpe:9.5, weeks:[1,2,3,4] };
    const result = applyCoachSingles(base, opts);
    const sets = (weeks: typeof base) => weeks.reduce((a,w) => a+w.sessions.reduce((x,s) => x+s.exercises.reduce((z,e) => z+e.target_sets,0),0),0);
    expect(sets(result)).toBeLessThan(sets(base));
    expect(result[0].sessions.flatMap((s)=>s.exercises).some((e)=>e.target_reps===1 && e.target_rpe===9.5)).toBe(true);
    expect(result.at(-1)).toEqual(base.at(-1));
    expect(applyCoachSingles(base,opts,true)).toBe(base);
    expect(base[0].sessions[0].exercises[0].target_reps).not.toBe(1);
  });
  it("compares six equivalent measurement sets without using late singles or variants", () => {
    const logs = Array.from({length:6},(_,i)=>({date:`2026-10-${String(i+1).padStart(2,"0")}`,exercise:"Squat", variation:null, set_number:1, reps:5, rpe:8, weight_kg:i<3?100:105}));
    const result = compareStrength([...logs,{...logs[5],set_number:2,reps:1,weight_kg:180},{...logs[5], variation:"Pause",weight_kg:80}],"2026-10-16");
    const squat = result.find((r)=>!r.variation);
    expect(squat?.count).toBe(6);
    expect((squat?.recent ?? 0)/(squat?.prev ?? 1)).toBeCloseTo(1.05);
    expect(result.find((r)=>r.variation === "Pause")?.prev).toBeNull();
  });
});