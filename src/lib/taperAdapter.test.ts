import { describe,expect,it } from "vitest";
import { buildD0Weeks } from "./taperAdapter";
import { summarizePeaking } from "./peaking";
import { addDays,format,parseISO } from "date-fns";

const summary=summarizePeaking({today:"2026-10-27",logs:Array.from({length:21},(_,i)=>({date:format(addDays(parseISO("2026-10-26"),-i),"yyyy-MM-dd"),exercise:"Back squat",variation:null,reps:5,weight_kg:100,rpe:8})),baselines:[{exercise:"Back squat",one_rm_kg:125}]});
describe("D0 generation adapter",()=>{
 it("returns a validation warning instead of crashing while date inputs are empty",()=>{
  expect(buildD0Weeks({start:"2027-01-01",end:"2027-01-22",competition:"",days:4,summary,singles:false}).weeks).toEqual([]);
 });
 it("allows every 2–6 day and 2–6 week combination with dates before competition",()=>{
  for(let days=2;days<=6;days++)for(let weeks=2;weeks<=6;weeks++){
   const end="2027-01-22",start=format(addDays(parseISO("2027-01-23"),-weeks*7),"yyyy-MM-dd");
   const result=buildD0Weeks({start,end,competition:"2027-01-23",days,summary,singles:false});
   expect(result.weeks.length).toBe(weeks);
   const exercises=result.weeks.flatMap(w=>w.sessions.flatMap(s=>s.exercises));
   expect(exercises.length).toBeGreaterThan(0);
   expect(exercises.every(e=>e.target_reps>=2)).toBe(true);
   expect(result.weeks.flatMap(w=>w.sessions).every(s=>(s.notes??"").includes("Datum:"))).toBe(true);
  }
 });
 it("preserves non-whole-week periods and marks technique work",()=>{
  const result=buildD0Weeks({start:"2026-12-30",end:"2027-01-22",competition:"2027-01-23",days:4,summary,singles:false});
  expect(result.weeks).toHaveLength(4);
  expect(result.weeks.flatMap(w=>w.sessions.flatMap(s=>s.exercises)).some(e=>e.variation==="Teknikpass – ej EAk")).toBe(true);
 });
});