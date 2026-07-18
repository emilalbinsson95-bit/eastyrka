// Strength program templates for coach inspiration.
// Inspired by: Milo Wolf (hypertrophy-forward, lengthened partials on isolations),
// Mike Tuscherer / RTS (autoregulated RPE, fatigue-aware progression),
// Josef Eriksson (Swedish powerlifting: technical high-frequency squats, competition specificity).
//
// All templates use RPE as the intensity metric and progress volume/intensity across weeks
// with a built-in deload on the final week. Everything is editable after generation.
//
// Frequency (days/week) is a first-class input: each template shapes its own session list
// for 3 / 4 / 5 / 6 days — condensing key work when frequency drops, adding targeted
// hypertrophy / weak-point days when it climbs. No blank "Day N" placeholders.

export type IntensityMetric = "rpe" | "rir";

export interface TemplateExercise {
  exercise: string;
  variation?: string;
  target_sets: number;
  target_reps: number;
  target_rpe?: number;
  target_rir?: number;
  intensity_metric: IntensityMetric;
  lengthened_partials?: boolean;
  last_set_to_failure?: boolean;
  notes?: string;
}

export interface TemplateSession {
  day_of_week: number; // 1 = Mon ... 7 = Sun — assigned by adapter
  title: string;
  notes?: string;
  exercises: TemplateExercise[];
}

export interface TemplateWeek {
  week_index: number; // 1-based
  label: string;
  notes?: string;
  sessions: TemplateSession[];
}

export interface StrengthTemplate {
  id: string;
  name: string;
  short: string;
  goal: string;
  weeks: number;
  daysPerWeek: number; // template default
  minDays: number;
  maxDays: number;
  inspiration: string;
  buildWeeks: (daysPerWeek: number) => TemplateWeek[];
}

// ---------- helpers ----------

const RPE_RAMP = [7, 8, 8.5, 6];
const rpe = (w: number, offset = 0) =>
  Math.max(6, (RPE_RAMP[w - 1] ?? 8) + offset);

// Weekday schedule per frequency — spread for recovery.
const DAY_SCHEDULES: Record<number, number[]> = {
  2: [1, 4],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 4, 5, 6],
  6: [1, 2, 3, 4, 5, 6],
};

function assignWeekdays(sessions: Omit<TemplateSession, "day_of_week">[]): TemplateSession[] {
  const n = sessions.length;
  const schedule = DAY_SCHEDULES[n] ?? DAY_SCHEDULES[4];
  return sessions.map((s, i) => ({ ...s, day_of_week: schedule[i] ?? i + 1 }));
}

// Volume scaler — when frequency drops we push a bit more work into remaining days
// (Tuscherer: MRV/day is elastic within ~20%); when it climbs we trim main-lift sets
// to leave room for the added session without blowing the weekly SFR budget.
function volumeScale(daysPerWeek: number, baseDays: number): number {
  if (daysPerWeek === baseDays) return 1;
  if (daysPerWeek < baseDays) return Math.min(1.25, 1 + 0.1 * (baseDays - daysPerWeek));
  return Math.max(0.8, 1 - 0.075 * (daysPerWeek - baseDays));
}

function scaleSets(sets: number, factor: number): number {
  return Math.max(2, Math.round(sets * factor));
}

function scaleExercises(exs: TemplateExercise[], factor: number): TemplateExercise[] {
  if (factor === 1) return exs;
  return exs.map((e) => ({ ...e, target_sets: scaleSets(e.target_sets, factor) }));
}

// Common accessory blocks
const backAccessory = (w: number): TemplateExercise[] => [
  {
    exercise: "Chest-supported row",
    target_sets: 3,
    target_reps: 10,
    target_rpe: rpe(w, -0.5),
    intensity_metric: "rpe",
    lengthened_partials: true,
    notes: "Wolf: last set lengthened partials to failure",
  },
  {
    exercise: "Lat pulldown",
    target_sets: 3,
    target_reps: 12,
    target_rpe: rpe(w, -0.5),
    intensity_metric: "rpe",
  },
];

const armsAccessory = (w: number): TemplateExercise[] => [
  {
    exercise: "Cable triceps pushdown",
    target_sets: 3,
    target_reps: 12,
    target_rpe: rpe(w, -0.5),
    intensity_metric: "rpe",
    lengthened_partials: true,
  },
  {
    exercise: "Incline dumbbell curl",
    target_sets: 3,
    target_reps: 12,
    target_rpe: rpe(w, -0.5),
    intensity_metric: "rpe",
    lengthened_partials: true,
  },
];

