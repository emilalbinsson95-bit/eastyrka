// Strength program templates for coach inspiration.
// Inspired by: Milo Wolf (hypertrophy-forward, lengthened partials on isolations),
// Mike Tuscherer / RTS (autoregulated RPE, fatigue-aware progression),
// Josef Eriksson (Swedish powerlifting: technical high-frequency squats, competition specificity).
//
// All templates use RPE as the intensity metric and progress volume/intensity across weeks
// with a built-in deload on the final week. Everything is editable after generation.

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
  day_of_week: number; // 1 = Mon ... 7 = Sun
  title: string;
  notes?: string;
  exercises: TemplateExercise[];
}

export interface TemplateWeek {
  week_index: number; // 1-based
  label: string; // "Accumulation 1", "Deload", ...
  notes?: string;
  sessions: TemplateSession[];
}

export interface StrengthTemplate {
  id: string;
  name: string;
  short: string;
  goal: string;
  weeks: number;
  daysPerWeek: number;
  inspiration: string;
  buildWeeks: () => TemplateWeek[];
}

// ---------- helpers ----------

// RPE ramp across a 4-week block: 3 accumulation weeks + deload.
const RPE_RAMP = [7, 8, 8.5, 6];
const rpe = (w: number, offset = 0) =>
  Math.max(6, (RPE_RAMP[w - 1] ?? 8) + offset);

// Standard warmup/accessory building blocks
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

// ---------- Template 1: Standard Powerlifting (SBD balanced, 4 days) ----------

function standardPowerlifting(): TemplateWeek[] {
  return [1, 2, 3, 4].map((w) => {
    const isDeload = w === 4;
    const label = isDeload ? "Deload" : `Accumulation ${w}`;
    const mainSets = isDeload ? 2 : w === 1 ? 3 : w === 2 ? 4 : 4;
    const mainReps = isDeload ? 3 : w === 3 ? 3 : 5;

    return {
      week_index: w,
      label,
      notes: isDeload
        ? "Tuscherer-style deload: cut volume ~50%, hold ~RPE 6. Recover CNS before next block."
        : `Week ${w}/3 accumulation. RPE ${RPE_RAMP[w - 1]}. Add ~2.5kg on top set if last set was ≤ target RPE.`,
      sessions: [
        {
          day_of_week: 1,
          title: "Squat + Bench (heavy)",
          notes: "Comp squat first — Eriksson-style technical priority.",
          exercises: [
            {
              exercise: "Back squat",
              variation: "Competition stance",
              target_sets: mainSets,
              target_reps: mainReps,
              target_rpe: rpe(w),
              intensity_metric: "rpe",
              notes: "Top set + back-off sets at same RPE",
            },
            {
              exercise: "Bench press",
              variation: "Competition grip & pause",
              target_sets: mainSets,
              target_reps: mainReps,
              target_rpe: rpe(w),
              intensity_metric: "rpe",
            },
            ...backAccessory(w),
          ],
        },
        {
          day_of_week: 3,
          title: "Deadlift + Bench (volume)",
          exercises: [
            {
              exercise: "Deadlift",
              variation: "Competition stance",
              target_sets: mainSets,
              target_reps: mainReps,
              target_rpe: rpe(w),
              intensity_metric: "rpe",
              notes: "Reset each rep. Cut set if bar speed drops.",
            },
            {
              exercise: "Bench press",
              variation: "Touch-and-go",
              target_sets: isDeload ? 2 : 4,
              target_reps: 8,
              target_rpe: rpe(w, -1),
              intensity_metric: "rpe",
            },
            ...armsAccessory(w),
          ],
        },
        {
          day_of_week: 5,
          title: "Squat (volume) + Bench variation",
          exercises: [
            {
              exercise: "Back squat",
              variation: "Pause squat / tempo",
              target_sets: isDeload ? 2 : 4,
              target_reps: 5,
              target_rpe: rpe(w, -1),
              intensity_metric: "rpe",
              notes: "3s pause in the hole. Load ~85% of comp top set.",
            },
            {
              exercise: "Close-grip bench",
              target_sets: isDeload ? 2 : 3,
              target_reps: 8,
              target_rpe: rpe(w, -1),
              intensity_metric: "rpe",
            },
            ...backAccessory(w),
          ],
        },
        {
          day_of_week: 6,
          title: "Deadlift variation + Overhead",
          exercises: [
            {
              exercise: "Deficit deadlift",
              target_sets: isDeload ? 2 : 3,
              target_reps: 5,
              target_rpe: rpe(w, -1),
              intensity_metric: "rpe",
              notes: "1-2 inch deficit. Off the floor emphasis.",
            },
            {
              exercise: "Overhead press",
              target_sets: 3,
              target_reps: 8,
              target_rpe: rpe(w, -0.5),
              intensity_metric: "rpe",
            },
            ...armsAccessory(w),
          ],
        },
      ],
    };
  });
}

