import { it, expect } from "vitest";
import { evaluateBlock, applyBlockVolume, canAddExtraSet } from "./src/lib/blockVolume";
import { STRENGTH_TEMPLATES, volumeCategory } from "./src/lib/strengthTemplates";
import { enforceTemplateFloors } from "./src/lib/individualisation";
import { applyVolumeGuards } from "./src/lib/volumeGuards";
function logs(drop: number, trend: number, n = 8) {
  const out: any[] = [];
  for (let i = 0; i < n; i++) {
    const d = `2026-10-${String(1 + i * 3).padStart(2, "0")}`;
    const w = 120 * (1 + trend * i);
    out.push({ date: d, exercise: "Back squat", reps: 5, weight_kg: w, rpe: 8, set_number: 1 });
    out.push({ date: d, exercise: "Back squat", reps: 5, weight_kg: w, rpe: 8 + drop, set_number: 2 });
  }
  return out;
}
it("block rounds", () => {
  const bl = { "Back squat": 148 };
  const r: string[] = [];
  for (const [name, l] of [["bra", logs(0, 0.003)], ["trött", logs(1, -0.01)], ["mitten", logs(0.5, 0)], ["tomt", []]] as const) {
    for (const tol of ["low", "normal", "high"] as const) {
      const e = evaluateBlock(l as any, bl, tol, "2026-10-28").find((x) => x.lift === "squat")!;
      r.push(`${name}/${tol}: ${e.delta} (${e.source})`);
    }
  }
  console.log(r.join("\n"));
  let issues = 0;
  for (const t of STRENGTH_TEMPLATES.filter((t) => !t.skipVolumeFloors)) for (let d = t.minDays; d <= t.maxDays; d++) for (const delta of [-1, 1] as const) {
    const evals = (["squat", "bench", "deadlift"] as const).map((lift) => ({ lift, delta, sessions: 8, source: "data" as const, reason: "" }));
    const w = applyVolumeGuards(applyBlockVolume(enforceTemplateFloors(t.buildWeeks(d)), evals, 20).weeks);
    for (const wk of w) { if (/deload|taper|peak/i.test(wk.label)) continue;
      for (const s of wk.sessions) { const tot = s.exercises.reduce((a, e) => a + e.target_sets, 0); if (tot > 30 || s.exercises.some((e) => e.target_sets < 1)) issues++; }
      for (const c of ["squat", "horizontal-press", "hinge"]) { const sum = wk.sessions.flatMap((s) => s.exercises).filter((e) => volumeCategory(e) === c).reduce((a, e) => a + e.target_sets, 0); if (sum && (sum > 24 || sum < 6)) { issues++; console.log(t.id, d, delta, wk.label, c, sum); } }
    }
  }
  console.log("issues", issues);
  console.log(canAddExtraSet({ plannedSets: 3, doneSets: [1,2,3].map((n) => ({ set_number: n, reps: 5, weight_kg: 120, rpe: 8 + (n === 3 ? 1.5 : 0) })), targetRpe: 8, isLightOrSingle: false }));
  expect(issues).toBe(0);
});