// Bonus hypertrophy/weak-point sessions used when frequency > base
const armsShouldersPump = (w: number): Omit<TemplateSession, "day_of_week"> => ({
  title: "Arms + Shoulders (pump)",
  notes: "Wolf-style pump session — high reps, controlled tempo, lengthened partials.",
  exercises: [
    { exercise: "Overhead press", variation: "Dumbbell seated", target_sets: 3, target_reps: 10, target_rpe: rpe(w, -0.5), intensity_metric: "rpe" },
    { exercise: "Lateral raise", target_sets: 4, target_reps: 15, target_rpe: rpe(w, -0.5), intensity_metric: "rpe", lengthened_partials: true },
    { exercise: "Skull crusher", target_sets: 3, target_reps: 12, target_rpe: rpe(w, -0.5), intensity_metric: "rpe", lengthened_partials: true },
    { exercise: "Incline dumbbell curl", target_sets: 3, target_reps: 12, target_rpe: rpe(w, -0.5), intensity_metric: "rpe", lengthened_partials: true },
  ],
});

const legsHypertrophy = (w: number): Omit<TemplateSession, "day_of_week"> => ({
  title: "Legs (hypertrophy)",
  notes: "Non-competition leg work — bring up quads/hamstrings without CNS cost.",
  exercises: [
    { exercise: "Bulgarian split squat", target_sets: 3, target_reps: 10, target_rpe: rpe(w, -0.5), intensity_metric: "rpe" },
    { exercise: "Leg press", target_sets: 4, target_reps: 12, target_rpe: rpe(w, -0.5), intensity_metric: "rpe", lengthened_partials: true },
    { exercise: "Leg curl", target_sets: 4, target_reps: 12, target_rpe: rpe(w, -0.5), intensity_metric: "rpe", lengthened_partials: true },
    { exercise: "Standing calf raise", target_sets: 3, target_reps: 12, target_rpe: rpe(w, -0.5), intensity_metric: "rpe", lengthened_partials: true },
  ],
});

const upperHypertrophy = (w: number): Omit<TemplateSession, "day_of_week"> => ({
  title: "Upper body (hypertrophy)",
  notes: "Chest / back / arms pump — low CNS cost, complements the strength days.",
  exercises: [
    { exercise: "Incline dumbbell press", target_sets: 3, target_reps: 10, target_rpe: rpe(w, -0.5), intensity_metric: "rpe", lengthened_partials: true },
    { exercise: "Chest-supported row", target_sets: 4, target_reps: 10, target_rpe: rpe(w, -0.5), intensity_metric: "rpe" },
    { exercise: "Cable chest fly", target_sets: 3, target_reps: 12, target_rpe: rpe(w, -0.5), intensity_metric: "rpe", lengthened_partials: true },
    { exercise: "Face pull", target_sets: 3, target_reps: 15, target_rpe: rpe(w, -1), intensity_metric: "rpe" },
  ],
});

const backHypertrophy = (w: number): Omit<TemplateSession, "day_of_week"> => ({
  title: "Back + rear delts (hypertrophy)",
  notes: "Antagonist volume for pressing programs — supports scap health and bar path.",
  exercises: [
    { exercise: "Weighted chin-up", target_sets: 4, target_reps: 6, target_rpe: rpe(w, -0.5), intensity_metric: "rpe", lengthened_partials: true },
    { exercise: "Chest-supported row", target_sets: 4, target_reps: 10, target_rpe: rpe(w, -0.5), intensity_metric: "rpe" },
    { exercise: "Face pull", target_sets: 3, target_reps: 15, target_rpe: rpe(w, -1), intensity_metric: "rpe" },
    { exercise: "Rear-delt cable fly", target_sets: 3, target_reps: 15, target_rpe: rpe(w, -0.5), intensity_metric: "rpe", lengthened_partials: true },
  ],
});