// ---------- Template 2: Squat Focus ----------

function squatFocus(): TemplateWeek[] {
  return [1, 2, 3, 4].map((w) => {
    const isDeload = w === 4;
    return {
      week_index: w,
      label: isDeload ? "Deload" : `Squat block W${w}`,
      notes: isDeload
        ? "Deload week — hold RPE 6, half the working sets."
        : "3× squat / week (Eriksson high-frequency). Rotate stance/tempo to spread joint stress.",
      sessions: [
        {
          day_of_week: 1,
          title: "Heavy comp squat + Bench",
          exercises: [
            {
              exercise: "Back squat",
              variation: "Competition stance",
              target_sets: isDeload ? 2 : 4,
              target_reps: isDeload ? 3 : w === 3 ? 3 : 5,
              target_rpe: rpe(w),
              intensity_metric: "rpe",
            },
            {
              exercise: "Bench press",
              target_sets: isDeload ? 2 : 3,
              target_reps: 5,
              target_rpe: rpe(w, -0.5),
              intensity_metric: "rpe",
            },
            ...backAccessory(w),
          ],
        },
        {
          day_of_week: 3,
          title: "Pause squat + Deadlift",
          exercises: [
            {
              exercise: "Pause squat",
              target_sets: isDeload ? 2 : 4,
              target_reps: 3,
              target_rpe: rpe(w, -0.5),
              intensity_metric: "rpe",
              notes: "3s pause. Technical rehearsal + bottom-position strength.",
            },
            {
              exercise: "Deadlift",
              target_sets: isDeload ? 2 : 3,
              target_reps: 3,
              target_rpe: rpe(w, -0.5),
              intensity_metric: "rpe",
            },
            {
              exercise: "Bulgarian split squat",
              target_sets: 3,
              target_reps: 10,
              target_rpe: rpe(w, -1),
              intensity_metric: "rpe",
              notes: "Unilateral balance work.",
            },
          ],
        },
        {
          day_of_week: 5,
          title: "Volume squat + Bench",
          exercises: [
            {
              exercise: "Back squat",
              variation: "High-bar or tempo",
              target_sets: isDeload ? 2 : 5,
              target_reps: 5,
              target_rpe: rpe(w, -1),
              intensity_metric: "rpe",
              notes: "~80% of comp top set. Focus on bar path.",
            },
            {
              exercise: "Bench press",
              variation: "Touch-and-go",
              target_sets: 3,
              target_reps: 8,
              target_rpe: rpe(w, -0.5),
              intensity_metric: "rpe",
            },
            ...armsAccessory(w),
          ],
        },
        {
          day_of_week: 6,
          title: "Squat accessories + Posterior chain",
          exercises: [
            {
              exercise: "Front squat",
              target_sets: isDeload ? 2 : 3,
              target_reps: 5,
              target_rpe: rpe(w, -0.5),
              intensity_metric: "rpe",
            },
            {
              exercise: "Romanian deadlift",
              target_sets: 3,
              target_reps: 8,
              target_rpe: rpe(w, -0.5),
              intensity_metric: "rpe",
              lengthened_partials: true,
            },
            {
              exercise: "Leg curl",
              target_sets: 3,
              target_reps: 12,
              target_rpe: rpe(w, -0.5),
              intensity_metric: "rpe",
              lengthened_partials: true,
            },
          ],
        },
      ],
    };
  });
}

// ---------- Template 3: Bench Focus ----------

