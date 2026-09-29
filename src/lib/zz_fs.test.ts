import { test } from "vitest";
import { STRENGTH_TEMPLATES } from "@/lib/strengthTemplates";
import { applyWeakPoints } from "@/lib/weakPoints";
test("x", () => {
  for (const t of STRENGTH_TEMPLATES as any[]) { if (t.id==="peak-3w") continue;
    for (const d of [2,3,4,5]) { let weeks; try { weeks = t.buildWeeks(d); } catch { continue; } if(!weeks) continue;
      const out = applyWeakPoints(weeks, ["squat-hips-up","dl-hips-up"]);
      const w=out[0]; const c = w.sessions.map((s:any)=>s.exercises.filter((e:any)=>/front squat/i.test(e.exercise)).map((e:any)=>e.target_sets).join("+")).join(" | ");
      console.log(t.id,d,c);
    }}
});
