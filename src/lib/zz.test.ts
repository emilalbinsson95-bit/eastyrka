import { test } from "vitest";
import { applyWeakPoints, WEAK_POINTS, sessionCap } from "@/lib/weakPoints";
import { STRENGTH_TEMPLATES } from "@/lib/strengthTemplates";
import { applyOverload, DEFAULT_OVERLOAD } from "@/lib/overload";
test("x",()=>{const iss=new Map<string,number>();const add=(k:string)=>iss.set(k,(iss.get(k)??0)+1);let runs=0,maxN=0;
const ids=WEAK_POINTS.map(w=>w.id);const combos:string[][]=[];for(const a of ids)combos.push([a]);
const by=(l:string)=>WEAK_POINTS.filter(w=>w.lift===l).map(w=>w.id);for(const a of by("squat"))for(const b of by("bench"))combos.push([a,b,by("deadlift")[(a.length+b.length)%by("deadlift").length]]);
for(const OV of [DEFAULT_OVERLOAD,{overWarmSingles:true,deadliftStance:"sumo",waveLoading:true,benchConsolidation:true}] as any[])
for(const t of STRENGTH_TEMPLATES as any[]){if(t.id==="peak-3w")continue;for(let d=2;d<=6;d++){let b:any[];try{b=applyOverload(t.buildWeeks(d),OV)}catch{continue}
for(const c of combos){runs++;const out=applyWeakPoints(b,c);out.forEach((w:any,wi:number)=>{const bw=b[wi];const cap=sessionCap(w.sessions.length);
w.sessions.forEach((s:any,si:number)=>{const n=s.exercises.filter((e:any)=>!/over-warm/i.test(e.variation??"")).length;const bn=bw.sessions[si].exercises.filter((e:any)=>!/over-warm/i.test(e.variation??"")).length;maxN=Math.max(maxN,n);if(n>Math.max(cap,bn))add(`OVERCAP ${t.id} d${d}`);
const names=s.exercises.map((e:any)=>e.exercise.toLowerCase()+"|"+(e.variation??""));if(new Set(names).size!==names.length)add(`DUP ${t.id}`);
for(const e of bw.sessions[si].exercises)if(/^(back squat|bench press|deadlift)$/i.test(e.exercise)&&!s.exercises.some((x:any)=>x.exercise===e.exercise&&x.variation===e.variation))add(`LOST ${e.exercise}(${e.variation}) ${t.id}`);});
if(/deload/i.test(w.label)&&w.sessions.flatMap((s:any)=>s.exercises).length>bw.sessions.flatMap((s:any)=>s.exercises).length)add("DELOAD GREW");});}}}
console.log("RUNS",runs,"MAX",maxN);for(const [k,v] of iss)console.log("ISSUE",v,k);});