const posteriorChainAccessory = (w: number): Omit<TemplateSession, "day_of_week"> => ({
  title: "Posterior chain (accessory)",
  notes: "Hamstrings, glutes, low-back conditioning — bulletproof the pull.",
  exercises: [
    { exercise: "Romanian deadlift", target_sets: 4, target_reps: 8, target_rpe: rpe(w, -0.5), intensity_metric: "rpe", lengthened_partials: true },
    { exercise: "Back extension", target_sets: 3, target_reps: 12, target_rpe: rpe(w, -0.5), intensity_metric: "rpe" },
    { exercise: "Leg curl", target_sets: 3, target_reps: 12, target_rpe: rpe(w, -0.5), intensity_metric: "rpe", lengthened_partials: true },
    { exercise: "Weighted plank", target_sets: 3, target_reps: 30, target_rpe: rpe(w, -1), intensity_metric: "rpe", notes: "seconds" },
  ],
});

// Merge an "extra" session's top 1-2 exercises into an earlier day when frequency drops.
// Priority: keep the main compound; drop 3rd/4th accessories.
function mergeSessionInto(
  base: Omit<TemplateSession, "day_of_week">,
  extra: Omit<TemplateSession, "day_of_week">,
  factor: number,
): Omit<TemplateSession, "day_of_week"> {
  const carryover = extra.exercises.slice(0, 2).map((e) => ({
    ...e,
    target_sets: scaleSets(e.target_sets, 0.6), // half-ish, folded in
    notes: e.notes ? `${e.notes} (folded from ${extra.title})` : `Folded from ${extra.title}`,
  }));
  return {
    ...base,
    exercises: [...scaleExercises(base.exercises, factor), ...carryover],
    notes: base.notes
      ? `${base.notes} Folded in top work from ${extra.title}.`
      : `Folded in top work from ${extra.title}.`,
  };
}

// Generic adapter: given base sessions (in priority order) and bonus builders,
// produce exactly `daysPerWeek` sessions with weekday assignments.
function adaptSessions(
  base: Omit<TemplateSession, "day_of_week">[],
  bonusBuilders: Array<() => Omit<TemplateSession, "day_of_week">>,
  daysPerWeek: number,
): TemplateSession[] {
  const baseDays = base.length;
  const factor = volumeScale(daysPerWeek, baseDays);
  let out: Omit<TemplateSession, "day_of_week">[];

  if (daysPerWeek === baseDays) {
    out = base;
  } else if (daysPerWeek < baseDays) {
    // Merge trailing sessions into earlier ones (round-robin).
    const kept = base.slice(0, daysPerWeek).map((s) => ({ ...s, exercises: scaleExercises(s.exercises, factor) }));
    const dropped = base.slice(daysPerWeek);
    dropped.forEach((extra, i) => {
      const targetIdx = i % kept.length;
      kept[targetIdx] = mergeSessionInto(kept[targetIdx], extra, 1);
    });
    out = kept;
  } else {
    // More days than base — scale main sessions down slightly, add bonus sessions.
    const scaled = base.map((s) => ({ ...s, exercises: scaleExercises(s.exercises, factor) }));
    const need = daysPerWeek - baseDays;
    const bonuses: Omit<TemplateSession, "day_of_week">[] = [];
    for (let i = 0; i < need; i++) {
      const builder = bonusBuilders[i % bonusBuilders.length];
      if (builder) bonuses.push(builder());
    }
    out = [...scaled, ...bonuses];
  }

  return assignWeekdays(out);
}

// ---------- Template 1: Standard Powerlifting ----------

