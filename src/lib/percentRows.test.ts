import { describe, expect, it } from "vitest";
import { avgRatedRpe, estimatedRpeFromPct, isLightPercentRow, loggedRpeText, normalizePct, pctRowLabel, pctWeightKg, rpeRequired } from "./percentRows";
import { dailyE1RM } from "./eakoefficient";

describe("procent som styrning", () => {
  it("bänkbaslinje 160 kg, 58 %, steg 2,5 kg ger 92,5 kg", () => {
    expect(pctWeightKg(160, 58, 2.5)).toBe(92.5);
  });
  it("avrundar till coachens steg", () => {
    expect(pctWeightKg(160, 58, 1.25)).toBe(92.5);
    expect(pctWeightKg(160, 58, 1)).toBe(93);
  });
  it("saknas baslinje blir vikten tom och texten säger det", () => {
    expect(pctWeightKg(null, 58)).toBeNull();
    expect(pctRowLabel({ target_sets: 10, target_reps: 10, target_pct: 58, target_weight_kg: null })).toBe("10 × 10 · 58 % – baslinje saknas");
    expect(pctRowLabel({ target_sets: 10, target_reps: 10, target_pct: 58, target_weight_kg: 92.5 })).toBe("10 × 10 · 92,5 kg (58 %)");
  });
  it("procent hålls inom 30–105 i steg om 0,5", () => {
    expect(normalizePct(20)).toBe(30);
    expect(normalizePct(110)).toBe(105);
    expect(normalizePct("57,8")).toBe(58);
    expect(normalizePct(72.3)).toBe(72.5);
    expect(normalizePct("")).toBeNull();
  });
  it("10 × 10 på 58 % är lätt (under RPE 6), 5 × 5 på 80 % är hårt", () => {
    expect(isLightPercentRow({ target_pct: 58, target_reps: 10 })).toBe(true);
    expect(isLightPercentRow({ target_pct: 80, target_reps: 5 })).toBe(false);
    expect(isLightPercentRow({ target_pct: null, target_reps: 10 })).toBe(false);
  });
});

describe("frivillig RPE på procentrader", () => {
  it("RPE/RIR-rader kräver RPE på varje set", () => {
    expect(rpeRequired({ target_pct: null, target_reps: 5 }, 1)).toBe(true);
    expect(rpeRequired({ target_pct: null, target_reps: 5 }, 3)).toBe(true);
  });
  it("tungt första procentset (uppskattad RPE ≥ 7) kräver RPE, följande set gör det inte", () => {
    // 5 reps @ 81 % ≈ RPE 8
    expect(rpeRequired({ target_pct: 81, target_reps: 5 }, 1)).toBe(true);
    expect(rpeRequired({ target_pct: 81, target_reps: 5 }, 2)).toBe(false);
  });
  it("lätt procentrad kräver aldrig RPE", () => {
    expect(rpeRequired({ target_pct: 58, target_reps: 10 }, 1)).toBe(false);
  });
  it("osatta set räknas inte i snitt och visas som streck", () => {
    expect(avgRatedRpe([{ rpe: 8 }, { rpe: null }, { rpe: 0 }, { rpe: 7 }])).toBe(7.5);
    expect(avgRatedRpe([{ rpe: null }])).toBeNull();
    expect(loggedRpeText(null)).toBe("–");
    expect(loggedRpeText(8.5)).toBe("8,5");
  });
  it("set utan RPE ger ingen maxberäkning", () => {
    expect(dailyE1RM({ weight_kg: 100, reps: 5, rpe: 0 })).toBe(0);
    expect(dailyE1RM({ weight_kg: 100, reps: 5, rpe: null as unknown as number })).toBe(0);
  });
});
