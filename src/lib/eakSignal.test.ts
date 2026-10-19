import { describe, expect, it } from "vitest";
import { evaluateMesocycle, reboundTest, sessionPoints, individualNoise, type SetLog } from "./eakSignal";

/** Ett pass = en singel @ RPE 10 med vikt = önskad e1RM (exakt via RTS). */
const day = (date: string, e1rm: number, rpe = 10): SetLog[] => [
  { date, exercise: "Back squat", set_number: 1, reps: 1, weight_kg: e1rm, rpe },
];
const block = (dates: string[], e1rms: number[], rpe = 10): SetLog[] =>
  dates.flatMap((d, i) => day(d, e1rms[i], rpe));

const D = ["2026-06-01", "2026-06-04", "2026-06-08", "2026-06-11", "2026-06-15"];

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
    const noisy = block(
      [...D, "2026-06-18", "2026-06-22", "2026-06-25", "2026-06-29"],
      [100, 108, 96, 106, 95, 105, 94, 104, 93],
    );
    const r = evaluateMesocycle({ logs: noisy, lift: "squat", baseline: 100, previous: { L_M: 100 } });
    expect(r.TE_i).not.toBeNull();
    expect(r.threshold_i).toBeCloseTo(Math.max(5, 1.96 * (r.TE_i ?? 2.2) * Math.sqrt(2 / r.n)), 5);
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
  it("returnerar null under 8 användbara pass", () => {
    const pts = sessionPoints(block(D, [100, 100, 100, 100, 100]), "squat", 100);
    expect(individualNoise(pts)).toBeNull();
  });

  it("exkluderar deload- och peakveckor", () => {
    const dates = Array.from({ length: 10 }, (_, i) => `2026-06-${String(i + 1).padStart(2, "0")}`);
    const pts = sessionPoints(block(dates, [100, 102, 98, 101, 99, 60, 60, 103, 97, 102]), "squat", 100);
    const withExclusion = individualNoise(pts, [{ kind: "deload", start: "2026-06-06", end: "2026-06-07" }]);
    const without = individualNoise(pts);
    expect(withExclusion).not.toBeNull();
    expect(withExclusion!).toBeLessThan(without!);
  });
});