function standardPowerlifting(daysPerWeek: number): TemplateWeek[] {
  return [1, 2, 3, 4].map((w) => {
    const isDeload = w === 4;
    const label = isDeload ? "Deload" : `Accumulation ${w}`;
    const mainSets = isDeload ? 2 : w === 1 ? 3 : 4;
    const mainReps = isDeload ? 3 : w === 3 ? 3 : 5;

    const base: Omit<TemplateSession, "day_of_week">[] = [
      {
        title: "Squat + Bench (heavy)",
        notes: "Comp squat first — Eriksson-style technical priority.",
        exercises: [
          { exercise: "Back squat", variation: "Competition stance", target_sets: mainSets, target_reps: mainReps, target_rpe: rpe(w), intensity_metric: "rpe", notes: "Top set + back-off sets at same RPE" },
          { exercise: "Bench press", variation: "Competition grip & pause", target_sets: mainSets, target_reps: mainReps, target_rpe: rpe(w), intensity_metric: "rpe" },
          ...backAccessory(w),
        ],
      },
      {
        title: "Deadlift + Bench (volume)",
        exercises: [
          { exercise: "Deadlift", variation: "Competition stance", target_sets: mainSets, target_reps: mainReps, target_rpe: rpe(w), intensity_metric: "rpe", notes: "Reset each rep. Cut set if bar speed drops." },
          { exercise: "Bench press", variation: "Touch-and-go", target_sets: isDeload ? 2 : 4, target_reps: 8, target_rpe: rpe(w, -1), intensity_metric: "rpe" },
          ...armsAccessory(w),
        ],
      },
      {
        title: "Squat (volume) + Bench variation",
        exercises: [
          { exercise: "Back squat", variation: "Pause squat / tempo", target_sets: isDeload ? 2 : 4, target_reps: 5, target_rpe: rpe(w, -1), intensity_metric: "rpe", notes: "3s pause in the hole. ~85% of comp top set." },
          { exercise: "Close-grip bench", target_sets: isDeload ? 2 : 3, target_reps: 8, target_rpe: rpe(w, -1), intensity_metric: "rpe" },
          ...backAccessory(w),
        ],
      },
      {
        title: "Deadlift variation + Overhead",
        exercises: [
          { exercise: "Deficit deadlift", target_sets: isDeload ? 2 : 3, target_reps: 5, target_rpe: rpe(w, -1), intensity_metric: "rpe", notes: "1-2 inch deficit. Off the floor emphasis." },
          { exercise: "Overhead press", target_sets: 3, target_reps: 8, target_rpe: rpe(w, -0.5), intensity_metric: "rpe" },
          ...armsAccessory(w),
        ],
      },
    ];

    return {
      week_index: w,
      label,
      notes: isDeload
        ? "Tuscherer-style deload: cut volume ~50%, hold ~RPE 6. Recover CNS before next block."
        : `Week ${w}/3 accumulation. RPE ${RPE_RAMP[w - 1]}. Add ~2.5kg on top set if last set was ≤ target RPE.`,
      sessions: adaptSessions(base, [() => armsShouldersPump(w), () => legsHypertrophy(w)], daysPerWeek),
    };
  });
}

// ---------- Template 2: Squat Focus ----------

function squatFocus(daysPerWeek: number): TemplateWeek[] {
  return [1, 2, 3, 4].map((w) => {
    const isDeload = w === 4;
    const base: Omit<TemplateSession, "day_of_week">[] = [
      {
        title: "Heavy comp squat + Bench",
        exercises: [
          { exercise: "Back squat", variation: "Competition stance", target_sets: isDeload ? 2 : 4, target_reps: isDeload ? 3 : w === 3 ? 3 : 5, target_rpe: rpe(w), intensity_metric: "rpe" },
          { exercise: "Bench press", target_sets: isDeload ? 2 : 3, target_reps: 5, target_rpe: rpe(w, -0.5), intensity_metric: "rpe" },
          ...backAccessory(w),
        ],
      },
      {
        title: "Pause squat + Deadlift",
        exercises: [
          { exercise: "Pause squat", target_sets: isDeload ? 2 : 4, target_reps: 3, target_rpe: rpe(w, -0.5), intensity_metric: "rpe", notes: "3s pause. Technical rehearsal + bottom-position strength." },
          { exercise: "Deadlift", target_sets: isDeload ? 2 : 3, target_reps: 3, target_rpe: rpe(w, -0.5), intensity_metric: "rpe" },
          { exercise: "Bulgarian split squat", target_sets: 3, target_reps: 10, target_rpe: rpe(w, -1), intensity_metric: "rpe" },
        ],
      },
      {
        title: "Volume squat + Bench",
        exercises: [
          { exercise: "Back squat", variation: "High-bar or tempo", target_sets: isDeload ? 2 : 5, target_reps: 5, target_rpe: rpe(w, -1), intensity_metric: "rpe", notes: "~80% of comp top set." },
          { exercise: "Bench press", variation: "Touch-and-go", target_sets: 3, target_reps: 8, target_rpe: rpe(w, -0.5), intensity_metric: "rpe" },
          ...armsAccessory(w),
        ],
      },
      {
        title: "Squat accessories + Posterior chain",
        exercises: [
          { exercise: "Front squat", target_sets: isDeload ? 2 : 3, target_reps: 5, target_rpe: rpe(w, -0.5), intensity_metric: "rpe" },
          { exercise: "Romanian deadlift", target_sets: 3, target_reps: 8, target_rpe: rpe(w, -0.5), intensity_metric: "rpe", lengthened_partials: true },
          { exercise: "Leg curl", target_sets: 3, target_reps: 12, target_rpe: rpe(w, -0.5), intensity_metric: "rpe", lengthened_partials: true },
        ],
      },
    ];

    return {
      week_index: w,
      label: isDeload ? "Deload" : `Squat block W${w}`,
      notes: isDeload
        ? "Deload week — hold RPE 6, half the working sets."
        : "3× squat / week (Eriksson high-frequency). Rotate stance/tempo to spread joint stress.",
      sessions: adaptSessions(base, [() => upperHypertrophy(w), () => legsHypertrophy(w)], daysPerWeek),
    };
  });
}

