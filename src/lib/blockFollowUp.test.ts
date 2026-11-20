import { describe, expect, it } from "vitest";
import { findPlanOverlaps, type OverlapWeekInput } from "./planOverlaps";
import { prePublishChecks, type CheckWeek } from "./publishCheck";
import { matchSessions, reviewBlocks, stallFindings, verdictOf, type BlockReview, type ReviewLog, type ReviewWeek } from "./blockReview";

const ow = (id: string, name: string, start: string, status: string, days: number[]): OverlapWeekInput => ({
  mesocycle_id: id, mesocycle_name: name, status, week_start_date: start,
  sessions: days.map((d) => ({ day_of_week: d, title: `Day ${d}`, exerciseCount: 3 })),
});

describe("överlappande planer", () => {
  it("flags two published blocks with sessions in the same period", () => {
    const res = findPlanOverlaps([ow("a", "Styrkeblock", "2026-11-02", "published", [1, 3, 5]), ow("b", "Volymblock bänk", "2026-11-04", "published", [1, 3])]);
    expect(res).toHaveLength(1);
    expect(res[0]!.bothPublished).toBe(true);
    expect(res[0]!.from).toBe("2026-11-04");
    expect(res[0]!.to).toBe("2026-11-06");
  });
  it("does not flag a peak that starts the day after the block's last session", () => {
    expect(findPlanOverlaps([ow("a", "Block", "2026-11-02", "published", [1, 3, 5]), ow("b", "Toppning", "2026-11-07", "published", [1, 3])])).toHaveLength(0);
  });
  it("ignores draft-only overlaps unless asked", () => {
    const weeks = [ow("a", "A", "2026-11-02", "draft", [1, 3]), ow("b", "B", "2026-11-02", "draft", [2])];
    expect(findPlanOverlaps(weeks)).toHaveLength(0);
    expect(findPlanOverlaps(weeks, { includeDraftOnly: true })).toHaveLength(1);
  });
});

const ex = (exercise: string, sets: number, reps: number, rpe: number | null, kg: number | null, extra: Record<string, unknown> = {}) => ({
  exercise, target_sets: sets, target_reps: reps, target_rpe: rpe, target_weight_kg: kg, ...extra,
});
const week = (start: string, sessions: Array<{ day: number; ex: ReturnType<typeof ex>[] }>, extra: Partial<CheckWeek> = {}): CheckWeek => ({
  week_start_date: start, sessions: sessions.map((s) => ({ day_of_week: s.day, title: `Day ${s.day}`, exercises: s.ex })), ...extra,
});
const base = { Squat: 200, "Bench press": 150, "Sumo deadlift": 250 };
const findings = (w: CheckWeek, more: Partial<Parameters<typeof prePublishChecks>[0]> = {}) =>
  prePublishChecks({ week: w, baselines: base, today: "2026-11-01", ...more });

