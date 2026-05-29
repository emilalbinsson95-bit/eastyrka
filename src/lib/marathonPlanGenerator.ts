// 20-week marathon plan generator.
// Hybrid Pfitzinger / Daniels / Seiler 80/20 — scaled by athlete VDOT (10k PB).
// Pure: returns a structure of sessions + steps. Persistence is done by the caller.

import { addDays, format } from "date-fns";

export type SessionType =
  | "easy"
  | "recovery"
  | "long"
  | "long_mp"
  | "medium_long"
  | "lt_tempo"
  | "vo2"
  | "strides"
  | "race"
  | "rest";

export interface PlannedStep {
  order_index: number;
  is_group: boolean;
  parent_local_id?: string; // local key linking children to a group within this session
  local_id?: string;
  repeat_count: number;
  discipline: "run" | null;
  duration_seconds: number | null;
  target_rpe: number | null;
  notes: string | null;
}

export interface PlannedSession {
  date: string; // YYYY-MM-DD
  weekIndex: number; // 1..20
  dayOfWeek: number; // 0=Mon
  type: SessionType;
  title: string;
  discipline: "run";
  mode: "quick" | "structured";
  planned_total_seconds: number;
  planned_avg_rpe: number;
  notes: string;
  steps: PlannedStep[];
}

export interface MarathonPlan {
  weeks: number;
  startDate: string;
  raceDate: string;
  sessions: PlannedSession[];
  weeklyVolumeMin: number[]; // length 20
  phaseLabels: string[]; // length 20
}

/* ------------------------------ Scaling ------------------------------ */

/** Athlete-fitness factor from 10k PB seconds. 1.0 ≈ 45 min 10k. */
function volumeFactor(tenKSeconds: number): number {
  // 35:00 → 1.30, 45:00 → 1.00, 55:00 → 0.75
  const factor = 1.0 + (2700 - tenKSeconds) / 3000;
  return Math.max(0.7, Math.min(1.4, factor));
}

/** Weekly volume in minutes for week N (1..20) at factor 1.0. */
const WEEKLY_MIN_BASE: number[] = [
  // Phase 1: Base (w1-4), deload w4
  280, 305, 330, 240,
  // Phase 2: LT/Endurance (w5-10), deload w8
  340, 365, 385, 290, 400, 420,
  // Phase 3: Race-specific (w11-15), deload w12
  440, 330, 450, 460, 440,
  // Phase 4: Sharpening (w16-18)
  420, 390, 350,
  // Phase 5: Taper (w19-20). Race week minutes include the race itself.
  260, 150,
];

const PHASE_LABELS: string[] = [
  ...Array(4).fill("Base"),
  ...Array(6).fill("Lactate Threshold"),
  ...Array(5).fill("Race-Specific"),
  ...Array(3).fill("Sharpening"),
  "Taper",
  "Race Week",
];

/* ------------------------------ Session builders ------------------------------ */

const MIN = 60;

function easyRun(totalMin: number, label = "Easy run"): PlannedSession["steps"] {
  return [
    {
      order_index: 0,
      is_group: false,
      repeat_count: 1,
      discipline: "run",
      duration_seconds: totalMin * MIN,
      target_rpe: 4,
      notes: label,
    },
  ];
}

function recoveryRun(totalMin: number): PlannedSession["steps"] {
  return [
    {
      order_index: 0,
      is_group: false,
      repeat_count: 1,
      discipline: "run",
      duration_seconds: totalMin * MIN,
      target_rpe: 3,
      notes: "Recovery — very easy, conversational",
    },
  ];
}

function longRun(totalMin: number): PlannedSession["steps"] {
  return [
    {
      order_index: 0,
      is_group: false,
      repeat_count: 1,
      discipline: "run",
      duration_seconds: totalMin * MIN,
      target_rpe: 5,
      notes: "Steady aerobic long run",
    },
  ];
}

/** Long run with marathon-pace block in the middle. */
function longRunWithMp(totalMin: number, mpMin: number): PlannedSession["steps"] {
  const warmup = Math.max(20, Math.round((totalMin - mpMin) * 0.55));
  const cooldown = Math.max(10, totalMin - warmup - mpMin);
  return [
    {
      order_index: 0,
      is_group: false,
      repeat_count: 1,
      discipline: "run",
      duration_seconds: warmup * MIN,
      target_rpe: 4,
      notes: "Easy aerobic warm-up",
    },
    {
      order_index: 1,
      is_group: false,
      repeat_count: 1,
      discipline: "run",
      duration_seconds: mpMin * MIN,
      target_rpe: 7,
      notes: `${mpMin} min at marathon pace (M)`,
    },
    {
      order_index: 2,
      is_group: false,
      repeat_count: 1,
      discipline: "run",
      duration_seconds: cooldown * MIN,
      target_rpe: 4,
      notes: "Easy cool-down",
    },
  ];
}

