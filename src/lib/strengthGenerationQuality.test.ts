import { describe, expect, it } from "vitest";
import { STRENGTH_TEMPLATES, volumeCategory } from "./strengthTemplates";
import { applyAdjustments, enforceTemplateFloors, DEFAULT_TUNING, type HistoryInputs } from "./individualisation";
import { applyOverload, DEFAULT_OVERLOAD } from "./overload";
import { applyDeadliftStyle, applyWeakPoints } from "./weakPoints";
import { applySetProtocols, DEFAULT_SET_PROTOCOLS } from "./setProtocols";
const history: HistoryInputs = { today: "2026-10-10", logs: [], readiness: [], baselines: [{ exercise: "Back squat", one_rm_kg: 200 }, { exercise: "Bench press", one_rm_kg: 140 }, { exercise: "Deadlift", one_rm_kg: 240 }], unavailability: [] };
describe("strength generation quality", () => {
  it("caps row, pulldown and overhead assistance under stacked volume increases", () => {
    for (const t of STRENGTH_TEMPLATES.filter(t => !t.skipVolumeFloors)) for (let days = t.minDays; days <= t.maxDays; days++) {
      const base = enforceTemplateFloors(t.buildWeeks(days));
      const out = applyAdjustments(base, [], history, { ...DEFAULT_TUNING, volume: 1.3, accessory: 1.5 });
      out.forEach((w, wi) => w.sessions.forEach((s, si) => s.exercises.forEach((e, ei) => {
        if (!["horizontal-pull", "vertical-pull", "vertical-press"].includes(volumeCategory(e))) return;
        const original = base[wi]?.sessions[si]?.exercises[ei]?.target_sets ?? 0;
        expect(e.target_sets).toBeLessThanOrEqual(Math.max(5, original));
      })));
    }
  });
  it("keeps days, finite prescriptions and competition lifts through combined modifiers", () => {
    for (const t of STRENGTH_TEMPLATES.filter(t => !t.skipVolumeFloors)) for (let days = t.minDays; days <= t.maxDays; days++) {
      const base = enforceTemplateFloors(t.buildWeeks(days));
      const adjusted = applyAdjustments(base, [{ id: "loads", kind: "loads", title: "Loads", reason: "Test", defaultOn: true, severity: "info", effect: "Test" }], history);
      const out = applySetProtocols(applyDeadliftStyle(applyWeakPoints(applyOverload(adjusted, { ...DEFAULT_OVERLOAD, waveLoading: true }), []), "conventional"), { ...DEFAULT_SET_PROTOCOLS, squat: "ramping", bench: "descending", deadlift: "rep-drops", accessories: "double" });
      out.forEach((w, wi) => {
        expect(w.sessions).toHaveLength(days);
        expect(new Set(w.sessions.map(s => s.day_of_week)).size).toBe(days);
        for (const s of w.sessions) for (const e of s.exercises) {
          expect(Number.isFinite(e.target_sets) && e.target_sets >= 1).toBe(true);
          expect(Number.isFinite(e.target_reps) && e.target_reps >= 1).toBe(true);
          if (e.target_weight_kg != null) expect(Number.isFinite(e.target_weight_kg) && e.target_weight_kg > 0).toBe(true);
        }
        const names = w.sessions.flatMap(s => s.exercises.map(e => e.exercise));
        const comp = base[wi]?.sessions.flatMap(s => s.exercises).filter(e => ["Back squat", "Bench press", "Deadlift"].includes(e.exercise)) ?? [];
        for (const e of comp) expect(names).toContain(e.exercise);
      });
    }
  });
});