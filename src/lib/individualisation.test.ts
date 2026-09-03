import { describe, expect, it } from "vitest";
import { format, addDays } from "date-fns";
import {
  applyAdjustments,
  buildAdjustments,
  matchBaseline,
  summarizeHistory,
  templateWeeklySets,
  volumeWarnings,
  DEFAULT_TUNING,
  type HistoryInputs,
} from "@/lib/individualisation";
import { volumeCategory, isUnclassified, type TemplateWeek } from "@/lib/strengthTemplates";

const TODAY = "2026-06-15";
const ago = (n: number) => format(addDays(new Date(TODAY), -n), "yyyy-MM-dd");

function emptyHistory(over: Partial<HistoryInputs> = {}): HistoryInputs {
  return { today: TODAY, logs: [], readiness: [], baselines: [], unavailability: [], ...over };
}

function week(index: number, label: string, sets = 4): TemplateWeek {
  return {
    week_index: index,
    label,
    sessions: [
      {
        day_of_week: 1,
        title: "Squat day",
        exercises: [
          {
            exercise: "Back squat",
            target_sets: sets,
            target_reps: 5,
            target_rpe: 8,
            intensity_metric: "rpe",
          },
        ],
      },
    ],
  } as TemplateWeek;
}

const WEEKS = [week(1, "Week 1"), week(2, "Week 2"), week(3, "Deload")];

describe("summarizeHistory", () => {
  it("returns zeroed summary with no data", () => {
    const s = summarizeHistory(emptyHistory());
    expect(s.logDays).toBe(0);
    expect(s.weeksCovered).toBe(0);
    expect(s.daysSinceLastLog).toBeNull();
    expect(s.offDaysLast28).toBe(0);
  });

  it("counts logged days and weekly sets per category", () => {
    const logs = [0, 2, 4, 7, 9].map((d) => ({
      date: ago(d),
      exercise: "Back squat",
      variation: null,
      reps: 5,
      weight_kg: 100,
      rpe: 8,
    }));
    const s = summarizeHistory(emptyHistory({ logs }));
    expect(s.logDays).toBe(5);
    expect(s.daysSinceLastLog).toBe(0);
    expect(s.weeklySetsByCategory.get("squat")).toBeGreaterThan(0);
  });

  it("averages readiness over the last 14 days only", () => {
    const readiness = [
      { date: ago(1), fatigue: 8, work_stress: 7, life_stress: 7, daily_form: 4, sleep_hours: 6 },
      { date: ago(20), fatigue: 1, work_stress: 1, life_stress: 1, daily_form: 10, sleep_hours: 9 },
    ];
    const s = summarizeHistory(emptyHistory({ readiness }));
    expect(s.readinessCount).toBe(1);
    expect(s.avgFatigue).toBe(8);
  });

  it("counts overlapping off days in the window", () => {
    const s = summarizeHistory(
      emptyHistory({
        unavailability: [{ start_date: ago(10), end_date: ago(5), reason: "sick" }],
      }),
    );
    expect(s.offDaysLast28).toBe(6);
    expect(s.lastOffReason).toBe("sick");
  });
});

describe("templateWeeklySets", () => {
  it("averages over non-deload weeks", () => {
    expect(templateWeeklySets(WEEKS).get("squat")).toBe(4);
  });
});

