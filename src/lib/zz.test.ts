import { test } from "vitest";
import { applyWeakPoints, WEAK_POINTS } from "@/lib/weakPoints";
import { STRENGTH_TEMPLATES, volumeCategory } from "@/lib/strengthTemplates";
import { applyOverload } from "@/lib/overload";
test("scan",()=>{
 const issues=new Map<string,number>();const add=(k:string)=>issues.set(k,(issues.get(k)??0)+1);
 const ids=WEAK_POINTS.map(w=>w.id);let runs=0;
 for(const t of STRENGTH_TEMPLATES as any[]){ if(!t.buildWeeks) continue;
  for(let d=2;d<=6;d++){ let base:any[];try{base=t.buildWeeks(d)}catch{continue}
   const combos:string[][]=[[]];for(const a of ids)combos.push([a]);
   for(let i=0;i<ids.length;i+=3)combos.push(ids.slice(i,i+3));
   combos.push(["squat-bottom","squat-midrange","squat-bounce"],["bench-mid","bench-lockout","bench-elbows"],["dl-hinge","dl-hitch","dl-upper-back"]);
   for(const c of combos){runs++;let out:any[];try{out=applyWeakPoints(applyOverload?applyOverload(base,{} as any):base,c)}catch(e:any){add(`CRASH ${t.id} ${c} ${e.message}`);continue}
    for(const w of out){const dl=/deload|taper|meet/i.test(w.label);
     for(const s of w.sessions){const names=s.exercises.map((e:any)=>e.exercise.toLowerCase());
      const dup=names.filter((n:string,i:number)=>names.indexOf(n)!==i);if(dup.length)add(`DUP in session: ${dup[0]} [${c}] ${t.id}`);
      for(const e of s.exercises){ if(!volumeCategory(e))add(`NOCAT ${e.exercise}`); if(!(e.target_sets>0&&e.target_reps>0))add(`BADSETS ${e.exercise}`);
       if(dl&&/Weak point/.test(e.notes??"")&&!base.find((b:any)=>b.label===w.label)?.sessions.some((bs:any)=>bs.exercises.length===s.exercises.length))add(`DELOAD-ADD ${t.id}`);}
      if(s.exercises.length>9)add(`LONG session >9 ${t.id} d${d}`);}
     const bw=base.find((b:any)=>b.label===w.label);const cnt=(ws:any)=>ws.sessions.reduce((a:number,s:any)=>a+s.exercises.length,0);
     if(dl&&bw&&cnt(w)>cnt(bw))add(`DELOAD grew ${t.id}`);
     for(const lift of ["back squat","bench press","deadlift"]){const had=bw?.sessions.some((s:any)=>s.exercises.some((e:any)=>e.exercise.toLowerCase()===lift));const has=w.sessions.some((s:any)=>s.exercises.some((e:any)=>e.exercise.toLowerCase()===lift));if(had&&!has)add(`LOST comp ${lift} ${t.id} [${c}]`);}
    }}}}
 console.log("RUNS",runs);for(const [k,v] of issues)console.log("ISSUE",v,k);
});
