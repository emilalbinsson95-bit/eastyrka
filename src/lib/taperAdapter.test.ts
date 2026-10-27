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
describe("D0 peak for a bench-variant-heavy lifter (Vincent case)",()=>{
 const logs=[] as {date:string;exercise:string;variation:string|null;reps:number;weight_kg:number;rpe:number}[];
 for(let w=0;w<4;w++){
  const day=(o:number)=>format(addDays(parseISO("2026-10-26"),-(w*7+o)),"yyyy-MM-dd");
  for(let i=0;i<6;i++)logs.push({date:day(1),exercise:"Bench Press",variation:"Competition grip & pause",reps:3,weight_kg:135,rpe:8.5});
  for(let i=0;i<4;i++)logs.push({date:day(3),exercise:"Touch-and-go bench press",variation:null,reps:8,weight_kg:125,rpe:7});
  for(let i=0;i<5;i++)logs.push({date:day(4),exercise:"Close-Grip Bench",variation:null,reps:6,weight_kg:120,rpe:7});
  for(let i=0;i<4;i++)logs.push({date:day(2),exercise:"Squat",variation:null,reps:5,weight_kg:180,rpe:8});
  for(let i=0;i<3;i++)logs.push({date:day(5),exercise:"Conventional Deadlift",variation:null,reps:3,weight_kg:250,rpe:8});
  for(let i=0;i<3;i++)logs.push({date:day(3),exercise:"Face Pull",variation:null,reps:15,weight_kg:50,rpe:7});
 }
 const sum=summarizePeaking({today:"2026-10-27",startDate:"2026-10-30",logs,baselines:[{exercise:"Bench Press",one_rm_kg:155}]});
 it("never counts close-grip or touch-and-go as competition bench",()=>{
  expect(sum.lifts.bench.e1rm!).toBeLessThan(165);
  expect(sum.lifts.bench.exposuresPerWeek).toBeLessThanOrEqual(1.5);
  expect(sum.accessories.map(a=>a.exercise)).toContain("Close-Grip Bench");
 });
 it("fills every session before the final bench day and anchors days to the competition",()=>{
  const r=buildD0Weeks({start:"2026-10-30",end:"2026-11-13",competition:"2026-11-14",days:4,summary:sum,singles:true});
  expect(r.weeks.every(w=>w.sessions.length>0)).toBe(true);
  expect(r.weekStarts).toHaveLength(r.weeks.length);
  const sessions=r.weeks.flatMap(w=>w.sessions.map(s=>({date:(s.notes??"").match(/Datum: (\S+)/)![1],sets:s.exercises.reduce((n,e)=>n+e.target_sets,0),s})));
  for(const x of sessions.filter(x=>x.date<"2026-11-11")) expect(x.sets).toBeGreaterThanOrEqual(7);
  // Final bench exposure D−3, final deadlift D−7.
  const last=(name:string)=>sessions.filter(x=>x.s.exercises.some(e=>e.exercise===name)).map(x=>x.date).sort().pop();
  expect(last("Bench Press")).toBe("2026-11-11");
  expect(last("Conventional Deadlift")).toBe("2026-11-07");
  expect(r.warnings).toEqual([]);
 });
});
describe("D0 day placement",()=>{
 it("stores zero-based days within 0–6 that map back to the planned dates",()=>{
  const r=buildD0Weeks({start:"2026-10-30",end:"2026-11-13",competition:"2026-11-14",days:4,summary,singles:false});
  r.weeks.forEach((w,i)=>{
   expect(w.sessions[0].day_of_week).toBe(0);
   for(const s of w.sessions){
    expect(s.day_of_week).toBeGreaterThanOrEqual(0);expect(s.day_of_week).toBeLessThanOrEqual(6);
    expect(format(addDays(parseISO(r.weekStarts[i]),s.day_of_week),"yyyy-MM-dd")).toBe((s.notes??"").match(/Datum: (\S+)/)![1]);
   }
  });
 });
});