// ---------- Template 3: Bench Focus ----------

function benchFocus(daysPerWeek: number): TemplateWeek[] {
  return [1, 2, 3, 4].map((w) => {
    const isDeload = w === 4;
    const base: Omit<TemplateSession, "day_of_week">[] = [
      {
        title: "Heavy comp bench + Squat",
        exercises: [
          { exercise: "Bench press", variation: "Competition grip & pause", target_sets: isDeload ? 2 : 5, target_reps: isDeload ? 3 : w === 3 ? 3 : 5, target_rpe: rpe(w), intensity_metric: "rpe" },
          { exercise: "Back squat", target_sets: isDeload ? 2 : 3, target_reps: 5, target_rpe: rpe(w, -0.5), intensity_metric: "rpe" },
          ...backAccessory(w),
        ],
      },
      {
        title: "Bench variation + Deadlift",
        exercises: [
          { exercise: "Close-grip bench", target_sets: isDeload ? 2 : 4, target_reps: 6, target_rpe: rpe(w, -0.5), intensity_metric: "rpe", notes: "Triceps + lockout emphasis." },
          { exercise: "Deadlift", target_sets: isDeload ? 2 : 3, target_reps: 3, target_rpe: rpe(w, -0.5), intensity_metric: "rpe" },
          ...armsAccessory(w),
        ],
      },
      {
        title: "Volume bench + Upper accessories",
        exercises: [
          { exercise: "Bench press", variation: "Touch-and-go", target_sets: isDeload ? 2 : 5, target_reps: 6, target_rpe: rpe(w, -1), intensity_metric: "rpe", notes: "Wolf-style: same movement, higher reps for hypertrophy." },
          { exercise: "Incline dumbbell press", target_sets: 3, target_reps: 10, target_rpe: rpe(w, -0.5), intensity_metric: "rpe", lengthened_partials: true },
          { exercise: "Chest-supported row", target_sets: 3, target_reps: 10, target_rpe: rpe(w, -0.5), intensity_metric: "rpe" },
        ],
      },
      {
        title: "Bench technique + Overhead",
        exercises: [
          { exercise: "Spoto press", target_sets: isDeload ? 2 : 4, target_reps: 4, target_rpe: rpe(w, -0.5), intensity_metric: "rpe", notes: "1cm off chest pause. Bar-path control." },
          { exercise: "Overhead press", target_sets: 3, target_reps: 6, target_rpe: rpe(w, -0.5), intensity_metric: "rpe" },
          { exercise: "Face pull", target_sets: 3, target_reps: 15, target_rpe: rpe(w, -1), intensity_metric: "rpe", notes: "Rear delt / cuff health." },
        ],
      },
    ];

    return {
      week_index: w,
      label: isDeload ? "Deload" : `Bench block W${w}`,
      notes: isDeload
        ? "Deload — keep bench technique via light singles, drop volume."
        : "3× bench / week. Comp bench heavy, variation for volume, accessories for weak points.",
      sessions: adaptSessions(base, [() => armsShouldersPump(w), () => backHypertrophy(w)], daysPerWeek),
    };
  });
}

// ---------- Template 4: Deadlift Focus ----------