function ltTempo(repCount: number, repMin: number, restMin: number): PlannedSession["steps"] {
  const groupId = "g1";
  return [
    {
      order_index: 0,
      is_group: false,
      repeat_count: 1,
      discipline: "run",
      duration_seconds: 15 * MIN,
      target_rpe: 4,
      notes: "Warm-up easy",
    },
    {
      order_index: 1,
      is_group: true,
      local_id: groupId,
      repeat_count: repCount,
      discipline: "run",
      duration_seconds: null,
      target_rpe: null,
      notes: `${repCount} × ${repMin} min tempo @ T-pace, ${restMin} min jog recovery`,
    },
    {
      order_index: 0,
      parent_local_id: groupId,
      is_group: false,
      repeat_count: 1,
      discipline: "run",
      duration_seconds: repMin * MIN,
      target_rpe: 7.5,
      notes: "Tempo @ T-pace (comfortably hard)",
    },
    {
      order_index: 1,
      parent_local_id: groupId,
      is_group: false,
      repeat_count: 1,
      discipline: "run",
      duration_seconds: restMin * MIN,
      target_rpe: 3,
      notes: "Jog recovery",
    },
    {
      order_index: 2,
      is_group: false,
      repeat_count: 1,
      discipline: "run",
      duration_seconds: 10 * MIN,
      target_rpe: 4,
      notes: "Cool-down easy",
    },
  ];
}

function vo2Intervals(repCount: number, repSec: number, restSec: number): PlannedSession["steps"] {
  const groupId = "g1";
  return [
    {
      order_index: 0,
      is_group: false,
      repeat_count: 1,
      discipline: "run",
      duration_seconds: 15 * MIN,
      target_rpe: 4,
      notes: "Warm-up + 4×100m strides",
    },
    {
      order_index: 1,
      is_group: true,
      local_id: groupId,
      repeat_count: repCount,
      discipline: "run",
      duration_seconds: null,
      target_rpe: null,
      notes: `${repCount} × ${Math.round(repSec / 60)}min @ I-pace (3k-5k effort)`,
    },
    {
      order_index: 0,
      parent_local_id: groupId,
      is_group: false,
      repeat_count: 1,
      discipline: "run",
      duration_seconds: repSec,
      target_rpe: 9,
      notes: "Hard @ VO2max (I-pace)",
    },
    {
      order_index: 1,
      parent_local_id: groupId,
      is_group: false,
      repeat_count: 1,
      discipline: "run",
      duration_seconds: restSec,
      target_rpe: 3,
      notes: "Jog recovery",
    },
    {
      order_index: 2,
      is_group: false,
      repeat_count: 1,
      discipline: "run",
      duration_seconds: 10 * MIN,
      target_rpe: 4,
      notes: "Cool-down",
    },
  ];
}

function easyWithStrides(totalMin: number, strides: number): PlannedSession["steps"] {
  const groupId = "g1";
  return [
    {
      order_index: 0,
      is_group: false,
      repeat_count: 1,
      discipline: "run",
      duration_seconds: totalMin * MIN,
      target_rpe: 4,
      notes: "Easy aerobic",
    },
    {
      order_index: 1,
      is_group: true,
      local_id: groupId,
      repeat_count: strides,
      discipline: "run",
      duration_seconds: null,
      target_rpe: null,
      notes: `${strides} × strides ~20s @ R-pace, full walk recovery`,
    },
    {
      order_index: 0,
      parent_local_id: groupId,
      is_group: false,
      repeat_count: 1,
      discipline: "run",
      duration_seconds: 20,
      target_rpe: 9,
      notes: "Stride — relaxed near top speed",
    },
    {
      order_index: 1,
      parent_local_id: groupId,
      is_group: false,
      repeat_count: 1,
      discipline: "run",
      duration_seconds: 90,
      target_rpe: 2,
      notes: "Walk/jog recovery",
    },
  ];
}

/* ------------------------------ Weekly schedule ------------------------------ */

interface DaySlot {
  dayOfWeek: number;
  type: SessionType;
}