describe("buildAdjustments", () => {
  it("flags insufficient data and proposes nothing", () => {
    const r = buildAdjustments(WEEKS, emptyHistory());
    expect(r.insufficientData).toBe(true);
    expect(r.adjustments).toHaveLength(0);
  });

  it("cuts volume when fatigue and stress are high", () => {
    const readiness = [1, 3, 5, 7].map((d) => ({
      date: ago(d),
      fatigue: 9,
      work_stress: 8,
      life_stress: 8,
      daily_form: 3,
      sleep_hours: 5,
    }));
    const r = buildAdjustments(WEEKS, emptyHistory({ readiness }));
    const a = r.adjustments.find((x) => x.id === "readiness");
    expect(a).toBeDefined();
    expect(a!.multiplier!).toBeLessThan(1);
    expect(a!.severity).toBe("warn");
  });

  it("raises volume when fresh", () => {
    const readiness = [1, 3, 5, 7].map((d) => ({
      date: ago(d),
      fatigue: 2,
      work_stress: 2,
      life_stress: 2,
      daily_form: 9,
      sleep_hours: 9,
    }));
    const a = buildAdjustments(WEEKS, emptyHistory({ readiness })).adjustments.find(
      (x) => x.id === "readiness",
    );
    expect(a!.multiplier!).toBeGreaterThan(1);
    expect(a!.severity).toBe("boost");
  });

  it("proposes a ramp-in after a long gap", () => {
    const logs = [{ date: ago(20), exercise: "Back squat", variation: null, reps: 5, weight_kg: 100, rpe: 8 }];
    const a = buildAdjustments(WEEKS, emptyHistory({ logs })).adjustments.find(
      (x) => x.kind === "ramp-in",
    );
    expect(a).toBeDefined();
    expect(a!.rampWeeks).toBe(2);
  });

  it("proposes load prescription when a baseline matches", () => {
    const a = buildAdjustments(
      WEEKS,
      emptyHistory({ baselines: [{ exercise: "Back squat", one_rm_kg: 200 }] }),
    ).adjustments.find((x) => x.kind === "loads");
    expect(a).toBeDefined();
  });
});

describe("matchBaseline", () => {
  it("matches on normalized substrings, preferring the longest", () => {
    const b = matchBaseline({ exercise: "Back squat" }, [
      { exercise: "squat", one_rm_kg: 150 },
      { exercise: "back squat", one_rm_kg: 200 },
    ]);
    expect(b!.one_rm_kg).toBe(200);
  });

  it("returns undefined with no match", () => {
    expect(matchBaseline({ exercise: "Calf raise" }, [{ exercise: "Bench", one_rm_kg: 100 }])).toBeUndefined();
  });
});

describe("applyAdjustments", () => {
  it("scales sets globally but leaves deload weeks alone", () => {
    const out = applyAdjustments(
      WEEKS,
      [
        {
          id: "readiness",
          kind: "global-volume",
          multiplier: 0.5,
          title: "",
          reason: "",
          effect: "",
          severity: "warn",
          defaultOn: true,
        },
      ],
      emptyHistory(),
    );
    expect(out[0].sessions[0].exercises[0].target_sets).toBe(2);
    expect(out[2].sessions[0].exercises[0].target_sets).toBe(4);
  });

  it("drops RPE during ramp-in weeks only", () => {
    const out = applyAdjustments(
      WEEKS,
      [
        {
          id: "ramp-in",
          kind: "ramp-in",
          multiplier: 0.8,
          rampWeeks: 1,
          title: "",
          reason: "",
          effect: "",
          severity: "warn",
          defaultOn: true,
        },
      ],
      emptyHistory(),
    );
    expect(out[0].sessions[0].exercises[0].target_rpe).toBe(7);
    expect(out[1].sessions[0].exercises[0].target_rpe).toBe(8);
  });

  it("prescribes weights from baselines", () => {
    const out = applyAdjustments(
      WEEKS,
      [
        {
          id: "loads",
          kind: "loads",
          title: "",
          reason: "",
          effect: "",
          severity: "info",
          defaultOn: true,
        },
      ],
      emptyHistory({ baselines: [{ exercise: "Back squat", one_rm_kg: 200 }] }),
    );
    const kg = out[0].sessions[0].exercises[0].target_weight_kg;
    expect(kg).toBeGreaterThan(100);
    expect(kg).toBeLessThan(200);
  });

  it("never scales sets below 1", () => {
    const out = applyAdjustments(
      WEEKS,
      [
        {
          id: "readiness",
          kind: "global-volume",
          multiplier: 0.05,
          title: "",
          reason: "",
          effect: "",
          severity: "warn",
          defaultOn: true,
        },
      ],
      emptyHistory(),
    );
    expect(out[0].sessions[0].exercises[0].target_sets).toBe(1);
  });
});

