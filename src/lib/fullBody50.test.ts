import { describe, expect, it } from "vitest";
import { getTemplate, volumeCategory } from "./strengthTemplates";
import { applySessionSetBudget } from "./sessionSetBudget";
import { applyDeadliftStyle } from "./weakPoints";
import { applyAdjustments, DEFAULT_TUNING } from "./individualisation";
import { applySetProtocols, SET_PROTOCOLS } from "./setProtocols";

describe("two-day full-body template", () => {
  const template = getTemplate("full-body-50");
  if (!template) throw new Error("Full-body template missing");
  const base = template.buildWeeks(2);
  it("has two balanced sessions with 12 working sets and a reduced deload", () => {
    expect(template.minDays).toBe(2);
    expect(template.maxDays).toBe(2);
    expect(base).toHaveLength(4);
    for (const week of base) {
      expect(week.sessions.map(s => s.day_of_week)).toEqual([1, 4]);
      for (const session of week.sessions) {
        expect(session.exercises).toHaveLength(5);
        expect(session.exercises.reduce((a, e) => a + e.target_sets, 0)).toBe(week.week_index === 4 ? 7 : 12);
        const categories = session.exercises.map(volumeCategory);
        expect(categories.some(c => ["squat", "hinge", "quads"].includes(c))).toBe(true);
        expect(categories.some(c => c.includes("press"))).toBe(true);
        expect(categories.some(c => c.includes("pull"))).toBe(true);
        expect(session.exercises.every(e => (e.target_rpe ?? 10) <= 8 && !e.last_set_to_failure)).toBe(true);
      }
    }
  });
  it("does not inflate sets with high athlete preferences or coach tuning", () => {
    const adjusted = applyAdjustments(base, [], {today: "2026-10-16", logs: [], readiness: [], baselines: [], unavailability: []},
      {...DEFAULT_TUNING, volume: 1.3, mainLifts: 1.3, accessory: 1.5}, {squat: 1.4, bench: 1.4, deadlift: 1.4}, {skipFloors: true});
    const bounded = applySessionSetBudget(adjusted, base, 12);
    for (const [wi, week] of bounded.entries()) for (const [si, session] of week.sessions.entries()) {
      expect(session.exercises.map(e => e.target_sets)).toEqual(base[wi]?.sessions[si]?.exercises.map(e => e.target_sets));
    }
  });
  it("preserves coach-selected protocols and competition deadlift style", () => {
    for (const protocol of SET_PROTOCOLS) {
      const result = applySetProtocols(applyDeadliftStyle(applySessionSetBudget(base, base, 12), "sumo"),
        {squat: protocol.id, bench: protocol.id, deadlift: protocol.id, accessories: protocol.id});
      expect(result[0]?.sessions[1]?.exercises[0]?.exercise).toBe("Sumo deadlift");
      for (const week of result) for (const session of week.sessions) expect(session.exercises.reduce((a, e) => a + e.target_sets, 0)).toBeLessThanOrEqual(12);
    }
  });
  it("retains reductions instead of filling sets back up", () => {
    const reduced = base.map(w => ({...w, sessions: w.sessions.map(s => ({...s, exercises: s.exercises.map(e => ({...e, target_sets: 1}))}))}));
    expect(applySessionSetBudget(reduced, base, 12)[0]?.sessions[0]?.exercises.every(e => e.target_sets === 1)).toBe(true);
  });
});