import { describe, it, expect } from "vitest";
import { applyPushProgression, decidePush, pushLift, PUSH_STEPS } from "./pushProgression";
import { prescribedWeightKg } from "./intensity";
import type { TemplateWeek } from "./strengthTemplates";

const sets = Array.from({length:4},()=>({confirmed:true,prescribedReps:5,prescribedKg:145,reps:5,kg:145}));
const base = {plan:180,start:180,step:1.5,misses:0,sets,expectedSets:4};
describe("coach-enabled load progression",()=>{
 it("pushes squat 1.5% without raising the EAk baseline",()=>{expect(decidePush(base)).toMatchObject({decision:"push",after:182.7,misses:0});expect(base.plan).toBe(180);});
 it("uses bench 1.25% and deadlift 2% defaults",()=>{expect(PUSH_STEPS).toEqual({squat:1.5,bench:1.25,conventional:2,sumo:2});});
 it("keeps 145 kg after the first rounded push instead of forcing an increase",()=>{expect(prescribedWeightKg({oneRmKg:180,reps:5,metric:"rpe",rpe:7.5})).toBe(145);expect(prescribedWeightKg({oneRmKg:182.7,reps:5,metric:"rpe",rpe:7.5})).toBe(145);});
 it("records one miss for fewer reps",()=>expect(decidePush({...base,sets:[{...sets[0],reps:4},...sets.slice(1)]})).toMatchObject({decision:"miss",after:180,misses:1}));
 it("resets current planetta by 5% after a second miss",()=>expect(decidePush({...base,misses:1,sets:[{...sets[0],reps:4},...sets.slice(1)]})).toMatchObject({decision:"reset",after:171,misses:0}));
 it("skips unconfirmed sets",()=>expect(decidePush({...base,sets:sets.slice(2)}).decision).toBe("skip"));
 it("skips athlete-changed loading",()=>expect(decidePush({...base,sets:[{...sets[0],kg:140},...sets.slice(1)]}).decision).toBe("skip"));
 it("holds a protocol reduction",()=>expect(decidePush({...base,protocolReduced:true}).decision).toBe("hold"));
 it.each(["deload","ramp"])("does not decide during %s",phase=>expect(decidePush({...base,phase}).decision).toBe("none"));
 it.each(["peak","taper"])("freezes during %s",phase=>expect(decidePush({...base,phase}).decision).toBe("paused"));
 it("holds EAk 90",()=>expect(decidePush({...base,eak:90}).decision).toBe("hold"));
 it("EAk 92 does not block success",()=>expect(decidePush({...base,eak:92}).decision).toBe("push"));
 it("blocks a second decision within four days",()=>expect(decidePush({...base,cooldownDays:4}).decision).toBe("none"));
 it("does not cross the 6% block cap",()=>expect(decidePush({...base,plan:189}).decision).toBe("hold"));
 it("counts explicitly fatigue-stopped main work as a miss",()=>expect(decidePush({...base,fatigueStopped:true,sets:[]}).decision).toBe("miss"));
 it("keeps true variants out and does not merge deadlift stances",()=>{expect(pushLift("Conventional Deadlift / Competition stance")).toBe("conventional");expect(pushLift("Sumo Deadlift")).toBe("sumo");expect(pushLift("Deadlift")).toBeNull();expect(pushLift("Pause squat")).toBeNull();});
 it("keeps guarded volume, fixed work and one decision exposure per week",()=>{
  const weeks: TemplateWeek[] = [7,8,8.5].map((rpe,i)=>({week_index:i+1,label:"Work",kind:"working",sessions:[{day_of_week:1,title:"Main",exercises:[{exercise:"Squat",target_sets:3,target_reps:5,target_rpe:rpe,intensity_metric:"rpe"}]},{day_of_week:4,title:"Other",exercises:[{exercise:"Squat",target_sets:2,target_reps:3,target_rpe:rpe,intensity_metric:"rpe"}]}]}));
  const next=applyPushProgression(weeks,[{lift:"squat",enabled:true,plan_e1rm:180,step_pct:1.5,rounding_kg:2.5,main_sets:4,main_reps:5,main_rpe:7.5}]);
  expect(next.map(w=>w.sessions[0].exercises[0].target_sets)).toEqual([3,3,3]);expect(next.map(w=>w.sessions[0].exercises[0].target_rpe)).toEqual([7.5,7.5,7.5]);expect(next.flatMap(w=>w.sessions.flatMap(s=>s.exercises)).reduce((n,e)=>n+e.target_sets,0)).toBe(15);
 });
});