function benchFocus(): TemplateWeek[] {
  return [1, 2, 3, 4].map((w) => {
    const isDeload = w === 4;
    return {
      week_index: w,
      label: isDeload ? "Deload" : `Bench block W${w}`,
      notes: isDeload
        ? "Deload — keep bench technique via light singles, drop volume."
        : "3× bench / week. Comp bench heavy, variation for volume, accessories for weak points.",
      sessions: [
        {
          day_of_week: 1,
          title: "Heavy comp bench + Squat",
          exercises: [
            {
              exercise: "Bench press",
              variation: "Competition grip & pause",
              target_sets: isDeload ? 2 : 5,
              target_reps: isDeload ? 3 : w === 3 ? 3 : 5,
              target_rpe: rpe(w),
              intensity_metric: "rpe",
            },
            {
              exercise: "Back squat",
              target_sets: isDeload ? 2 : 3,
              target_reps: 5,
              target_rpe: rpe(w, -0.5),
              intensity_metric: "rpe",
            },
            ...backAccessory(w),
          ],
        },
        {
          day_of_week: 3,
          title: "Bench variation + Deadlift",
          exercises: [
            {
              exercise: "Close-grip bench",
              target_sets: isDeload ? 2 : 4,
              target_reps: 6,
              target_rpe: rpe(w, -0.5),
              intensity_metric: "rpe",
              notes: "Triceps + lockout emphasis.",
            },
            {
              exercise: "Deadlift",
              target_sets: isDeload ? 2 : 3,
              target_reps: 3,
              target_rpe: rpe(w, -0.5),
              intensity_metric: "rpe",
            },
            ...armsAccessory(w),
          ],
        },
        {
          day_of_week: 5,
          title: "Volume bench + Upper accessories",
          exercises: [
            {
              exercise: "Bench press",
              variation: "Touch-and-go",
              target_sets: isDeload ? 2 : 5,
              target_reps: 6,
              target_rpe: rpe(w, -1),
              intensity_metric: "rpe",
              notes: "Wolf-style: same movement, higher reps for hypertrophy.",
            },
            {
              exercise: "Incline dumbbell press",
              target_sets: 3,
              target_reps: 10,
              target_rpe: rpe(w, -0.5),
              intensity_metric: "rpe",
              lengthened_partials: true,
            },
            {
              exercise: "Chest-supported row",
              target_sets: 3,
              target_reps: 10,
              target_rpe: rpe(w, -0.5),
              intensity_metric: "rpe",
            },
          ],
        },
        {
          day_of_week: 6,
          title: "Bench technique + Overhead",
          exercises: [
            {
              exercise: "Spoto press",
              target_sets: isDeload ? 2 : 4,
              target_reps: 4,
              target_rpe: rpe(w, -0.5),
              intensity_metric: "rpe",
              notes: "1cm off chest pause. Bar-path control.",
            },
            {
              exercise: "Overhead press",
              target_sets: 3,
              target_reps: 6,
              target_rpe: rpe(w, -0.5),
              intensity_metric: "rpe",
            },
            {
              exercise: "Face pull",
              target_sets: 3,
              target_reps: 15,
              target_rpe: rpe(w, -1),
              intensity_metric: "rpe",
              notes: "Rear delt / cuff health.",
            },
          ],
        },
      ],
    };
  });
}

// ---------- Template 4: Deadlift Focus ----------