describe("kontroll före publicering", () => {
  it("passes a normal week without findings", () => {
    const w = week("2026-11-02", [
      { day: 1, ex: [ex("Back squat", 4, 5, 8, 160)] },
      { day: 3, ex: [ex("Bench press", 4, 5, 8, 120)] },
    ]);
    expect(findings(w)).toEqual([]);
  });
  it("flags a comp lift without weight when a baseline exists", () => {
    const f = findings(week("2026-11-02", [{ day: 1, ex: [ex("Back squat", 4, 5, 8, null)] }]));
    expect(f.some((x) => x.area === "Vikter" && /saknar föreslagen vikt/.test(x.message))).toBe(true);
  });
  it("does not flag a max triple at RPE 10 without weight", () => {
    expect(findings(week("2026-11-02", [{ day: 1, ex: [ex("Back squat", 1, 3, 10, null)] }]))).toEqual([]);
  });
  it("flags a weight above what the baseline allows", () => {
    const f = findings(week("2026-11-02", [{ day: 1, ex: [ex("Back squat", 3, 5, 8, 190)] }]));
    expect(f.some((x) => /tyngre än baslinjen/.test(x.message))).toBe(true);
  });
  it("flags weight that does not match the target RPE", () => {
    // 200 kg baseline: 5 reps @ RPE 8 ≈ 81 %; 140 kg ≈ 70 % → about RPE 6
    const f = findings(week("2026-11-02", [{ day: 1, ex: [ex("Back squat", 4, 5, 8, 140)] }]));
    expect(f.some((x) => x.area === "Vikter")).toBe(true);
  });
  it("flags a session over 30 sets and more than 24 hard sets in a lift", () => {
    const f = findings(week("2026-11-02", [{ day: 1, ex: [ex("Back squat", 26, 3, 7, 150), ex("Leg press", 6, 10, 8, null)] }]));
    expect(f.some((x) => /32 set, över taket 30/.test(x.message))).toBe(true);
    expect(f.some((x) => /26 hårda set i knäböj/.test(x.message))).toBe(true);
  });
  it("flags a deload with as much volume as the previous week and RPE 8.5", () => {
    const prev = week("2026-10-26", [{ day: 1, ex: [ex("Back squat", 4, 5, 8, 160)] }]);
    const w = week("2026-11-02", [{ day: 1, ex: [ex("Back squat", 4, 5, 8.5, 165)] }], { is_deload: true });
    const f = findings(w, { previousWeek: prev });
    expect(f.some((x) => /Avlastningsveckan har lika mycket/.test(x.message))).toBe(true);
    expect(f.some((x) => /RPE 8,5 eller mer/.test(x.message))).toBe(true);
  });
  it("flags a volume jump over 30 % between working weeks", () => {
    const prev = week("2026-10-26", [{ day: 1, ex: [ex("Back squat", 3, 5, 8, 160)] }]);
    const w = week("2026-11-02", [{ day: 1, ex: [ex("Back squat", 5, 5, 8, 160)] }]);
    expect(findings(w, { previousWeek: prev }).some((x) => /ökar 67 %/.test(x.message))).toBe(true);
  });
  it("does not flag the jump after a ramp-in week or into an overload week", () => {
    const prev = week("2026-10-26", [{ day: 1, ex: [ex("Back squat", 3, 5, 6, 140)] }], { notes: "Ramp-in week — reduced sets and RPE after time off." });
    const w = week("2026-11-02", [{ day: 1, ex: [ex("Back squat", 5, 4, 8, 165)] }]);
    expect(findings(w, { previousWeek: prev }).some((x) => /ökar/.test(x.message))).toBe(false);
    const prev2 = week("2026-10-26", [{ day: 1, ex: [ex("Back squat", 3, 5, 8, 160)] }], { training_phase: "intensifiering" });
    const w2 = week("2026-11-02", [{ day: 1, ex: [ex("Back squat", 5, 5, 8, 160)] }], { training_phase: "overbelastning" });
    expect(findings(w2, { previousWeek: prev2 }).some((x) => /ökar/.test(x.message))).toBe(false);
  });
  it("does not call a light front squat the day after squat heavy", () => {
    const w = week("2026-11-02", [{ day: 1, ex: [ex("Back squat", 4, 4, 8, 165)] }, { day: 2, ex: [ex("Front squat", 3, 6, 8, 100)] }]);
    expect(findings(w).some((x) => /två dagar i rad/.test(x.message))).toBe(false);
  });
  it("flags more than three training days in a row and heavy squat two days in a row", () => {
    const w = week("2026-11-02", [1, 2, 3, 4].map((d) => ({ day: d, ex: [ex("Back squat", 3, 3, 8, 170)] })));
    const f = findings(w);
    expect(f.some((x) => /4 träningsdagar i rad/.test(x.message))).toBe(true);
    expect(f.some((x) => /Tung knäböj två dagar i rad/.test(x.message) && x.level === "warn")).toBe(true);
  });
  it("flags sessions during reported absence and clashes with another published plan", () => {
    const w = week("2026-11-02", [{ day: 1, ex: [ex("Bench press", 3, 5, 7, 112.5)] }, { day: 4, ex: [ex("Bench press", 3, 5, 7, 112.5)] }]);
    const f = findings(w, {
      unavailability: [{ startDate: "2026-11-01", endDate: "2026-11-03", reason: "sick" }],
      otherPlanDates: [{ date: "2026-11-03", name: "Volymblock bänk", published: true }],
    });
    expect(f.some((x) => /anmäld frånvaro \(sjuk/.test(x.message))).toBe(true);
    expect(f.some((x) => x.area === "Krockar" && x.level === "warn")).toBe(true);
  });
});

const log = (date: string, exercise: string, kg: number, reps: number, rpe: number, set = 1, pe?: string): ReviewLog =>
  ({ date, exercise, variation: null, set_number: set, reps, weight_kg: kg, rpe, planned_exercise_id: pe ?? null });

describe("uppföljning mellan block", () => {
  it("classifies e1RM change with a 2 % threshold", () => {
    expect(verdictOf(2.4)).toBe("stronger");
    expect(verdictOf(1.2)).toBe("flat");
    expect(verdictOf(-3)).toBe("weaker");
    expect(verdictOf(null)).toBe("unknown");
  });
  it("counts a session moved one day as done", () => {
    expect(matchSessions(["2026-11-02", "2026-11-04"], ["2026-11-02", "2026-11-05"])).toBe(2);
    expect(matchSessions(["2026-11-02", "2026-11-04"], ["2026-11-02"])).toBe(1);
  });
  it("summarises e1RM, adherence and RPE drift for a finished block", () => {
    const weeks: ReviewWeek[] = [0, 7, 14].map((off) => ({
      week_start_date: ["2026-10-05", "2026-10-12", "2026-10-19"][off / 7]!,
      mesocycle_id: "m1",
      planned_sessions: [1, 4].map((d) => ({ day_of_week: d, title: `Day ${d}`, planned_exercises: [{ id: `pe-${off}-${d}`, exercise: "Back squat", target_sets: 4, target_reps: 5, target_rpe: 8, target_weight_kg: 160 }] })),
    }));
    const logs: ReviewLog[] = [
      log("2026-10-05", "Back squat", 160, 5, 8.5, 1, "pe-0-1"),
      log("2026-10-08", "Back squat", 160, 5, 8.5, 1, "pe-0-4"),
      log("2026-10-12", "Back squat", 162.5, 5, 8.5, 1, "pe-7-1"),
      log("2026-10-20", "Back squat", 165, 5, 8.5, 1, "pe-14-1"),
    ];
    const [b] = reviewBlocks({ mesocycles: [{ id: "m1", name: "Block 1", start_date: "2026-10-05", total_weeks: 3 }], weeks, logs, baselines: base, today: "2026-11-20" });
    expect(b!.finished).toBe(true);
    expect(b!.sessionsPlanned).toBe(6);
    expect(b!.sessionsLogged).toBe(4); // 10-20 counts for planned 10-19
    expect(b!.adherencePct).toBe(67);
    expect(b!.lifts.squat.rpeDiff).toBeCloseTo(0.5);
    expect(b!.lifts.squat.e1End).toBeGreaterThan(b!.lifts.squat.e1Start!);
  });
});

const block = (name: string, change: number, extra: Partial<BlockReview> = {}, lift: Partial<BlockReview["lifts"]["squat"]> = {}): BlockReview => {
  const l = (k: "squat" | "bench" | "deadlift") => ({ lift: k, e1Start: 100, e1End: 100, changePct: null, verdict: "unknown" as const, measurements: 0, hardPerWeek: 8, heavyPerWeek: 2, rpeDiff: 0, ...(k === "squat" ? { changePct: change, ...lift } : {}) });
  return { id: name, name, start: "2026-09-01", end: "2026-10-01", finished: true, isPeak: false, workingWeeks: 3, sessionsPlanned: 12, sessionsLogged: 12, setsPlanned: 40, setsLogged: 40, adherencePct: 100, rpeDiff: 0, lifts: { squat: l("squat"), bench: l("bench"), deadlift: l("deadlift") }, ...extra };
};

describe("förslag när progressionen står still", () => {
  it("needs two finished blocks in a row under +2 %", () => {
    expect(stallFindings([block("B2", 1), block("B1", 3)])).toHaveLength(0);
    expect(stallFindings([block("B2", 1)])).toHaveLength(0);
    expect(stallFindings([block("B2", 1), block("B1", -1)])).toHaveLength(1);
  });
  it("skips peak blocks when judging a stall", () => {
    expect(stallFindings([block("Toppning", 0, { isPeak: true }), block("B2", 1), block("B1", 4)])).toHaveLength(0);
    expect(stallFindings([block("Toppning", 0, { isPeak: true }), block("B2", 1), block("B1", 0)])).toHaveLength(1);
  });
  it("puts low adherence first and suggests push when it is off", () => {
    const [f] = stallFindings([block("B2", 0.5, { adherencePct: 60, sessionsLogged: 6 }), block("B1", 1)], { pushEnabled: { squat: false } });
    expect(f!.suggestions[0]).toMatch(/Följsamheten var 60 %/);
    expect(f!.suggestions.some((s) => /Viktprogression är av/.test(s))).toBe(true);
  });
  it("suggests heavier work when heavy sets are missing", () => {
    const [f] = stallFindings([block("B2", 0, {}, { heavyPerWeek: 0.3, hardPerWeek: 12 }), block("B1", 0)], { pushEnabled: { squat: true } });
    expect(f!.suggestions[0]).toMatch(/tungt set/);
  });
});
