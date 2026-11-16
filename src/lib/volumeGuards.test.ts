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

describe("volymvakter räknar bara hårda set (procentrader)", () => {
  const row = (exercise: string, sets: number, reps: number, extra: Record<string, unknown> = {}) =>
    ({ exercise, target_sets: sets, target_reps: reps, target_rpe: 8, intensity_metric: "rpe", ...extra }) as any;
  const week = (sessions: any[][]) => [{ week_index: 1, label: "V1", kind: "working", sessions: sessions.map((exercises, i) => ({ day_of_week: i + 1, title: `P${i}`, exercises })) }] as any;
  const benchSets = (w: any) => w[0].sessions.flatMap((s: any) => s.exercises).filter((e: any) => volumeCategory(e) === "horizontal-press" && e.target_pct == null).reduce((a: number, e: any) => a + e.target_sets, 0);

  it("6 × 10 @ 58 % i bänk räknas inte mot bänkens 24 set", () => {
    const light = row("Bench press", 6, 10, { target_pct: 58, target_rpe: undefined });
    const out = applyVolumeGuards(week([
      [row("Bench press", 6, 5), light],
      [row("Bench press", 6, 5), row("Close-grip bench press", 6, 6)],
      [row("Bench press", 6, 5), row("Close-grip bench press", 6, 6)],
    ]));
    expect(benchSets(out)).toBe(24); // 30 hårda set kapade till 24
    const pctRow = out[0].sessions[0].exercises.find((e: any) => e.target_pct === 58);
    expect(pctRow?.target_sets).toBe(6);
  });
  it("men räknas i passets 30 set", () => {
    const light = row("Bench press", 10, 10, { target_pct: 58, target_rpe: undefined });
    const out = applyVolumeGuards(week([[row("Back squat", 6, 5), light, row("Leg press", 8, 10), row("Lat pulldown", 8, 10)]]));
    expect(out[0].sessions[0].exercises.reduce((a: number, e: any) => a + e.target_sets, 0)).toBe(30);
    expect(out[0].sessions[0].exercises.find((e: any) => e.target_pct === 58)?.target_sets).toBe(10);
  });
  it("en tung procentrad räknas som hårda set och kapas som vanligt", () => {
    const heavy = row("Bench press", 10, 5, { target_pct: 80, target_rpe: undefined });
    const out = applyVolumeGuards(week([[heavy]]));
    expect(out[0].sessions[0].exercises[0].target_sets).toBe(compSetCap(5));
  });
});