function deadliftFocus(): TemplateWeek[] {
  return [1, 2, 3, 4].map((w) => {
    const isDeload = w === 4;
    return {
      week_index: w,
      label: isDeload ? "Deload" : `Deadlift block W${w}`,
      notes: isDeload
        ? "Deload — light singles to keep the pattern, no back-offs."
        : "2× pull / week + posterior chain. Deficit for off-the-floor, block/pause for lockout.",
      sessions: [
        {
          day_of_week: 1,
          title: "Heavy comp deadlift + Bench",
          exercises: [
            {
              exercise: "Deadlift",
              variation: "Competition stance",
              target_sets: isDeload ? 2 : 4,
              target_reps: isDeload ? 2 : w === 3 ? 2 : 3,
              target_rpe: rpe(w),
              intensity_metric: "rpe",
              notes: "Reset each rep. Cut set on any rounding.",
            },
            {
              exercise: "Bench press",
              target_sets: isDeload ? 2 : 3,
              target_reps: 5,
              target_rpe: rpe(w, -0.5),
              intensity_metric: "rpe",
            },
            ...backAccessory(w),
          ],
        },
        {
          day_of_week: 3,
          title: "Squat + posterior chain",
          exercises: [
            {
              exercise: "Back squat",
              variation: "Low-bar",
              target_sets: isDeload ? 2 : 4,
              target_reps: 5,
              target_rpe: rpe(w, -0.5),
              intensity_metric: "rpe",
              notes: "Squat pattern carries deadlift starting strength.",
            },
            {
              exercise: "Romanian deadlift",
              target_sets: isDeload ? 2 : 4,
              target_reps: 6,
              target_rpe: rpe(w, -0.5),
              intensity_metric: "rpe",
              lengthened_partials: true,
            },
            {
              exercise: "Back extension",
              target_sets: 3,
              target_reps: 12,
              target_rpe: rpe(w, -0.5),
              intensity_metric: "rpe",
            },
          ],
        },
        {
          day_of_week: 5,
          title: "Deadlift variation + Bench",
          exercises: [
            {
              exercise: "Deficit deadlift",
              target_sets: isDeload ? 2 : 4,
              target_reps: 3,
              target_rpe: rpe(w, -0.5),
              intensity_metric: "rpe",
              notes: "1-2 inch deficit. Bar off the floor speed.",
            },
            {
              exercise: "Bench press",
              variation: "Touch-and-go",
              target_sets: 4,
              target_reps: 6,
              target_rpe: rpe(w, -0.5),
              intensity_metric: "rpe",
            },
            ...armsAccessory(w),
          ],
        },
        {
          day_of_week: 6,
          title: "Lockout + upper back",
          exercises: [
            {
              exercise: "Block pull",
              variation: "2-inch block",
              target_sets: isDeload ? 2 : 3,
              target_reps: 3,
              target_rpe: rpe(w),
              intensity_metric: "rpe",
              notes: "Lockout overload. Heavier than comp pull.",
            },
            {
              exercise: "Pendlay row",
              target_sets: 4,
              target_reps: 6,
              target_rpe: rpe(w, -0.5),
              intensity_metric: "rpe",
            },
            {
              exercise: "Weighted chin-up",
              target_sets: 3,
              target_reps: 6,
              target_rpe: rpe(w, -0.5),
              intensity_metric: "rpe",
              lengthened_partials: true,
            },
          ],
        },
      ],
    };
  });
}

// ---------- Template 5: Bench Only + Accessories (3 days) ----------