/** Default day-of-week assignments (Mon=0 … Sun=6). Race goes on Sunday of w20. */
function weeklySlots(daysPerWeek: 4 | 5 | 6, weekIndex: number): DaySlot[] {
  // Last week: race + light only
  if (weekIndex === 20) {
    return [
      { dayOfWeek: 1, type: "easy" }, // Tue 30min shakeout
      { dayOfWeek: 3, type: "easy" }, // Thu 30min + strides
      { dayOfWeek: 5, type: "recovery" }, // Sat 20min shake
      { dayOfWeek: 6, type: "race" }, // Sun race
    ];
  }
  if (daysPerWeek === 4) {
    return [
      { dayOfWeek: 1, type: "quality1" as unknown as SessionType },
      { dayOfWeek: 3, type: "medium_long" },
      { dayOfWeek: 5, type: "quality2" as unknown as SessionType },
      { dayOfWeek: 6, type: "long" },
    ];
  }
  if (daysPerWeek === 6) {
    return [
      { dayOfWeek: 0, type: "easy" },
      { dayOfWeek: 1, type: "quality1" as unknown as SessionType },
      { dayOfWeek: 2, type: "easy" },
      { dayOfWeek: 3, type: "medium_long" },
      { dayOfWeek: 5, type: "quality2" as unknown as SessionType },
      { dayOfWeek: 6, type: "long" },
    ];
  }
  // default 5 dpw
  return [
    { dayOfWeek: 1, type: "quality1" as unknown as SessionType },
    { dayOfWeek: 2, type: "easy" },
    { dayOfWeek: 3, type: "medium_long" },
    { dayOfWeek: 5, type: "quality2" as unknown as SessionType },
    { dayOfWeek: 6, type: "long" },
  ];
}

/** Resolve "quality1" / "quality2" placeholders to actual SessionType based on phase + week. */
function resolveQuality(slot: "quality1" | "quality2", weekIndex: number): SessionType {
  const phase = PHASE_LABELS[weekIndex - 1];
  if (phase === "Base") {
    // Tue strides session, Sat easy MLR substitute
    return slot === "quality1" ? "strides" : "easy";
  }
  if (phase === "Lactate Threshold") {
    return slot === "quality1" ? "lt_tempo" : (weekIndex % 2 === 0 ? "vo2" : "strides");
  }
  if (phase === "Race-Specific") {
    return slot === "quality1" ? "vo2" : "lt_tempo";
  }
  if (phase === "Sharpening") {
    return slot === "quality1" ? "lt_tempo" : "strides";
  }
  // Taper
  return "easy";
}

/* ------------------------------ Long run logic ------------------------------ */

function longRunMinutes(weekIndex: number, weeklyMin: number): number {
  // Long run = 28-34% of weekly volume, cap at 180 min
  const pct = weekIndex <= 4 ? 0.30 : weekIndex <= 15 ? 0.33 : 0.28;
  return Math.min(180, Math.max(60, Math.round(weeklyMin * pct / 5) * 5));
}

function isMpLongRun(weekIndex: number): { mp: boolean; mpMin: number } {
  // Race-specific phase: w11, w13, w14 get MP segments
  if (weekIndex === 11) return { mp: true, mpMin: 20 };
  if (weekIndex === 13) return { mp: true, mpMin: 30 };
  if (weekIndex === 14) return { mp: true, mpMin: 40 };
  if (weekIndex === 16) return { mp: true, mpMin: 30 };
  return { mp: false, mpMin: 0 };
}

/* ------------------------------ Main generator ------------------------------ */

