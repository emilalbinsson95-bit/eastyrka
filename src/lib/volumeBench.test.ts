import { describe, expect, it } from "vitest";
import { buildVolumeBenchWeeks, suggestBackUp, VB_ACCESSORY_ORDER } from "./volumeBench";
import { plannedWeekMetrics } from "./liftMetrics";
import { pctWeightKg } from "./percentRows";
import { plannedSessionDate } from "./planned-session-dates";

const all = (w: ReturnType<typeof buildVolumeBenchWeeks>) => w.flatMap((x) => x.sessions);
const bench = (e: { exercise: string; variation?: string | null }) => e.exercise === "Bench press" && e.variation !== "Over-warm single";

describe("steg 8: Volymblock bänk", () => {
  it("varannan dag: 21 pass på 6 veckor, mån/ons/fre/sön sedan tis/tor/lör", () => {
    const weeks = buildVolumeBenchWeeks({ schedule: "every-other-day" });
    expect(weeks).toHaveLength(6);
    expect(all(weeks)).toHaveLength(21);
    const dates = (wi: number) => weeks[wi].sessions.map((s) => plannedSessionDate("2026-11-16", s, weeks[wi].sessions));
    expect(dates(0)).toEqual(["2026-11-16", "2026-11-18", "2026-11-20", "2026-11-22"]);
    expect(dates(1)).toEqual(["2026-11-17", "2026-11-19", "2026-11-21"]);
    expect(weeks.every((w) => w.kind === "working")).toBe(true);
  });
  it("3 dagar per vecka: 7 veckor", () => {
    const weeks = buildVolumeBenchWeeks({ schedule: "three-per-week" });
    expect(weeks).toHaveLength(7);
    expect(all(weeks)).toHaveLength(21);
  });
  it("Alex, bänk 160 kg, steg 2,5: pass 1 är 10 × 10 på 92,5 kg med mängd 57,8 och RPE-tak 8", () => {
    const weeks = buildVolumeBenchWeeks();
    const row = all(weeks)[0].exercises.find(bench)!;
    expect(row).toMatchObject({ target_sets: 10, target_reps: 10, target_pct: 58, rpe_cap: 8 });
    expect(pctWeightKg(160, 58, 2.5)).toBe(92.5);
    const m = plannedWeekMetrics([{ ...weeks[0], sessions: [weeks[0].sessions[0]] }], { "Bench press": 160 });
    expect(Math.round((m[0].metrics.bench.volume ?? 0) * 10) / 10).toBe(57.8);
  });
  it("pass 19 har toppset 97 % = 155 kg och pass 21 toppsingel 103 %", () => {
    const s = all(buildVolumeBenchWeeks());
    const top19 = s[18].exercises.find((e) => e.notes === "Toppset")!;
    expect(pctWeightKg(160, top19.target_pct!, 2.5)).toBe(155);
    expect(s[20].exercises.find((e) => e.notes?.startsWith("Toppset"))).toMatchObject({ target_pct: 103, target_sets: 1, target_reps: 1 });
    expect(s[20].exercises.filter((e) => !bench(e))).toHaveLength(0);
  });
  it("setdos och intrappning: pass 1 får 6 set, pass 2 får 8, sedan setdosen", () => {
    const s = all(buildVolumeBenchWeeks({ setDose: 10, rampIn: true }));
    expect([0, 1, 2].map((i) => s[i].exercises.find(bench)!.target_sets)).toEqual([6, 8, 10]);
    expect(all(buildVolumeBenchWeeks({ setDose: 7 }))[3].exercises.find(bench)!.target_sets).toBe(7);
  });
  it("komplement: A/B enligt ordningen, pass 19 baksida axlar, pass 20 latsdrag + stångrodd", () => {
    const s = all(buildVolumeBenchWeeks());
    expect(VB_ACCESSORY_ORDER).toHaveLength(18);
    expect(s[0].exercises.filter((e) => !bench(e)).map((e) => e.exercise)).toEqual(["Overhead press", "Lateral raise", "Reverse fly", "Cable triceps pushdown"]);
    expect(s[1].exercises.filter((e) => !bench(e)).map((e) => e.exercise)).toEqual(["Lat pulldown", "Barbell row", "Face pull", "Biceps curl"]);
    expect(s[18].exercises.filter((e) => !bench(e)).map((e) => e.exercise)).toEqual(["Reverse fly"]);
    expect(s[19].exercises.filter((e) => !bench(e)).map((e) => e.exercise)).toEqual(["Lat pulldown", "Barbell row"]);
  });
  it("mätsingel och underhåll är av som standard", () => {
    const s = all(buildVolumeBenchWeeks());
    expect(s.some((x) => x.exercises.some((e) => e.variation === "Over-warm single" || /squat|deadlift/i.test(e.exercise)))).toBe(false);
    const on = buildVolumeBenchWeeks({ measureSingle: true, maintenance: true });
    expect(on[0].sessions[0].exercises[0]).toMatchObject({ variation: "Over-warm single", target_rpe: 7 });
    expect(on[0].sessions[1].exercises[0].variation).not.toBe("Over-warm single");
    expect(on[0].sessions.flatMap((x) => x.exercises).filter((e) => /squat|deadlift/i.test(e.exercise)).map((e) => e.exercise)).toEqual(["Back squat", "Deadlift"]);
  });
  it("frånvaro på fem dagar eller mer föreslår att backa tre pass", () => {
    expect(suggestBackUp("2026-11-10", "2026-11-14")).toBe(false);
    expect(suggestBackUp("2026-11-10", "2026-11-15")).toBe(true);
  });
});
