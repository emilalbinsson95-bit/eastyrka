import { describe, expect, it } from "vitest";
import { DEFAULT_STRATEGY, eakDecisionSchema, strategyFromRow, strategyValuesToRow } from "./eakStrategy";
import { summarizeEakDecisions, type DecisionRow } from "./eakDecisions";

describe("coachstyrd EAk-strategi", () => {
  it("tomma fält lagras som null och ändrar inte standard 5/10/104/106", () => {
    const row = strategyValuesToRow({});
    expect(row.fall_stage1_pct).toBeNull();
    expect(row.fall_stage2_pct).toBeNull();
    expect(DEFAULT_STRATEGY).toMatchObject({ fallStage1Pct: 5, fallStage2Pct: 10, pushLowPct: 104, pushHighPct: 106 });
  });
  it("coachens 7 procent kan sparas och läsas tillbaka", () => {
    expect(strategyFromRow(strategyValuesToRow({ fallStage1Pct: "7" })).fallStage1Pct).toBe(7);
  });
  it("beslut kräver uttryckligt ja eller nej, utan falskt standardval", () => {
    const decision = { evaluationId: "22222222-2222-2222-2222-222222222222", decision: "approved" };
    expect(eakDecisionSchema.safeParse(decision).success).toBe(false);
    expect(eakDecisionSchema.safeParse({ ...decision, planChanged: false }).success).toBe(true);
    expect(eakDecisionSchema.safeParse({ ...decision, planChanged: true }).success).toBe(true);
  });
});

describe("beskrivande beslutsöversikt", () => {
  const row = (overrides: Partial<DecisionRow> = {}): DecisionRow => ({ athlete_id: "alex", status: "red", coach_decision: "approved", plan_changed: true, outcome_dl_next: 4, created_at: "2026-10-01T00:00:00Z", ...overrides });
  it("begränsas till senaste 12 månader, inte framtida eller gröna utvärderingar", () => {
    const result = summarizeEakDecisions([row(), row({ created_at: "2025-10-26T06:25:00Z" }), row({ created_at: "2026-10-28T00:00:00Z" }), row({ status: "green" })], new Date("2026-10-27T06:25:00Z"));
    expect(result[0].count).toBe(1);
  });
  it("separerar atleter och status, okända svar/utfall ingår inte i medelvärden", () => {
    const result = summarizeEakDecisions([row(), row({ outcome_dl_next: 2 }), row({ coach_decision: "rejected", plan_changed: false, outcome_dl_next: -2 }), row({ status: "push", outcome_dl_next: 9 }), row({ plan_changed: null, outcome_dl_next: 20 }), row({ athlete_id: "other", outcome_dl_next: 100 })], new Date("2026-10-27T06:25:00Z"));
    expect(result[0].approvedPct).toBe(80);
    expect(result[0].changedPct).toBe(75);
    expect(result[0].outcomes[0]).toEqual({ status: "red", changed: { n: 2, mean: 3 }, unchanged: { n: 1, mean: -2 } });
    expect(result[0].outcomes[2].changed.mean).toBe(9);
    expect(result[1].outcomes[0].changed.mean).toBe(100);
  });
});