import { describe, expect, it } from "vitest";
import {
  buildTaperPlan,
  DEFAULT_TAPER_SETTINGS,
  resolveTaperSettings,
  round25,
  snapToTrainingDay,
  taperSettingsOutOfRange,
  type TaperLiftInput,
} from "./taperModel";

const D0 = "2027-01-23"; // lördag
const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];

const lift = (name: string, e1rm: number): TaperLiftInput => ({
  name, e1rm, weeklySets: 12, setsPerExposure: 4, exposuresPerWeek: 3, trained: true,
});
const LIFTS = {
  squat: lift("Back squat", 200),
  bench: lift("Bench press", 140),
  deadlift: lift("Deadlift", 240),
};

describe("taperModel", () => {
  it("förankrar regeldagarna exakt vid D0 när alla dagar är träningsdagar", () => {
    const plan = buildTaperPlan({ competitionDate: D0, trainingWeekdays: ALL_DAYS, lifts: LIFTS });
    const at = (date: string) => plan.sessions.find((s) => s.date === date);
    // Sista tunga: mark D-9, böj D-8, bänk D-5
    expect(at("2027-01-14")?.exercises.some((e) => e.exercise === "Deadlift" && e.sets === 3 && e.reps === 1)).toBe(true);
    expect(at("2027-01-15")?.exercises.some((e) => e.exercise === "Back squat" && e.sets === 3 && e.reps === 2)).toBe(true);
    expect(at("2027-01-18")?.exercises.some((e) => e.exercise === "Bench press" && e.sets === 3 && e.reps === 3)).toBe(true);
    // Sista lätta: mark D-7, böj D-4, bänk D-3
    expect(at("2027-01-16")?.exercises.some((e) => e.exercise === "Deadlift" && e.pctOfE1rm === 0.725)).toBe(true);
    expect(at("2027-01-19")?.exercises.some((e) => e.exercise === "Back squat" && e.pctOfE1rm === 0.775)).toBe(true);
    expect(at("2027-01-20")?.exercises.some((e) => e.exercise === "Bench press" && e.pctOfE1rm === 0.775)).toBe(true);
  });

  it("flyttar regeldagar till närmaste träningsdag FÖRE, aldrig efter", () => {
    // Bara måndag och torsdag: D-9 (tors 14/1) ligger kvar, D-8 (ons 15/1) flyttas till mån 11/1? Nej —
    // närmaste före ons 13/1... D-8 = 2027-01-15 (fre). Närmaste träningsdag före = tors 14/1.
    expect(snapToTrainingDay("2027-01-15", [1, 4])).toBe("2027-01-14");
    expect(snapToTrainingDay("2027-01-14", [1, 4])).toBe("2027-01-14");
    // Aldrig efter: söndag med bara måndagsträning → måndagen sex dagar tidigare.
    expect(snapToTrainingDay("2027-01-17", [1])).toBe("2027-01-11");
  });

  it("räknar laster från e1RM och avrundar till 2,5 kg", () => {
    expect(round25(164.25)).toBe(165);
    expect(round25(101.1)).toBe(100);
    const plan = buildTaperPlan({ competitionDate: D0, trainingWeekdays: ALL_DAYS, lifts: LIFTS });
    const heavy = plan.sessions.find((s) => s.date === "2027-01-14")?.exercises.find((e) => e.exercise === "Deadlift");
    expect(heavy?.kg).toBe(round25(240 * 0.922));
    expect(heavy?.kg).toBe(222.5);
  });

  it("håller vilan: inga pass D-2 eller D-1", () => {
    const plan = buildTaperPlan({ competitionDate: D0, trainingWeekdays: ALL_DAYS, lifts: LIFTS });
    expect(plan.sessions.some((s) => s.date === "2027-01-21" || s.date === "2027-01-22")).toBe(false);
  });

  it("skär tapervolymen med vald sänkning (stegtaper, inte gradvis)", () => {
    const plan = buildTaperPlan({ competitionDate: D0, trainingWeekdays: ALL_DAYS, lifts: LIFTS });
    const taperSets = plan.sessions
      .filter((s) => s.phase === "taper")
      .flatMap((s) => s.exercises)
      .filter((e) => e.exercise === "Back squat")
      .reduce((n, e) => n + e.sets, 0);
    // Referens 12 set/vecka × 0,5 kvar × 9/7 dagar ≈ 7–8 set totalt i tapern.
    expect(taperSets).toBeGreaterThanOrEqual(6);
    expect(taperSets).toBeLessThanOrEqual(9);
  });

  it("tar bort assistansen från D-14", () => {
    const plan = buildTaperPlan({
      competitionDate: D0, trainingWeekdays: ALL_DAYS, lifts: LIFTS,
      accessories: [{ exercise: "Nordic curl", weeklySets: 6, reps: 8 }],
    });
    const withAcc = plan.sessions.filter((s) => s.exercises.some((e) => e.exercise === "Nordic curl"));
    expect(withAcc.length).toBeGreaterThan(0);
    expect(withAcc.every((s) => s.date < "2027-01-09")).toBe(true); // D-14 = 9 jan
  });

  it("varnar alltid vid mer än 3 dagars bänkuppehåll och veckolångt uppehåll", () => {
    // Bara måndagar: sista bänken blir senast måndag 18/1 (D-5) men sista lätta bänken
    // D-3 (ons 20/1) snappas till mån 18/1 → 5 dagars uppehåll → varning.
    const plan = buildTaperPlan({ competitionDate: D0, trainingWeekdays: [1], lifts: LIFTS });
    expect(plan.warnings.some((w) => w.includes("bänk"))).toBe(true);
    expect(plan.warnings.some((w) => w.includes("vecka"))).toBe(true);
    // Med alla dagar: inga varningar.
    const calm = buildTaperPlan({ competitionDate: D0, trainingWeekdays: ALL_DAYS, lifts: LIFTS });
    expect(calm.warnings.some(w => w.includes("bänk"))).toBe(false);
  });

  it("markerar överbelastningsveckan direkt före taperstart", () => {
    const plan = buildTaperPlan({ competitionDate: D0, trainingWeekdays: ALL_DAYS, lifts: LIFTS });
    const overload = plan.sessions.filter((s) => s.phase === "overbelastning");
    expect(overload.length).toBeGreaterThan(0);
    expect(overload.every((s) => s.date >= "2027-01-07" && s.date <= "2027-01-13")).toBe(true); // D-16..D-10
    const off = buildTaperPlan({ competitionDate: D0, trainingWeekdays: ALL_DAYS, lifts: LIFTS, settings: { overloadWeek: false } });
    expect(off.sessions.some((s) => s.phase === "overbelastning")).toBe(false);
  });

  it("flaggar reglage utanför intervallet för aktiv bekräftelse", () => {
    expect(taperSettingsOutOfRange(resolveTaperSettings())).toEqual([]);
    expect(taperSettingsOutOfRange(resolveTaperSettings({ taperDays: 12 }))).toEqual([]); // 7–14 är inom intervallet
    expect(taperSettingsOutOfRange(resolveTaperSettings({ taperDays: 15 }))).toContain("taperDays");
    expect(taperSettingsOutOfRange(resolveTaperSettings({ volumeCut: 0.35 }))).toEqual([]); // 30–60 % är inom intervallet
    expect(taperSettingsOutOfRange(resolveTaperSettings({ volumeCut: 0.7 }))).toContain("volumeCut");
    expect(taperSettingsOutOfRange(resolveTaperSettings({ heavyDay: { ...DEFAULT_TAPER_SETTINGS.heavyDay, squat: 5 } }))).toContain("heavyDay.squat");
  });

  it("slår ihop två lyft som hamnar samma dag till ett pass", () => {
    // Mark D-9 och böj D-8 snappas båda till samma måndag med bara måndagsträning.
    const plan = buildTaperPlan({ competitionDate: D0, trainingWeekdays: [1], lifts: LIFTS });
    const merged = plan.sessions.find((s) => s.date === "2027-01-11");
    const names = merged?.exercises.map((e) => e.exercise) ?? [];
    expect(names).toContain("Deadlift");
    expect(names).toContain("Back squat");
  });

  it("håller minst 85 % på taperpassens arbetsset, och stödjer sänkt intensitet (Bell 2025)", () => {
    const plan = buildTaperPlan({ competitionDate: D0, trainingWeekdays: ALL_DAYS, lifts: LIFTS });
    const taperWork = plan.sessions
      .filter((s) => s.phase === "taper")
      .flatMap((s) => s.exercises)
      .filter((e) => e.notes?.startsWith("Taper:"));
    expect(taperWork.length).toBeGreaterThan(0);
    expect(taperWork.every((e) => (e.pctOfE1rm ?? 0) >= 0.85)).toBe(true);
    const lower = buildTaperPlan({ competitionDate: D0, trainingWeekdays: ALL_DAYS, lifts: LIFTS, settings: { intensity: "lower" } });
    const lowered = lower.sessions.filter((s) => s.phase === "taper").flatMap((s) => s.exercises).filter((e) => e.notes?.startsWith("Taper:"));
    expect(lowered.length).toBeGreaterThan(0);
    expect(lowered.every((e) => e.pctOfE1rm === 0.7)).toBe(true);
    const heavyLowered = lower.sessions.find((s) => s.date === "2027-01-14")?.exercises.find((e) => e.exercise === "Deadlift");
    expect(heavyLowered?.rpe).toBe(8);
    expect(heavyLowered?.pctOfE1rm).toBeCloseTo(0.922, 4);
  });
  it("never exceeds RPE 8.5 on final heavy work, even with raised intensity", () => {
    const plan=buildTaperPlan({competitionDate:D0,trainingWeekdays:ALL_DAYS,lifts:LIFTS,singlesEnabled:true,settings:{heavyRpe:10,backoffRpe:10,intensity:"raise"}});
    const heavy=plan.sessions.flatMap(s=>s.exercises).filter(e=>e.rpe!=null);
    expect(heavy.length).toBeGreaterThan(0);
    expect(heavy.every(e=>(e.rpe??0)<=8.5)).toBe(true);
  });
  it("never trains a lift after its last planned technique exposure", () => {
    const plan=buildTaperPlan({competitionDate:D0,trainingWeekdays:ALL_DAYS,lifts:LIFTS});
    for(const [name,date] of [["Deadlift","2027-01-16"],["Back squat","2027-01-19"],["Bench press","2027-01-20"]]) {
      expect(plan.sessions.filter(s=>s.exercises.some(e=>e.exercise===name)).every(s=>s.date<=date)).toBe(true);
    }
  });
});