function deadliftFocus(daysPerWeek: number): TemplateWeek[] {
  return [1, 2, 3, 4].map((w) => {
    const isDeload = w === 4;
    const base: Omit<TemplateSession, "day_of_week">[] = [
      {
        title: "Heavy comp deadlift + Bench",
        exercises: [
          { exercise: "Deadlift", variation: "Competition stance", target_sets: isDeload ? 2 : 4, target_reps: isDeload ? 2 : w === 3 ? 2 : 3, target_rpe: rpe(w), intensity_metric: "rpe", notes: "Reset each rep. Cut set on any rounding." },
          { exercise: "Bench press", target_sets: isDeload ? 2 : 3, target_reps: 5, target_rpe: rpe(w, -0.5), intensity_metric: "rpe" },
          ...backAccessory(w),
        ],
      },
      {
        title: "Squat + posterior chain",
        exercises: [
          { exercise: "Back squat", variation: "Low-bar", target_sets: isDeload ? 2 : 4, target_reps: 5, target_rpe: rpe(w, -0.5), intensity_metric: "rpe", notes: "Squat pattern carries deadlift starting strength." },
          { exercise: "Romanian deadlift", target_sets: isDeload ? 2 : 4, target_reps: 6, target_rpe: rpe(w, -0.5), intensity_metric: "rpe", lengthened_partials: true },
          { exercise: "Back extension", target_sets: 3, target_reps: 12, target_rpe: rpe(w, -0.5), intensity_metric: "rpe" },
        ],
      },
      {
        title: "Deadlift variation + Bench",
        exercises: [
          { exercise: "Deficit deadlift", target_sets: isDeload ? 2 : 4, target_reps: 3, target_rpe: rpe(w, -0.5), intensity_metric: "rpe", notes: "1-2 inch deficit. Bar off the floor speed." },
          { exercise: "Bench press", variation: "Touch-and-go", target_sets: 4, target_reps: 6, target_rpe: rpe(w, -0.5), intensity_metric: "rpe" },
          ...armsAccessory(w),
        ],
      },
      {
        title: "Lockout + upper back",
        exercises: [
          { exercise: "Block pull", variation: "2-inch block", target_sets: isDeload ? 2 : 3, target_reps: 3, target_rpe: rpe(w), intensity_metric: "rpe", notes: "Lockout overload. Heavier than comp pull." },
          { exercise: "Pendlay row", target_sets: 4, target_reps: 6, target_rpe: rpe(w, -0.5), intensity_metric: "rpe" },
          { exercise: "Weighted chin-up", target_sets: 3, target_reps: 6, target_rpe: rpe(w, -0.5), intensity_metric: "rpe", lengthened_partials: true },
        ],
      },
    ];

    return {
      week_index: w,
      label: isDeload ? "Deload" : `Deadlift block W${w}`,
      notes: isDeload
        ? "Deload — light singles to keep the pattern, no back-offs."
        : "2× pull / week + posterior chain. Deficit for off-the-floor, block/pause for lockout.",
      sessions: adaptSessions(base, [() => posteriorChainAccessory(w), () => upperHypertrophy(w)], daysPerWeek),
    };
  });
}

// ---------- Template 5: Bench Only + Accessories (base 3 days) ----------

