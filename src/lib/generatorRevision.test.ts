import { describe, expect, it } from "vitest";
import { historyVolumeFactor, personalReadinessFactor } from "./individualisation";
import { compSetCap, applyVolumeGuards } from "./volumeGuards";
import { canAddExtraSet } from "./blockVolume";
import { volumeQualityFromDrop } from "./eakoefficient";
import type { TemplateWeek } from "./strengthTemplates";

describe("approved generator safeguards", () => {
  it("uses the continuous .85–1.30 history target with .60–1.35 factor limits", () => {
    expect(historyVolumeFactor(40,100).factor).toBe(1.35);
    expect(historyVolumeFactor(300,100)).toEqual({factor:.6,warning:true});
    expect(historyVolumeFactor(139,100).factor*139).toBeCloseTo(130);
    expect(historyVolumeFactor(141,100).factor*141).toBeCloseTo(130);
    let previous = 0;
    for(let template=1;template<=400;template++) {
      const output=template*historyVolumeFactor(template,100).factor;
      expect(output).toBeGreaterThanOrEqual(previous-1e-9); previous=output;
    }
  });
  it("uses 8/7/6 competition lift caps for 1/4/5 reps", () => {
    expect(compSetCap(1)).toBe(8); expect(compSetCap(4)).toBe(7); expect(compSetCap(5)).toBe(6);
  });
  it("keeps the 30-set ceiling in deload, taper, peak and runner strength", () => {
    for(const kind of ["deload","taper","peak","working"] as const) {
      const week: TemplateWeek={week_index:1,kind,label:"Löparstyrka",sessions:[{day_of_week:1,title:"Test",exercises:Array.from({length:40},()=>({exercise:"Row",target_sets:1,target_reps:5,intensity_metric:"rpe" as const,target_rpe:6}))}]};
      expect(applyVolumeGuards([week])[0]?.sessions[0]?.exercises.reduce((n,e)=>n+e.target_sets,0)).toBe(30);
    }
  });
  it("makes exactly 4 percent acceptable and exactly 5 percent fatigue limit", () => {
    expect(volumeQualityFromDrop(2,3.999)).toBe("optimal");
    expect(volumeQualityFromDrop(2,4)).toBe("acceptable");
    expect(volumeQualityFromDrop(2,5)).toBe("fatigue_limit");
  });
  it("never offers extra sets without coach permission or beyond 30 session sets", () => {
    const input={plannedSets:1,doneSets:[{reps:5,weight_kg:100,rpe:8,set_number:1}],targetRpe:8,isLightOrSingle:false};
    expect(canAddExtraSet(input).allowed).toBe(false);
    expect(canAddExtraSet({...input,coachEnabled:true,sessionSets:30}).allowed).toBe(false);
    expect(canAddExtraSet({...input,coachEnabled:true,sessionSets:1}).allowed).toBe(true);
  });
  it("constant personal readiness yields 1.0 regardless of response value", () => {
    for(const value of [2,4,8]) {
      const rows=Array.from({length:56},(_,i)=>({date:new Date(Date.UTC(2026,9,27-i)).toISOString().slice(0,10),fatigue:value,work_stress:value,life_stress:value,daily_form:value,sleep_hours:8}));
      expect(personalReadinessFactor(rows,"2026-10-27")).toBe(1);
    }
  });
});