function buildSession(
  date: string,
  weekIndex: number,
  dayOfWeek: number,
  type: SessionType,
  weeklyMin: number,
): PlannedSession {
  let steps: PlannedStep[] = [];
  let title = "";
  let totalSec = 0;
  let avgRpe = 4;
  let notes = "";
  let mode: "quick" | "structured" = "quick";

  // Distribute non-long, non-quality time evenly across remaining easy days
  switch (type) {
    case "easy": {
      const min = Math.max(35, Math.round(weeklyMin * 0.15 / 5) * 5);
      steps = easyRun(min);
      title = `Easy ${min} min`;
      totalSec = min * MIN;
      avgRpe = 4;
      notes = "Zone 1-2. Conversational pace.";
      break;
    }
    case "recovery": {
      steps = recoveryRun(25);
      title = "Recovery 25 min";
      totalSec = 25 * MIN;
      avgRpe = 3;
      notes = "Very easy shakeout.";
      break;
    }
    case "strides": {
      const easyMin = Math.max(40, Math.round(weeklyMin * 0.18 / 5) * 5);
      steps = easyWithStrides(easyMin, 6);
      title = `Easy ${easyMin} min + 6×strides`;
      totalSec = easyMin * MIN + 6 * (20 + 90);
      avgRpe = 4.5;
      notes = "Neuromuscular touch-up; strides relaxed and fast, full recovery.";
      mode = "structured";
      break;
    }
    case "medium_long": {
      const min = Math.max(60, Math.round(weeklyMin * 0.22 / 5) * 5);
      steps = easyRun(min, "Medium-long run");
      title = `MLR ${min} min`;
      totalSec = min * MIN;
      avgRpe = 5;
      notes = "Steady aerobic, slightly longer than typical easy run.";
      break;
    }
    case "lt_tempo": {
      // Progress reps: Base→Phase2 use 2x15, Phase2 late 2x20, Phase3 3x15 or 2x25
      const phase = PHASE_LABELS[weekIndex - 1];
      let reps = 2, repMin = 15, restMin = 3;
      if (phase === "Lactate Threshold" && weekIndex >= 9) { reps = 2; repMin = 20; }
      if (phase === "Race-Specific") { reps = 3; repMin = 15; restMin = 3; }
      if (phase === "Sharpening") { reps = 2; repMin = 15; restMin = 3; }
      steps = ltTempo(reps, repMin, restMin);
      title = `LT ${reps}×${repMin}min tempo`;
      totalSec = (15 + reps * (repMin + restMin) - restMin + 10) * MIN;
      avgRpe = 6;
      notes = "Threshold work — comfortably hard, ~lactate threshold (T-pace).";
      mode = "structured";
      break;
    }
    case "vo2": {
      const phase = PHASE_LABELS[weekIndex - 1];
      let reps = 5, repSec = 180, restSec = 180;
      if (phase === "Race-Specific") { reps = 6; repSec = 180; restSec = 150; }
      if (weekIndex >= 14) { reps = 5; repSec = 240; restSec = 180; }
      steps = vo2Intervals(reps, repSec, restSec);
      title = `VO2 ${reps}×${Math.round(repSec / 60)}min`;
      totalSec = 15 * MIN + reps * (repSec + restSec) + 10 * MIN;
      avgRpe = 6.5;
      notes = "High-intensity intervals at I-pace (3k-5k race effort).";
      mode = "structured";
      break;
    }
    case "long":
    case "long_mp": {
      const min = longRunMinutes(weekIndex, weeklyMin);
      const mp = isMpLongRun(weekIndex);
      if (mp.mp) {
        steps = longRunWithMp(min, mp.mpMin);
        title = `Long ${min} min w/ ${mp.mpMin}min @ MP`;
        avgRpe = 6;
        notes = `Long run with ${mp.mpMin} min at goal marathon pace — race-specific stimulus.`;
        mode = "structured";
      } else {
        steps = longRun(min);
        title = `Long ${min} min`;
        avgRpe = 5;
        notes = "Aerobic long run — steady, controlled.";
      }
      totalSec = min * MIN;
      break;
    }
    case "race": {
      steps = [
        {
          order_index: 0, is_group: false, repeat_count: 1, discipline: "run",
          duration_seconds: null, target_rpe: 8,
          notes: "Race day — execute the plan. Hydrate, pace early miles conservatively.",
        },
      ];
      title = "🏁 MARATHON RACE";
      totalSec = 0;
      avgRpe = 8;
      notes = "Goal race. Trust the work. Even or negative split.";
      break;
    }
    case "rest":
    default:
      steps = [];
      title = "Rest";
      totalSec = 0;
      avgRpe = 1;
      notes = "Rest or cross-train light.";
  }

  return {
    date,
    weekIndex,
    dayOfWeek,
    type,
    title,
    discipline: "run",
    mode,
    planned_total_seconds: totalSec,
    planned_avg_rpe: avgRpe,
    notes,
    steps,
  };
}

export function generate20WeekMarathonPlan(opts: {
  startMonday: string; // YYYY-MM-DD
  tenKPbSeconds: number; // athlete 10k PB
  daysPerWeek: 4 | 5 | 6;
}): MarathonPlan {
  const { startMonday, tenKPbSeconds, daysPerWeek } = opts;
  const factor = volumeFactor(tenKPbSeconds);
  const weeklyVolumeMin = WEEKLY_MIN_BASE.map((m) => Math.round(m * factor / 5) * 5);

  const sessions: PlannedSession[] = [];
  const startDate = new Date(startMonday + "T00:00:00");

  for (let w = 1; w <= 20; w++) {
    const weeklyMin = weeklyVolumeMin[w - 1];
    const slots = weeklySlots(daysPerWeek, w);

    for (const slot of slots) {
      const date = format(addDays(startDate, (w - 1) * 7 + slot.dayOfWeek), "yyyy-MM-dd");
      let type = slot.type as SessionType;
      if ((type as string) === "quality1") type = resolveQuality("quality1", w);
      if ((type as string) === "quality2") type = resolveQuality("quality2", w);
      sessions.push(buildSession(date, w, slot.dayOfWeek, type, weeklyMin));
    }
  }

  const raceDate = format(addDays(startDate, 19 * 7 + 6), "yyyy-MM-dd");

  return {
    weeks: 20,
    startDate: startMonday,
    raceDate,
    sessions,
    weeklyVolumeMin,
    phaseLabels: PHASE_LABELS,
  };
}
