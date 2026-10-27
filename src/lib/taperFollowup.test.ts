import { it, expect } from "vitest";
import { competitionEAk, dMinus21, frozenPeakBaseline } from "./taperFollowup";
it("freezes against D-21 rather than later baseline decisions",()=>{
  expect(dMinus21("2026-11-14")).toBe("2026-10-24");
  expect(frozenPeakBaseline("2026-11-14",{"Bench press":170},[{exercise:"Bench press",one_rm_kg:150,recorded_at:"2026-10-01"},{exercise:"Bench press",one_rm_kg:170,recorded_at:"2026-11-01"}])).toEqual({"Bench press":150});
});
it("never invents a pre-decision baseline",()=>expect(frozenPeakBaseline("2026-11-14",{"Bench press":170},[{exercise:"Bench press",one_rm_kg:170,recorded_at:"2026-11-01"}])).toEqual({}));
it("competition EAk only uses successful attempts",()=>{
  expect(competitionEAk({bench:[{kg:160,success:true},{kg:180,success:false}]},{"Bench press":150},{bench:"Bench press"}).find(r=>r.lift==="bench")).toEqual({lift:"bench",best:160,eak:160/150*100});
});