function benchOnlyAccessories(daysPerWeek: number): TemplateWeek[] {
  return [1, 2, 3, 4].map((w) => {
    const isDeload = w === 4;
    const base: Omit<TemplateSession, "day_of_week">[] = [
      {
        title: "Heavy comp bench + Triceps",
        exercises: [
          { exercise: "Bench press", variation: "Competition grip & pause", target_sets: isDeload ? 2 : 5, target_reps: isDeload ? 3 : w === 3 ? 3 : 5, target_rpe: rpe(w), intensity_metric: "rpe" },
          { exercise: "Close-grip bench", target_sets: isDeload ? 2 : 3, target_reps: 6, target_rpe: rpe(w, -0.5), intensity_metric: "rpe" },
          { exercise: "Cable triceps pushdown", target_sets: 3, target_reps: 12, target_rpe: rpe(w, -0.5), intensity_metric: "rpe", lengthened_partials: true, last_set_to_failure: true },
          { exercise: "Chest-supported row", target_sets: 3, target_reps: 10, target_rpe: rpe(w, -0.5), intensity_metric: "rpe", notes: "Antagonist balance." },
        ],
      },
      {
        title: "Bench variation + Chest hypertrophy",
        exercises: [
          { exercise: "Spoto press", target_sets: isDeload ? 2 : 4, target_reps: 4, target_rpe: rpe(w, -0.5), intensity_metric: "rpe", notes: "1cm off chest pause — bar path & tightness." },
          { exercise: "Incline dumbbell press", target_sets: isDeload ? 2 : 4, target_reps: 10, target_rpe: rpe(w, -0.5), intensity_metric: "rpe", lengthened_partials: true },
          { exercise: "Cable chest fly", target_sets: 3, target_reps: 12, target_rpe: rpe(w, -0.5), intensity_metric: "rpe", lengthened_partials: true, notes: "Wolf: stretch at bottom, controlled tempo." },
          { exercise: "Face pull", target_sets: 3, target_reps: 15, target_rpe: rpe(w, -1), intensity_metric: "rpe" },
        ],
      },
      {
        title: "Volume bench + Overhead + Arms",
        exercises: [
          { exercise: "Bench press", variation: "Touch-and-go", target_sets: isDeload ? 2 : 5, target_reps: 6, target_rpe: rpe(w, -1), intensity_metric: "rpe" },
          { exercise: "Overhead press", target_sets: isDeload ? 2 : 3, target_reps: 6, target_rpe: rpe(w, -0.5), intensity_metric: "rpe", notes: "Shoulder health + lockout carryover." },
          { exercise: "Skull crusher", target_sets: 3, target_reps: 10, target_rpe: rpe(w, -0.5), intensity_metric: "rpe", lengthened_partials: true },
          { exercise: "Incline dumbbell curl", target_sets: 3, target_reps: 12, target_rpe: rpe(w, -0.5), intensity_metric: "rpe", lengthened_partials: true, notes: "Elbow health." },
        ],
      },
    ];

    return {
      week_index: w,
      label: isDeload ? "Deload" : `Bench-only W${w}`,
      notes: isDeload
        ? "Deload week."
        : "Bench-only specialization. Every session serves the press.",
      sessions: adaptSessions(base, [() => backHypertrophy(w), () => armsShouldersPump(w), () => upperHypertrophy(w)], daysPerWeek),
    };
  });
}

// ---------- Registry ----------

export const STRENGTH_TEMPLATES: StrengthTemplate[] = [
  {
    id: "standard-pl",
    name: "Standard powerlifting",
    short: "Balanced SBD — 3–6 days / 4 weeks",
    goal: "Balanced squat / bench / deadlift block. Each lift trained 2× per week at 4 days.",
    weeks: 4,
    daysPerWeek: 4,
    minDays: 3,
    maxDays: 6,
    inspiration: "Tuscherer RPE + Eriksson comp specificity",
    buildWeeks: standardPowerlifting,
  },
  {
    id: "squat-focus",
    name: "Squat focus",
    short: "3× squat/week — 3–6 days / 4 weeks",
    goal: "Bring up the squat with high-frequency technical work + volume block.",
    weeks: 4,
    daysPerWeek: 4,
    minDays: 3,
    maxDays: 6,
    inspiration: "Eriksson high-frequency squats + Tuscherer autoregulation",
    buildWeeks: squatFocus,
  },
  {
    id: "bench-focus",
    name: "Bench focus",
    short: "3× bench/week — 3–6 days / 4 weeks",
    goal: "Bring up the bench with variation, hypertrophy, and technique days.",
    weeks: 4,
    daysPerWeek: 4,
    minDays: 3,
    maxDays: 6,
    inspiration: "Wolf hypertrophy + Tuscherer RPE",
    buildWeeks: benchFocus,
  },
  {
    id: "deadlift-focus",
    name: "Deadlift focus",
    short: "2× pull + posterior — 3–6 days / 4 weeks",
    goal: "Bring up the deadlift — deficit for the floor, block pull for lockout, RDL volume.",
    weeks: 4,
    daysPerWeek: 4,
    minDays: 3,
    maxDays: 6,
    inspiration: "Eriksson pull technique + Tuscherer RPE",
    buildWeeks: deadliftFocus,
  },
  {
    id: "bench-only",
    name: "Bench only + accessories",
    short: "3× bench + assistance — 3–6 days / 4 weeks",
    goal: "Full bench specialization. Every session serves the press.",
    weeks: 4,
    daysPerWeek: 3,
    minDays: 3,
    maxDays: 6,
    inspiration: "Wolf hypertrophy + Tuscherer autoregulation",
    buildWeeks: benchOnlyAccessories,
  },
];

export function getTemplate(id: string): StrengthTemplate | undefined {
  return STRENGTH_TEMPLATES.find((t) => t.id === id);
}
