import { describe, expect, it } from "vitest";
import { applySetProtocols, DEFAULT_SET_PROTOCOLS, protocolSets, SET_PROTOCOLS, protocolGroup } from "./setProtocols";
import { STRENGTH_TEMPLATES, type TemplateExercise, type TemplateWeek } from "./strengthTemplates";
const exercise: TemplateExercise = { exercise: "Back squat", target_sets: 4, target_reps: 5, target_rpe: 8, target_weight_kg: 100, intensity_metric: "rpe", notes: "Brace before each rep. Last set to failure.", last_set_to_failure: true };
const week: TemplateWeek = { week_index: 1, label: "Build", sessions: [{ day_of_week: 1, title: "Squat", exercises: [exercise] }] };
describe("coach-selected set protocols", () => {
  it("leaves default prescriptions untouched", () => expect(applySetProtocols([week], DEFAULT_SET_PROTOCOLS)[0]?.sessions[0]?.exercises[0]).toEqual(exercise));
  it("preserves every template's exercise and set budgets at every supported frequency", () => {
    for (const template of STRENGTH_TEMPLATES) for (let days = template.minDays; days <= template.maxDays; days++) for (const protocol of SET_PROTOCOLS) {
      const weeks = template.buildWeeks(days);
      const result = applySetProtocols(weeks, { squat: protocol.id, bench: protocol.id, deadlift: protocol.id, accessories: protocol.id });
      expect(result.map(w => w.sessions.map(s => s.exercises.map(e => [e.exercise, e.variation, e.target_sets])))).toEqual(weeks.map(w => w.sessions.map(s => s.exercises.map(e => [e.exercise, e.variation, e.target_sets]))));
    }
  });
  it("skips deloads, taper and explosive or 1.5-rep work", () => {
    for (const label of ["Deload", "Taper", "Peak"]) expect(applySetProtocols([{ ...week, label }], { ...DEFAULT_SET_PROTOCOLS, squat: "ramping" })[0]).toEqual({ ...week, label });
    for (const name of ["1.5-rep squat", "Power clean", "Box jump", "Snatch"]) expect(protocolGroup({ ...exercise, exercise: name })).toBeNull();
  });
  it("ramps weight with RPE and preserves first-set prescription", () => {
    const sets = protocolSets(exercise, "ramping");
    expect(sets.map(s => s.rpe)).toEqual([6.5, 7, 7.5, 8]);
    expect(sets[0]?.weight).toBeLessThan(sets[3]?.weight ?? 0);
    expect(sets[3]?.weight).toBe(100);
  });
  it("reduces reps while increasing load without forcing singles", () => {
    const sets = protocolSets(exercise, "descending");
    expect(sets.map(s => s.reps)).toEqual([5, 4, 3, 2]);
    expect(sets[3]?.weight).toBeGreaterThan(sets[0]?.weight ?? 0);
  });
  it("does not invent weights when a weak-point swap cleared the load", () => {
    for (const p of SET_PROTOCOLS) expect(protocolSets({ ...exercise, exercise: "Front squat", target_weight_kg: undefined }, p.id).every(s => s.weight == null)).toBe(true);
  });
  it("keeps heavy rep-drop prescriptions intact", () => {
    const heavy = { ...exercise, target_reps: 2, target_rpe: 9 };
    const result = applySetProtocols([{ ...week, sessions: [{ ...week.sessions[0], day_of_week: 1, title: "Heavy", exercises: [heavy] }] }], { ...DEFAULT_SET_PROTOCOLS, squat: "rep-drops" });
    expect(result[0]?.sessions[0]?.exercises[0]).toEqual(heavy);
  });
  it("writes actionable notes and removes contradictory failure directives", () => {
    const e = applySetProtocols([week], { ...DEFAULT_SET_PROTOCOLS, squat: "double" })[0]?.sessions[0]?.exercises[0];
    expect(e?.notes).toContain("4 set × 5–9 reps");
    expect(e?.notes).toContain("Brace before each rep.");
    expect(e?.notes).not.toContain("Last set to failure");
    expect(e?.last_set_to_failure).toBe(false);
  });
  it("uses 70 percent of the same exercise estimate for metabolic backoffs", () => {
    const sets = protocolSets(exercise, "metabolic");
    expect(sets[0]?.weight).toBe(100);
    expect(sets[1]?.weight).toBe(87.5);
  });
  it("limits metabolic backoff reps instead of prescribing high reps at 70 percent", () => {
    expect(protocolSets({ ...exercise, target_reps: 12 }, "metabolic").slice(1).every(s => s.reps <= 5)).toBe(true);
  });
  it("does not pre-schedule unearned double-progression increases", () => {
    const later: TemplateWeek = { ...week, week_index: 2, sessions: [{ ...week.sessions[0], day_of_week: 1, title: "Squat", exercises: [{ ...exercise, target_reps: 8, target_weight_kg: 120 }] }] };
    const result = applySetProtocols([week, later], { ...DEFAULT_SET_PROTOCOLS, squat: "double" });
    expect(result[1]?.sessions[0]?.exercises[0]?.target_weight_kg).toBe(100);
    expect(result[1]?.sessions[0]?.exercises[0]?.target_reps).toBe(5);
  });
  it("keeps metabolic backoffs lighter even for high-rep top sets", () => {
    for (const reps of [3, 5, 8, 10, 12, 15]) {
      const sets = protocolSets({ ...exercise, target_reps: reps }, "metabolic");
      expect(sets.slice(1).every(s => s.weight == null || s.weight <= 90)).toBe(true);
    }
  });
  it("gives main lifts enough rest rather than an accessory rest target", () => {
    const out = applySetProtocols([week], { ...DEFAULT_SET_PROTOCOLS, squat: "metabolic" });
    expect(out[0]?.sessions[0]?.exercises[0]?.notes).toContain("3–5 minuter");
  });
  it("preserves genuinely easy work rather than creating a flat ramp", () => {
    const easy = { ...exercise, target_rpe: 6 };
    const out = applySetProtocols([{ ...week, sessions: [{ day_of_week: 1, title: "Easy", exercises: [easy] }] }], { ...DEFAULT_SET_PROTOCOLS, squat: "ramping" });
    expect(out[0]?.sessions[0]?.exercises[0]).toEqual(easy);
  });
});