describe("coach tuning + distributed rounding", () => {
  const w: TemplateWeek = {
    week_index: 1,
    label: "Week 1",
    sessions: [
      {
        day_of_week: 1,
        title: "Squat day",
        exercises: [
          { exercise: "Back squat", target_sets: 4, target_reps: 5, target_rpe: 8, intensity_metric: "rpe" },
          { exercise: "Pause squat", target_sets: 3, target_reps: 5, target_rpe: 7, intensity_metric: "rpe" },
          { exercise: "Leg press", target_sets: 3, target_reps: 10, target_rpe: 8, intensity_metric: "rpe" },
        ],
      },
    ],
  };

  it("lands a small volume cut instead of rounding it away", () => {
    const out = applyAdjustments([w], [], emptyHistory(), { ...DEFAULT_TUNING, volume: 0.85 });
    const squatSets = out[0].sessions[0].exercises
      .slice(0, 2)
      .reduce((a, e) => a + e.target_sets, 0);
    expect(squatSets).toBe(6); // 7 * 0.85 = 5.95 -> 6
  });

  it("scales main lifts and accessories independently", () => {
    const out = applyAdjustments([w], [], emptyHistory(), {
      ...DEFAULT_TUNING,
      mainLifts: 1.3,
      accessory: 0.5,
    });
    const ex = out[0].sessions[0].exercises;
    expect(ex[0].target_sets + ex[1].target_sets).toBe(9); // 7 * 1.3 = 9.1
    expect(ex[2].target_sets).toBe(2); // 3 * 0.5 -> min-clamped rounding
  });

  it("shifts RPE by the intensity slider", () => {
    const out = applyAdjustments([w], [], emptyHistory(), { ...DEFAULT_TUNING, intensity: -1 });
    expect(out[0].sessions[0].exercises[0].target_rpe).toBe(7);
  });
});

describe("volume landmarks", () => {
  it("flags weekly sets above MRV", () => {
    const heavy: TemplateWeek = {
      week_index: 1,
      label: "Week 1",
      sessions: [
        {
          day_of_week: 1,
          title: "Squat",
          exercises: [
            { exercise: "Back squat", target_sets: 10, target_reps: 5, target_rpe: 8, intensity_metric: "rpe" },
            { exercise: "Pause squat", target_sets: 10, target_reps: 5, target_rpe: 8, intensity_metric: "rpe" },
            { exercise: "Front squat", target_sets: 8, target_reps: 5, target_rpe: 8, intensity_metric: "rpe" },
          ],
        },
      ],
    };
    const warn = volumeWarnings([heavy]);
    expect(warn.some((x) => x.category === "squat" && x.level === "above-mrv")).toBe(true);
  });

  it("is quiet on a sane week", () => {
    expect(volumeWarnings([week(1, "Week 1", 8)]).length).toBe(0);
  });
});

describe("exercise classifier coverage", () => {
  it("classifies common gym lifts", () => {
    const cases: Array<[string, string]> = [
      ["Military press", "vertical-press"],
      ["Landmine press", "vertical-press"],
      ["Glute-ham raise", "hamstrings"],
      ["Barbell shrug", "delts"],
      ["Goblet squat", "quads"],
      ["Sissy squat", "quads"],
      ["Hyperextension", "hamstrings"],
      ["JM press", "horizontal-press"],
      ["Machine chest press", "chest"],
      ["Hammer curl", "biceps"],
      ["Standing calf raise", "calves"],
      ["Pallof press", "core"],
    ];
    for (const [name, cat] of cases) {
      expect([name, volumeCategory({ exercise: name, variation: undefined })]).toEqual([name, cat]);
      expect(isUnclassified({ exercise: name, variation: undefined })).toBe(false);
    }
  });
});
