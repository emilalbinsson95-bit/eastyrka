import { describe, expect, it } from "vitest";
import { evaluateMesocycle, reboundTest, sessionPoints, individualNoise, pooledNoise, resolveStrategy, DEFAULT_STRATEGY, subjectiveSignal, subjectiveWorseFor, warmupRpeDrift, weeklySessionLoad, type SetLog, type BlockWindow, type CheckIn } from "./eakSignal";

/** Ett pass = en singel @ RPE 10 med vikt = önskad e1RM (exakt via RTS). */
const day = (date: string, e1rm: number, rpe = 10): SetLog[] => [
  { date, exercise: "Back squat", set_number: 1, reps: 1, weight_kg: e1rm, rpe },
];
const block = (dates: string[], e1rms: number[], rpe = 10): SetLog[] =>
  dates.flatMap((d, i) => day(d, e1rms[i], rpe));

const D = ["2026-06-01", "2026-06-04", "2026-06-08", "2026-06-11", "2026-06-15"];

const dateAt = (start: string, days: number) => {
  const d = new Date(`${start}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const noiseHistory = (levels: number[][]) => {
  const blocks: BlockWindow[] = levels.map((_, i) => ({
    kind: "working", start: dateAt("2026-01-01", i * 28), end: dateAt("2026-01-01", i * 28 + 27), mesocycleId: `meso-${i}`,
  }));
  const points = levels.flatMap((ys, i) => ys.map((e1rm, j) => ({ date: dateAt(blocks[i].start, 7 + j * 2), e1rm })));
  return { blocks, points, logs: points.flatMap((p) => day(p.date, p.e1rm)) };
};

describe("evaluateMesocycle", () => {
  it("5 pass med stabil e1RM → green", () => {
    const r = evaluateMesocycle({ logs: block(D, [100, 100, 100, 100, 100]), lift: "squat", baseline: 100 });
    expect(r.status).toBe("green");
    expect(r.n).toBe(5);
    expect(r.L_M).toBeCloseTo(100, 5);
  });

  it("snitt 6 % under förra meson, fallande lutning, 3/5 pass EAk < 97 → red", () => {
    const r = evaluateMesocycle({
      logs: block(D, [96, 95, 94, 93, 92]),
      lift: "squat",
      baseline: 100,
      previous: { L_M: 100 },
    });
    expect(r.status).toBe("red");
    expect(r.readinessSignal).toBe(true);
    expect(r.suggestion).toContain("Minska volymen");
  });

  it("samma fall utan readiness- eller atletsignal → yellow", () => {
    const r = evaluateMesocycle({
      logs: block(D, [98, 97, 96, 95, 94]),
      lift: "squat",
      baseline: 96,
      previous: { L_M: 102.35 },
    });
    expect(r.status).toBe("yellow");
    expect(r.readinessSignal).toBe(false);
  });

  it("snitt 11 % under förra meson → red_strong oavsett signaler", () => {
    const r = evaluateMesocycle({
      logs: block(D, [91, 90, 89, 88, 87]),
      lift: "squat",
      baseline: 100,
      previous: { L_M: 100 },
    });
    expect(r.status).toBe("red_strong");
  });

  it("5 pass på EAk 104–106 → push", () => {
    const r = evaluateMesocycle({ logs: block(D, [105, 105, 105, 105, 105]), lift: "squat", baseline: 100 });
    expect(r.status).toBe("push");
    expect(r.sustainedPush).toBe(true);
  });

  it("atletsignal ensam med stabil e1RM → green (triggar aldrig ensamt)", () => {
    const checkIns = [
      ...["2026-05-01", "2026-05-08", "2026-05-15"].map((date) => ({ date, fatigue: 3, sleep: 8 })),
      ...D.map((date) => ({ date, fatigue: 7, sleep: 5 })),
    ];
    const r = evaluateMesocycle({ logs: block(D, [100, 100, 100, 100, 100]), lift: "squat", baseline: 100, checkIns });
    expect(r.athleteSignal).toBe(true);
    expect(r.status).toBe("green");
  });

  it("färre än 4 pass → insufficient_data", () => {
    const r = evaluateMesocycle({ logs: block(D.slice(0, 3), [100, 100, 100]), lift: "squat", baseline: 100 });
    expect(r.status).toBe("insufficient_data");
  });

  it("threshold_i = max(5, 1.96 · TE_i · √(2/n))", () => {
    // Ostabil data → högt TE_i → tröskeln följer formeln.
    const history = noiseHistory([[100, 108, 96, 106, 95, 105], [94, 104, 93, 105, 96, 106]]);
    const r = evaluateMesocycle({ logs: history.logs, blocks: history.blocks, lift: "squat", baseline: 100, previous: { L_M: 100, n: 4 } });
    expect(r.TE_i).not.toBeNull();
    expect(r.threshold_i).toBeCloseTo(Math.max(5, 1.96 * (r.TE_i ?? 2.2) * Math.sqrt(1 / r.n + 1 / 4)), 5);
    // Med TE_i ≈ 4 % och n = 4 blir tröskeln ≈ 5,5.
    expect(Math.max(5, 1.96 * 4 * Math.sqrt(2 / 4))).toBeCloseTo(5.5, 1);
  });

  it("RPE-bias: +1 RPE på varje set ändrar inte dL_M-baserad status", () => {
    const prevDates = ["2026-05-04", "2026-05-07", "2026-05-11", "2026-05-14"];
    const cur = [91, 90, 89, 88, 87];
    const prev = [100, 100, 100, 100];
    const run = (rpe: number) => {
      const prevLogs = block(prevDates, prev, rpe);
      const L_prev = sessionPoints(prevLogs, "squat", 100).reduce((a, p) => a + p.e1rm, 0) / prev.length;
      return evaluateMesocycle({ logs: block(D, cur, rpe), lift: "squat", baseline: 100, previous: { L_M: L_prev } });
    };
    const a = run(10);
    const b = run(9);
    // Relativa mått (dL_M) neutraliserar biasen — statusen är densamma.
    expect(a.status).toBe("red_strong");
    expect(b.status).toBe("red_strong");
    expect(b.dL_M).toBeCloseTo(a.dL_M, 5);
  });
});

describe("reboundTest", () => {
  const blocks = [
    { kind: "working" as const, start: "2026-05-01", end: "2026-05-21" },
    { kind: "deload" as const, start: "2026-05-22", end: "2026-05-28" },
  ];
  const pts = (prevEak: number[], postEak: number[]) => [
    ...["2026-05-02", "2026-05-05", "2026-05-09"].map((date, i) => ({ date, eak: prevEak[i] })),
    ...["2026-05-30", "2026-06-02", "2026-06-05"].map((date, i) => ({ date, eak: postEak[i] })),
  ];

  it("101 mot 99 → godkänd (funktionell överbelastning)", () => {
    const r = reboundTest(pts([99, 99, 99], [101, 101, 101]), blocks);
    expect(r.passed).toBe(true);
    expect(r.R).toBeCloseTo(101 / 99, 5);
  });

  it("96 mot 99 → inte godkänd", () => {
    const r = reboundTest(pts([99, 99, 99], [96, 96, 96]), blocks);
    expect(r.passed).toBe(false);
  });
});

describe("individualNoise", () => {
  it("returnerar null tills två mesocykler kvalificerar", () => {
    const pts = sessionPoints(block(D, [100, 100, 100, 100, 100]), "squat", 100);
    expect(individualNoise(pts)).toBeNull();
  });

  it("bakåtkompatibelt fält returnerar samma poolade brus", () => {
    const h = noiseHistory([[100, 102, 98], [100, 103, 97]]);
    expect(individualNoise(h.points, h.blocks)).toBeCloseTo(pooledNoise(h.points, h.blocks).semPool ?? 0, 8);
  });
});

describe("steg A: trendjusterat poolat brus", () => {
  it("+1 % per pass ger lågt brus efter trendjustering", () => {
    const h = noiseHistory(Array.from({ length: 3 }, () => [100, 101.2, 101.8, 103.1, 103.9, 105]));
    const adjusted = pooledNoise(h.points, h.blocks);
    const raw = pooledNoise(h.points, h.blocks, null, { detrend: false });
    expect(adjusted.semPool).not.toBeNull();
    expect(adjusted.semPool ?? Infinity).toBeLessThan(1.5);
    expect(raw.semPool ?? 0).toBeGreaterThan((adjusted.semPool ?? 0) * 5);
  });

  it.each(["intro", "deload", "taper", "peak", "ramp"] as const)("exkluderar %s och första veckan ur brusskattningen", (kind) => {
    const h = noiseHistory([[100, 101, 99], [100, 102, 98]]);
    const excluded: BlockWindow = { kind, start: "2026-04-01", end: "2026-04-28", mesocycleId: "excluded" };
    const points = [...h.points, { date: h.blocks[0].start, e1rm: 500 }, { date: "2026-04-12", e1rm: 500 }];
    const result = pooledNoise(points, [...h.blocks, excluded]);
    expect(result.groups.map((g) => g.n)).toEqual([3, 3]);
    expect(result.semPool).toBeCloseTo(pooledNoise(h.points, h.blocks).semPool ?? 0, 8);
  });

  it("veckofönster med samma mesocykel-ID exkluderar bara första veckan", () => {
    const weeks: BlockWindow[] = Array.from({ length: 8 }, (_, i) => ({ kind: "working", start: dateAt("2026-01-01", i * 7), end: dateAt("2026-01-01", i * 7 + 6), mesocycleId: `meso-${Math.floor(i / 4)}` }));
    const points = weeks.map((w, i) => ({ date: w.start, e1rm: 100 + i % 2 }));
    const result = pooledNoise(points, weeks);
    expect(result.groups.map((g) => g.n)).toEqual([3, 3]);
    expect(result.semPool).not.toBeNull();
  });

  it("två pass slås ihop med föregående mesocykel, utan egen SEM", () => {
    const h = noiseHistory([[100, 101, 99], [102, 100], [100, 103, 99]]);
    const r = pooledNoise(h.points, h.blocks);
    expect(r.groups.map((g) => [g.key, g.n])).toEqual([["meso-0", 5], ["meso-2", 3]]);
    expect(r.semPool).not.toBeNull();
  });

  it("poolMesocycles begränsar poolen till de senaste mesocyklerna", () => {
    const h = noiseHistory([[60, 140, 60, 140], [100, 101, 99, 100], [100, 102, 98, 100]]);
    const limited = pooledNoise(h.points, h.blocks, { poolMesocycles: 2 });
    const expected = pooledNoise(h.points.filter((p) => p.date >= h.blocks[1].start), h.blocks);
    expect(limited.semPool).toBeCloseTo(expected.semPool ?? 0, 8);
    expect(limited.semPool ?? Infinity).toBeLessThan(pooledNoise(h.points, h.blocks).semPool ?? 0);
  });

  it("NR 2,0 nedgraderar red till low_confidence", () => {
    const h = noiseHistory([[100, 100, 100, 100, 100, 100], [100, 100, 100, 100, 100, 100], [100, 100, 100, 100, 100, 100], [94, 90, 98, 98, 90, 94]]);
    const input = { logs: h.logs, blocks: h.blocks, lift: "squat" as const, baseline: 100, previous: { L_M: 100, n: 6 } };
    expect(evaluateMesocycle({ ...input, strategy: { noiseRatioFlag: 2.1 } }).status).toBe("red");
    const r = evaluateMesocycle(input);
    expect(r.noiseRatio).toBeCloseTo(2, 8);
    expect(r.status).toBe("low_confidence");
  });

  it("brus nedgraderar yellow men aldrig red_strong", () => {
    const h = noiseHistory([[100, 100, 100, 100, 100, 100], [100, 100, 100, 100, 100, 100], [100, 100, 100, 100, 100, 100], [94, 90, 98, 98, 90, 94]]);
    expect(evaluateMesocycle({ logs: h.logs, blocks: h.blocks, lift: "squat", baseline: 94, previous: { L_M: 100 } }).status).toBe("low_confidence");
    const strong = evaluateMesocycle({ logs: h.logs, blocks: h.blocks, lift: "squat", baseline: 100, previous: { L_M: 110 } });
    expect(strong.status).toBe("red_strong");
    expect(strong.warning).not.toBeNull();
  });
});

describe("steg A: strategi och stödsignaler", () => {
  it("null och ogiltiga värden använder standard utan att ändra DEFAULT_STRATEGY", () => {
    expect(resolveStrategy({ fallStage1Pct: 7, defaultSem: null, pushHighPct: NaN })).toEqual({ ...DEFAULT_STRATEGY, fallStage1Pct: 7 });
    expect(DEFAULT_STRATEGY.fallStage1Pct).toBe(5);
  });

  it("fallStage1Pct 5 → 7 ändrar ett 6 % fall från red till green", () => {
    const input = { logs: block(D, [94, 94, 94, 94, 94]), lift: "squat" as const, baseline: 100, previous: { L_M: 100 } };
    expect(evaluateMesocycle(input).status).toBe("red");
    expect(evaluateMesocycle({ ...input, strategy: { fallStage1Pct: 7 } }).status).toBe("green");
  });

  it("strategin styr både minsta och största antal mätpass", () => {
    const input = { logs: block(D, [80, 100, 100, 100, 100]), lift: "squat" as const, baseline: 100 };
    const r = evaluateMesocycle({ ...input, strategy: { mesoMinSessions: 3, mesoMaxSessions: 3 } });
    expect(r.n).toBe(3);
    expect(r.L_M).toBe(100);
    expect(evaluateMesocycle({ ...input, strategy: { mesoMinSessions: 6 } }).status).toBe("insufficient_data");
  });

  it("push vid 104 kräver minst 75 % av passen över 103", () => {
    const input = { lift: "squat" as const, baseline: 100 };
    expect(evaluateMesocycle({ ...input, logs: block(D, [110, 110, 100, 100, 100]) }).status).toBe("green");
    expect(evaluateMesocycle({ ...input, logs: block(D, [105, 105, 105, 105, 100]) }).status).toBe("push");
    expect(evaluateMesocycle({ ...input, logs: block(D, [106, 106, 106, 106, 106]), strategy: { pushLowPct: 107, pushHighPct: 108 } }).status).toBe("green");
  });

  it("referensuppvärmning och bänk räknas inte som knäböjens mätset", () => {
    const logs: SetLog[] = [...day(D[0], 500).map((s) => ({ ...s, is_warmup_reference: true })), ...day(D[0], 100).map((s) => ({ ...s, set_number: 2 })), ...day(D[0], 200).map((s) => ({ ...s, exercise: "Bench press" }))];
    expect(sessionPoints(logs, "squat", 100)).toEqual([{ date: D[0], e1rm: 100, eak: 100 }]);
  });

  it("uppvärmnings-RPE +1,5 signalerar vid samma vikt, annan vikt ignoreras", () => {
    const warmups = [{ date: "2026-05-15", lift: "squat" as const, load_kg: 60, rpe: 6 }, { date: D[0], lift: "squat" as const, load_kg: 60, rpe: 7.5 }];
    expect(warmupRpeDrift(warmups, "squat", 60, D[0], 1)).toBe(true);
    expect(warmupRpeDrift([warmups[0], { ...warmups[1], load_kg: 70 }], "squat", 70, D[0], 1)).toBe(false);
    const input = { logs: block(D, [98, 98, 98, 98, 98]), lift: "squat" as const, baseline: 96, previous: { L_M: 105 }, warmups, warmupLoads: { squat: 60 } };
    expect(evaluateMesocycle(input).status).toBe("red");
    expect(evaluateMesocycle({ ...input, strategy: { warmupRpeDrift: 2 } }).status).toBe("yellow");
  });

  it.each(["soreness", "motivation"] as const)("%s jämförs med atletens eget snitt", (key) => {
    const previous = ["2026-05-15", "2026-05-20"].map((date) => ({ date, [key]: 5 }));
    const current = D.map((date) => ({ date, [key]: key === "soreness" ? 7 : 3 }));
    expect(subjectiveSignal([...previous, ...current], D[0])).toBe(true);
    expect(subjectiveSignal([...previous, ...current], D[0], { subjectiveWorsePoints: 2 })).toBe(false);
  });

  it("rebound under 1 och 15 dokumenterade sämre dagar ger NFOR, rebound ensam gör inte det", () => {
    const checkIns: CheckIn[] = [...["2026-05-15", "2026-05-20"].map((date) => ({ date, fatigue: 3 })), ...Array.from({ length: 15 }, (_, i) => ({ date: dateAt(D[0], i), fatigue: 6 }))];
    const input = { logs: block(D, [100, 100, 100, 100, 100]), lift: "squat" as const, baseline: 100, rebound: { R: 0.96, passed: false, explanation: "" } };
    expect(evaluateMesocycle({ ...input, checkIns }).nforFlag).toBe(true);
    expect(evaluateMesocycle(input).nforFlag).toBe(false);
    expect(evaluateMesocycle({ ...input, checkIns, rebound: { R: 1, passed: true, explanation: "" } }).nforFlag).toBe(false);
    expect(subjectiveWorseFor(checkIns, 16)).toBe(false);
    expect(subjectiveWorseFor([checkIns[0], checkIns[1], checkIns[2], checkIns[16]], 14)).toBe(false);
  });

  it("sRPE × minuter summeras veckovis med jämförelse mot fyra veckor; kondition utesluts", () => {
    const sessions = Array.from({ length: 5 }, (_, i) => ({ date: dateAt("2026-06-01", i * 7), sessionRpe: i === 4 ? 6 : 5, durationMin: 60 }));
    const result = weeklySessionLoad([...sessions, { date: "2026-06-29", sessionRpe: 10, durationMin: 300, sport: "endurance" }, { date: "2026-06-29", sessionRpe: 11, durationMin: 60 }]);
    expect(result.map((w) => w.load)).toEqual([300, 300, 300, 300, 360]);
    expect(result[4].changePct).toBe(20);
    expect(result[3].changePct).toBeNull();
    const input = { logs: block(D, [100, 100, 100, 100, 100]), lift: "squat" as const, baseline: 100 };
    expect(evaluateMesocycle({ ...input, sessionLoads: sessions }).status).toBe(evaluateMesocycle(input).status);
  });
});