function benchOnlyAccessories(): TemplateWeek[] {
  return [1, 2, 3, 4].map((w) => {
    const isDeload = w === 4;
    return {
      week_index: w,
      label: isDeload ? "Deload" : `Bench-only W${w}`,
      notes: isDeload
        ? "Deload week."
        : "Bench-only specialization. Every session is a bench day; accessories chosen to feed the press.",
      sessions: [
        {
          day_of_week: 1,
          title: "Heavy comp bench + Triceps",
          exercises: [
            {
              exercise: "Bench press",
              variation: "Competition grip & pause",
              target_sets: isDeload ? 2 : 5,
              target_reps: isDeload ? 3 : w === 3 ? 3 : 5,
              target_rpe: rpe(w),
              intensity_metric: "rpe",
            },
            {
              exercise: "Close-grip bench",
              target_sets: isDeload ? 2 : 3,
              target_reps: 6,
              target_rpe: rpe(w, -0.5),
              intensity_metric: "rpe",
            },
            {
              exercise: "Cable triceps pushdown",
              target_sets: 3,
              target_reps: 12,
              target_rpe: rpe(w, -0.5),
              intensity_metric: "rpe",
              lengthened_partials: true,
              last_set_to_failure: true,
            },
            {
              exercise: "Chest-supported row",
              target_sets: 3,
              target_reps: 10,
              target_rpe: rpe(w, -0.5),
              intensity_metric: "rpe",
              notes: "Antagonist balance.",
            },
          ],
        },
        {
          day_of_week: 3,
          title: "Bench variation + Chest hypertrophy",
          exercises: [
            {
              exercise: "Spoto press",
              target_sets: isDeload ? 2 : 4,
              target_reps: 4,
              target_rpe: rpe(w, -0.5),
              intensity_metric: "rpe",
              notes: "1cm off chest pause — bar path & tightness.",
            },
            {
              exercise: "Incline dumbbell press",
              target_sets: isDeload ? 2 : 4,
              target_reps: 10,
              target_rpe: rpe(w, -0.5),
              intensity_metric: "rpe",
              lengthened_partials: true,
            },
            {
              exercise: "Cable chest fly",
              target_sets: 3,
              target_reps: 12,
              target_rpe: rpe(w, -0.5),
              intensity_metric: "rpe",
              lengthened_partials: true,
              notes: "Wolf: stretch at bottom, controlled tempo.",
            },
            {
              exercise: "Face pull",
              target_sets: 3,
              target_reps: 15,
              target_rpe: rpe(w, -1),
              intensity_metric: "rpe",
            },
          ],
        },
        {
          day_of_week: 5,
          title: "Volume bench + Overhead + Arms",
          exercises: [
            {
              exercise: "Bench press",
              variation: "Touch-and-go",
              target_sets: isDeload ? 2 : 5,
              target_reps: 6,
              target_rpe: rpe(w, -1),
              intensity_metric: "rpe",
            },
            {
              exercise: "Overhead press",
              target_sets: isDeload ? 2 : 3,
              target_reps: 6,
              target_rpe: rpe(w, -0.5),
              intensity_metric: "rpe",
              notes: "Shoulder health + lockout carryover.",
            },
            {
              exercise: "Skull crusher",
              target_sets: 3,
              target_reps: 10,
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
              notes: "Elbow health.",
            },
          ],
        },
      ],
    };
  });
}

// ---------- Registry ----------

export const STRENGTH_TEMPLATES: StrengthTemplate[] = [
  {
    id: "standard-pl",
    name: "Standard powerlifting",
    short: "Balanced SBD — 4 days / 4 weeks",
    goal: "Balanced squat / bench / deadlift block. Each lift trained 2× per week.",
    weeks: 4,
    daysPerWeek: 4,
    inspiration: "Tuscherer RPE + Eriksson comp specificity",
    buildWeeks: standardPowerlifting,
  },
  {
    id: "squat-focus",
    name: "Squat focus",
    short: "3× squat/week — 4 days / 4 weeks",
    goal: "Bring up the squat with high-frequency technical work + volume block.",
    weeks: 4,
    daysPerWeek: 4,
    inspiration: "Eriksson high-frequency squats + Tuscherer autoregulation",
    buildWeeks: squatFocus,
  },
  {
    id: "bench-focus",
    name: "Bench focus",
    short: "3× bench/week — 4 days / 4 weeks",
    goal: "Bring up the bench with variation, hypertrophy, and technique days.",
    weeks: 4,
    daysPerWeek: 4,
    inspiration: "Wolf hypertrophy + Tuscherer RPE",
    buildWeeks: benchFocus,
  },
  {
    id: "deadlift-focus",
    name: "Deadlift focus",
    short: "2× pull + posterior — 4 days / 4 weeks",
    goal: "Bring up the deadlift — deficit for the floor, block pull for lockout, RDL volume.",
    weeks: 4,
    daysPerWeek: 4,
    inspiration: "Eriksson pull technique + Tuscherer RPE",
    buildWeeks: deadliftFocus,
  },
  {
    id: "bench-only",
    name: "Bench only + accessories",
    short: "3× bench + assistance — 3 days / 4 weeks",
    goal: "Full bench specialization. Every session serves the press.",
    weeks: 4,
    daysPerWeek: 3,
    inspiration: "Wolf hypertrophy + Tuscherer autoregulation",
    buildWeeks: benchOnlyAccessories,
  },
];

export function getTemplate(id: string): StrengthTemplate | undefined {
  return STRENGTH_TEMPLATES.find((t) => t.id === id);
}
