import { describe, expect, it } from "vitest";
import { STRENGTH_TEMPLATES, volumeCategory } from "./strengthTemplates";
import { applyAdjustments, enforceTemplateFloors, DEFAULT_TUNING } from "./individualisation";
import { applyOverload, DEFAULT_OVERLOAD } from "./overload";
import { applyWeakPoints, applyDeadliftStyle } from "./weakPoints";
import { applyVolumeGuards, compSetCap } from "./volumeGuards";
const h = { today: "2026-10-10", logs: [], readiness: [], baselines: [], unavailability: [] } as any;
const tunings = [DEFAULT_TUNING, { ...DEFAULT_TUNING, volume: 1.3, mainLifts: 1.3, accessory: 1.5 }, { ...DEFAULT_TUNING, volume: 0.7, mainLifts: 0.7, accessory: 0.5 }];
const profiles = [{ squat: 1.4, bench: 1.4, deadlift: 1.4 }, { squat: 0.6, bench: 0.6, deadlift: 0.6 }];
describe("volume guards", () => {
  it("keeps every generated week realistic", () => {
    for (const t of STRENGTH_TEMPLATES.filter((t) => !t.skipVolumeFloors)) for (let d = t.minDays; d <= t.maxDays; d++) for (const tu of tunings) for (const p of profiles) {
      const w = applyVolumeGuards(applyDeadliftStyle(applyWeakPoints(applyOverload(applyAdjustments(enforceTemplateFloors(t.buildWeeks(d)), [], h, tu, p), { ...DEFAULT_OVERLOAD, waveLoading: true }), []), "conventional"));
      for (const wk of w) {
        if (/deload|taper|peak/i.test(wk.label)) continue;
        const cat: Record<string, number> = {};
        for (const s of wk.sessions) {
          expect(s.exercises.reduce((a, e) => a + e.target_sets, 0)).toBeLessThanOrEqual(30);
          for (const e of s.exercises) {
            if (/^(back squat|bench press|deadlift)$/i.test(e.exercise)) expect(e.target_sets).toBeLessThanOrEqual(compSetCap(e.target_reps));
            cat[volumeCategory(e)] = (cat[volumeCategory(e)] ?? 0) + e.target_sets;
          }
        }
        for (const k of ["squat", "horizontal-press", "hinge"]) if (cat[k]) { expect(cat[k]).toBeGreaterThanOrEqual(6); expect(cat[k]).toBeLessThanOrEqual(24); }
      }
    }
  });
});
