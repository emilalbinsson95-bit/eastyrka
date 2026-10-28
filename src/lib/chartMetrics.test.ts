import { describe, it, expect } from "vitest";
import { adverseReadinessDeviation, chartMeasurements, chartStrengthSeries, latestChartStrength, repInterval, personalRecords, paceRange, dotsScore, limbSymmetryIndex } from "./chartMetrics";
import { readinessFromEAk, isReadinessLift, processLogs } from "./eakoefficient";
import { setVolumeWeight } from "./exerciseVariants";
import { VOLUME_LANDMARKS } from "./individualisation";
import { sessionLoad } from "./enduranceLoad";
import { compareStrength } from "./strengthComparison";

const log = (date: string, weight: number, extra = {}) => ({ date, exercise: "Bench press", variation: null, set_number: 1, reps: 1, weight_kg: weight, rpe: 10, ...extra });
describe("Emil's chart rules", () => {
  it("gives EAk only to competition lifts, never variants or Olympic lifts", () => {
    const logs=[log("2026-10-01",100),log("2026-10-02",80,{variation:"close grip"}),log("2026-10-03",90,{exercise:"Snatch"}),log("2026-10-04",120,{exercise:"Squat",variation:"pause"}),log("2026-10-05",160,{exercise:"Deadlift"})];
    const points=latestChartStrength(logs,{"Bench press":100,Snatch:90,"Back squat":120,Deadlift:160});
    expect(points.filter(p=>p.eak!=null).map(p=>p.exercise)).toEqual(["Bench press","Deadlift"]);
    expect(points.find(p=>p.variation==="close grip")?.eak).toBeNull();
    expect(points.find(p=>p.variation==="close grip")?.e1rm).toBe(80);
    expect(isReadinessLift("Back squat","competition stance")).toBe(true);
    expect(isReadinessLift("Bench press","competition grip & pause")).toBe(true);
    expect(isReadinessLift("Back squat","pause")).toBe(false);
    expect(processLogs([{...logs[1],id:"variant",variation:"close grip"}],{"Bench press":100})[0].eaKoefficient).toBe(0);
  });
  it("merges Squat Over warm single and Squat competition stance without mutating history", () => {
    const logs = [log("2026-10-01",100,{exercise:"Squat Over warm single"}),log("2026-10-02",110,{exercise:"Squat competition stance"}),log("2026-10-03",120,{exercise:"Back squat",variation:"over-warm single"})];
    const points=latestChartStrength(logs,{"Back squat":110});
    expect(points).toHaveLength(1);
    expect(points[0].exercise).toBe("Back squat");
    expect(points[0].rolling).toBe(110);
    expect(points[0].eak).toBe(100);
    expect(logs[0].exercise).toBe("Squat Over warm single");
    expect(compareStrength(logs,"2026-10-27")[0].count).toBe(3);
  });
  it("merges English spellings of the same comp lift into one series", () => {
    const logs = [
      log("2026-10-01", 100, { exercise: "Squat" }),
      log("2026-10-02", 110, { exercise: "Back-Squat" }),
      log("2026-10-03", 120, { exercise: "Competition squat" }),
      log("2026-10-04", 130, { exercise: "Bench-Press" }),
      log("2026-10-05", 140, { exercise: "Competition Bench Press" }),
      log("2026-10-06", 150, { exercise: "Dead lift" }),
      log("2026-10-07", 160, { exercise: "Competition Deadlift" }),
    ];
    const points = latestChartStrength(logs, { "Back squat": 110, "Bench press": 135, Deadlift: 155 });
    expect(points.map(p => p.exercise).sort()).toEqual(["Back squat", "Bench press", "Deadlift"]);
    expect(points.find(p => p.exercise === "Back squat")?.rolling).toBe(110);
    expect(points.find(p => p.exercise === "Bench press")?.rolling).toBeCloseTo(135 * 100 / 135, 5);
    expect(points.every(p => p.eak != null)).toBe(true);
  });
  it("does not merge real squat variants or include flagged reference warmups", () => {
    const logs=[log("2026-10-01",100,{exercise:"Squat",variation:"competition stance"}),log("2026-10-01",200,{exercise:"Squat",variation:"Over warm single",is_warmup_reference:true}),log("2026-10-02",80,{exercise:"Squat",variation:"pause"})];
    const points=latestChartStrength(logs,{"Back squat":100});
    expect(points).toHaveLength(2);
    expect(points.find(p=>p.variation==="")?.rolling).toBe(100);
    expect(points.find(p=>p.variation==="pause")?.rolling).toBe(80);
  });
  it("uses the 92, 97 and 103 percent boundaries, not within-session fatigue", () => {
    expect([91.99, 92, 96.99, 97, 103, 103.01].map(readinessFromEAk)).toEqual(["exhausted", "undertrained", "undertrained", "adapting", "adapting", "peaking"]);
  });
  it("selects the first qualifying measurement and excludes reference warmups and technique", () => {
    const logs = [log("2026-10-01", 200, { is_warmup_reference: true }), log("2026-10-01", 100, { set_number: 2 }), log("2026-10-01", 150, { set_number: 3 }), log("2026-10-02", 250, { is_technique: true })];
    expect(chartMeasurements(logs).map(l => l.weight_kg)).toEqual([100]);
  });
  it("isolates variants and retains each lift's latest three sessions", () => {
    const logs = [log("2026-10-01", 90), log("2026-10-02", 95), log("2026-10-03", 100), log("2026-10-04", 102), log("2026-10-04", 200, { variation: "close grip" }), log("2026-10-05", 180, { exercise: "Back squat" })];
    const bench = latestChartStrength(logs, { "Bench press": 100 }).find(p => !p.variation && p.exercise === "Bench press");
    expect(bench?.eak).toBe(99);
    expect(chartStrengthSeries(logs, { "Bench press": 100 }).filter(p => p.date >= "2026-10-03")[0].rolling).toBe(95);
  });
  it("matches 1–3, 4–6 and 7+ reps", () => expect([1, 3, 4, 6, 7, 12].map(repInterval)).toEqual(["1–3", "1–3", "4–6", "4–6", "7+", "7+"]));
  it("compares different reps and RPE only within the same rep interval and variation", () => {
    const rows=compareStrength([
      log("2026-10-01",100,{reps:4,rpe:7}),log("2026-10-02",100,{reps:6,rpe:8}),
      log("2026-10-03",100,{reps:5,rpe:9}),log("2026-10-04",100,{reps:3,rpe:8}),
      log("2026-10-05",100,{reps:5,rpe:8,variation:"pause"}),
    ],"2026-10-27");
    expect(rows.find(r=>r.variation===""&&r.reps==="4–6")?.count).toBe(3);
    expect(rows).toHaveLength(3);
  });
  it("separates actual rep records from estimated measurement records", () => {
    const records = personalRecords([log("2026-10-01", 100), log("2026-10-02", 105), log("2026-10-02", 120, { set_number: 2 })]);
    expect(records.filter(p => p.kind === "actual").map(p => p.value)).toEqual([120, 105]);
    expect(records.filter(p => p.kind === "estimated").map(p => p.value)).toEqual([105]);
  });
  it("never colours constant answers as worse than normal", () => {
    expect(adverseReadinessDeviation(2, [2, 2, 2], true)).toBe(0);
    expect(adverseReadinessDeviation(4, [2, 2, 2], false)).toBe(2);
    expect(adverseReadinessDeviation(1, [2, 2, 2], false)).toBe(0);
  });
  it("requires ten distinct runs, not ten intervals from one run", () => {
    expect(paceRange(Array.from({ length: 10 }, () => ({ sessionId: "one", sec: 300, m: 1000 })))).toBeNull();
    expect(paceRange(Array.from({ length: 10 }, (_, i) => ({ sessionId: String(i), sec: 300 + i * 10, m: 1000 })))).toMatchObject({ lower: 309, upper: 381, sessions: 10 });
  });
  it("calculates DOTS without assuming sex", () => {
    expect(dotsScore(600, 83, "male")).toBeCloseTo(405.0524254, 2);
    expect(dotsScore(600, 83, null)).toBeNull();
  });
  it("calculates injured/healthy symmetry without division by zero", () => {
    expect(limbSymmetryIndex(90, 100)).toBe(90);
    expect(limbSymmetryIndex(100, 0)).toBeNull();
  });
  it("uses the generator's weekly set landmarks and 1.25 weight for 1.5-reps", () => {
    expect(VOLUME_LANDMARKS.squat).toEqual([6,20]);
    expect(4*setVolumeWeight({exercise:"1.5-rep squat"})).toBe(5);
    expect(4*setVolumeWeight({exercise:"Back squat"})).toBe(4);
  });
  it("adds a long run using session RPE times actual minutes", () => {
    expect(sessionLoad({date:"2026-10-27",discipline:"run",actual_total_seconds:5400,planned_total_seconds:null,overall_rpe:7,peak_rpe:10,planned_avg_rpe:null})).toBe(630);
  });
});