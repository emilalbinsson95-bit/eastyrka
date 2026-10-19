// 20-week marathon plan generator.
// Hybrid Pfitzinger / Daniels / Seiler 80/20 — scaled by athlete fitness factor (10k PB).
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
  parent_local_id?: string;
  local_id?: string;
  repeat_count: number;
  discipline: "run" | null;
  duration_seconds: number | null;
  target_rpe: number | null;
  notes: string | null;
}

export interface PlannedSession {
  date: string;
  weekIndex: number;
  dayOfWeek: number;
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
  weeklyVolumeMin: number[];
  phaseLabels: string[];
}

/* ------------------------------ Scaling ------------------------------ */

/** Athlete fitness factor from 10k PB seconds. 1.0 ≈ 45 min 10k. */
function volumeFactor(tenKSeconds: number): number {
  const factor = 1.0 + (2700 - tenKSeconds) / 3000;
  return Math.max(0.7, Math.min(1.4, factor));
}

const WEEKLY_MIN_BASE: number[] = [
  280, 305, 330, 240,
  340, 365, 385, 290, 400, 420,
  440, 330, 450, 460, 440,
  420, 390, 350,
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
  return [{
    order_index: 0, is_group: false, repeat_count: 1, discipline: "run",
    duration_seconds: Math.max(0, totalMin) * MIN, target_rpe: 4, notes: label,
  }];
}

function recoveryRun(totalMin: number): PlannedSession["steps"] {
  return [{
    order_index: 0, is_group: false, repeat_count: 1, discipline: "run",
    duration_seconds: Math.max(0, totalMin) * MIN, target_rpe: 3, notes: "Recovery — very easy",
  }];
}

function longRunSteps(totalMin: number): PlannedSession["steps"] {
  return [{
    order_index: 0, is_group: false, repeat_count: 1, discipline: "run",
    duration_seconds: Math.max(0, totalMin) * MIN, target_rpe: 5, notes: "Steady aerobic long run",
  }];
}

function longRunWithMp(totalMin: number, mpMin: number): PlannedSession["steps"] {
  const warmup = Math.max(20, Math.round((totalMin - mpMin) * 0.55));
  const cooldown = Math.max(10, totalMin - warmup - mpMin);
  return [
    { order_index: 0, is_group: false, repeat_count: 1, discipline: "run", duration_seconds: warmup * MIN, target_rpe: 4, notes: "Warm-up" },
    { order_index: 1, is_group: false, repeat_count: 1, discipline: "run", duration_seconds: mpMin * MIN, target_rpe: 7, notes: `${mpMin} min @ MP` },
    { order_index: 2, is_group: false, repeat_count: 1, discipline: "run", duration_seconds: Math.max(0, cooldown) * MIN, target_rpe: 4, notes: "Cool-down" },
  ];
}

function ltTempo(repCount: number, repMin: number, restMin: number): PlannedSession["steps"] {
  const groupId = "g1";
  return [
    { order_index: 0, is_group: false, repeat_count: 1, discipline: "run", duration_seconds: 15 * MIN, target_rpe: 4, notes: "Warm-up" },
    { order_index: 1, is_group: true, local_id: groupId, repeat_count: repCount, discipline: "run", duration_seconds: null, target_rpe: null, notes: `Tempo reps` },
    { order_index: 0, parent_local_id: groupId, is_group: false, repeat_count: 1, discipline: "run", duration_seconds: repMin * MIN, target_rpe: 7.5, notes: "Tempo" },
    { order_index: 1, parent_local_id: groupId, is_group: false, repeat_count: 1, discipline: "run", duration_seconds: restMin * MIN, target_rpe: 3, notes: "Recovery jog" },
    { order_index: 2, is_group: false, repeat_count: 1, discipline: "run", duration_seconds: 10 * MIN, target_rpe: 4, notes: "Cool-down" },
  ];
}

function vo2Intervals(repCount: number, repSec: number, restSec: number): PlannedSession["steps"] {
  const groupId = "g1";
  return [
    { order_index: 0, is_group: false, repeat_count: 1, discipline: "run", duration_seconds: 15 * MIN, target_rpe: 4, notes: "Warm-up" },
    { order_index: 1, is_group: true, local_id: groupId, repeat_count: repCount, discipline: "run", duration_seconds: null, target_rpe: null, notes: `Intervals` },
    { order_index: 0, parent_local_id: groupId, is_group: false, repeat_count: 1, discipline: "run", duration_seconds: repSec, target_rpe: 9, notes: "Hard effort" },
    { order_index: 1, parent_local_id: groupId, is_group: false, repeat_count: 1, discipline: "run", duration_seconds: restSec, target_rpe: 3, notes: "Recovery jog" },
    { order_index: 2, is_group: false, repeat_count: 1, discipline: "run", duration_seconds: 10 * MIN, target_rpe: 4, notes: "Cool-down" },
  ];
}

function easyWithStrides(easyMin: number, strides: number): PlannedSession["steps"] {
  const groupId = "g1";
  return [
    { order_index: 0, is_group: false, repeat_count: 1, discipline: "run", duration_seconds: easyMin * MIN, target_rpe: 4, notes: "Easy aerobic" },
    { order_index: 1, is_group: true, local_id: groupId, repeat_count: strides, discipline: "run", duration_seconds: null, target_rpe: null, notes: "Strides" },
    { order_index: 0, parent_local_id: groupId, is_group: false, repeat_count: 1, discipline: "run", duration_seconds: 20, target_rpe: 9, notes: "Fast relaxed" },
    { order_index: 1, parent_local_id: groupId, is_group: false, repeat_count: 1, discipline: "run", duration_seconds: 90, target_rpe: 2, notes: "Walk/jog" },
  ];
}

/* ------------------------------ Weekly Logic ------------------------------ */

interface DaySlot {
  dayOfWeek: number;
  type: SessionType | "quality1" | "quality2";
}

function weeklySlots(daysPerWeek: 4 | 5 | 6, weekIndex: number): DaySlot[] {
  if (weekIndex === 20) {
    return [
      { dayOfWeek: 1, type: "easy" }, { dayOfWeek: 3, type: "easy" },
      { dayOfWeek: 5, type: "recovery" }, { dayOfWeek: 6, type: "race" },
    ];
  }
  const base: DaySlot[] = [
    { dayOfWeek: 1, type: "quality1" },
    { dayOfWeek: 3, type: "medium_long" },
    { dayOfWeek: 5, type: "quality2" },
    { dayOfWeek: 6, type: "long" },
  ];
  if (daysPerWeek >= 5) base.push({ dayOfWeek: 2, type: "easy" });
  if (daysPerWeek === 6) base.push({ dayOfWeek: 0, type: "easy" });
  return base.sort((a, b) => a.dayOfWeek - b.dayOfWeek);
}

function resolveQuality(slot: "quality1" | "quality2", weekIndex: number): SessionType {
  const isCutback = [4, 8, 12, 19].includes(weekIndex);
  if (isCutback && slot === "quality2") return "recovery";
  
  const phase = PHASE_LABELS[weekIndex - 1];
  if (phase === "Base") return slot === "quality1" ? "strides" : "easy";
  if (phase === "Lactate Threshold") return slot === "quality1" ? "lt_tempo" : (weekIndex % 2 === 0 ? "vo2" : "strides");
  if (phase === "Race-Specific") return slot === "quality1" ? "vo2" : "lt_tempo";
  if (phase === "Sharpening") return slot === "quality1" ? "lt_tempo" : "strides";
  return "easy";
}

function longRunMinutes(weekIndex: number, weeklyMin: number, factor: number): number {
  let pct = weekIndex <= 4 ? 0.30 : weekIndex <= 15 ? 0.33 : 0.28;
  if (factor < 0.9) pct += 0.05; // Slow runners need more % to hit distance
  const min = Math.round(weeklyMin * pct / 5) * 5;
  return Math.min(180, Math.max(75, min));
}

function isMpLongRun(weekIndex: number): { mp: boolean; mpMin: number } {
  if (weekIndex === 11) return { mp: true, mpMin: 20 };
  if (weekIndex === 13) return { mp: true, mpMin: 30 };
  if (weekIndex === 14) return { mp: true, mpMin: 40 };
  if (weekIndex === 16) return { mp: true, mpMin: 30 };
  return { mp: false, mpMin: 0 };
}

/* ------------------------------ Generator ------------------------------ */

function buildSession(
  date: string,
  weekIndex: number,
  dayOfWeek: number,
  type: SessionType,
  durationMin: number,
): PlannedSession {
  let steps: PlannedStep[] = [];
  let title = "";
  let avgRpe = 4;
  let notes = "";
  let mode: "quick" | "structured" = "quick";

  switch (type) {
    case "easy":
      steps = easyRun(durationMin);
      title = `Easy ${durationMin} min`;
      notes = "Zone 1-2. Conversational.";
      break;
    case "recovery":
      steps = recoveryRun(durationMin);
      title = `Recovery ${durationMin} min`;
      avgRpe = 3;
      notes = "Very easy shakeout.";
      break;
    case "strides":
      const easyMin = Math.max(0, durationMin - 11);
      steps = easyWithStrides(easyMin, 6);
      title = `Easy ${easyMin} min + 6×strides`;
      avgRpe = 4.5;
      mode = "structured";
      break;
    case "medium_long":
      steps = easyRun(durationMin, "Medium-long run");
      title = `MLR ${durationMin} min`;
      avgRpe = 5;
      notes = "Steady aerobic effort.";
      break;
    case "lt_tempo":
      const ltPhase = PHASE_LABELS[weekIndex - 1];
      let ltReps = 2, ltMin = 15, ltRest = 3;
      if (ltPhase === "Lactate Threshold" && weekIndex >= 9) { ltMin = 20; }
      else if (ltPhase === "Race-Specific") { ltReps = 3; ltMin = 15; }
      else if (ltPhase === "Sharpening") { ltMin = 15; }
      steps = ltTempo(ltReps, ltMin, ltRest);
      title = `LT ${ltReps}×${ltMin}min tempo`;
      avgRpe = 6;
      mode = "structured";
      durationMin = 15 + ltReps * (ltMin + ltRest) + 10;
      break;
    case "vo2":
      const vo2Phase = PHASE_LABELS[weekIndex - 1];
      let vReps = 5, vSec = 180, vRest = 180;
      if (vo2Phase === "Race-Specific") { vReps = 6; vRest = 150; }
      if (weekIndex >= 14) { vReps = 5; vSec = 240; }
      steps = vo2Intervals(vReps, vSec, vRest);
      title = `VO2 ${vReps}×${Math.round(vSec / 60)}min`;
      avgRpe = 6.5;
      mode = "structured";
      durationMin = 15 + (vReps * (vSec + vRest)) / 60 + 10;
      break;
    case "long":
    case "long_mp":
      const mp = isMpLongRun(weekIndex);
      if (mp.mp) {
        steps = longRunWithMp(durationMin, mp.mpMin);
        title = `Long ${durationMin} min w/ ${mp.mpMin}min @ MP`;
        avgRpe = 6;
        mode = "structured";
      } else {
        steps = longRunSteps(durationMin);
        title = `Long ${durationMin} min`;
        avgRpe = 5;
      }
      break;
    case "race":
      steps = [{ order_index: 0, is_group: false, repeat_count: 1, discipline: "run", duration_seconds: null, target_rpe: 8, notes: "Race day" }];
      title = "🏁 MARATHON RACE";
      avgRpe = 8;
      durationMin = 0;
      break;
    default:
      steps = []; title = "Rest"; avgRpe = 1; durationMin = 0;
  }

  return {
    date, weekIndex, dayOfWeek, type, title, discipline: "run", mode,
    planned_total_seconds: steps.filter((s) => !s.parent_local_id).reduce((total, step) => total + (step.is_group
      ? steps.filter((child) => child.parent_local_id === step.local_id).reduce((sum, child) => sum + (child.duration_seconds ?? 0) * child.repeat_count, 0) * step.repeat_count
      : (step.duration_seconds ?? 0) * step.repeat_count), 0),
    planned_avg_rpe: avgRpe, notes, steps,
  };
}

export function generate20WeekMarathonPlan(opts: {
  startMonday: string; tenKPbSeconds: number; daysPerWeek: 4 | 5 | 6; volumeAdjustment?: number;
}): MarathonPlan {
  const { startMonday, tenKPbSeconds, daysPerWeek, volumeAdjustment = 1.0 } = opts;
  const factor = volumeFactor(tenKPbSeconds) * Math.max(0.6, Math.min(1.2, volumeAdjustment));
  const weeklyVolumeMin = WEEKLY_MIN_BASE.map((m) => Math.round(m * factor / 5) * 5);

  const sessions: PlannedSession[] = [];
  const startDate = new Date(startMonday + "T00:00:00");

  for (let w = 1; w <= 20; w++) {
    const weeklyMin = weeklyVolumeMin[w - 1];
    const slots = weeklySlots(daysPerWeek, w);
    
    // Resolve types and durations to prevent overshoot
    const weekPlan: Array<{ dayOfWeek: number; type: SessionType; duration?: number }> = slots.map(slot => {
      const type = slot.type === "quality1" || slot.type === "quality2" ? resolveQuality(slot.type, w) : slot.type;
      return { ...slot, type: type === "long" && isMpLongRun(w).mp ? "long_mp" : type };
    });

    let fixedTotal = 0;
    for (const s of weekPlan) {
      if (["lt_tempo", "vo2", "race", "rest"].includes(s.type)) {
        s.duration = buildSession("", w, 0, s.type, 0).planned_total_seconds / 60;
        fixedTotal += s.duration;
      }
    }

    const longSession = weekPlan.find(s => s.type === "long" || s.type === "long_mp");
    if (longSession) {
      longSession.duration = longRunMinutes(w, weeklyMin, factor);
      fixedTotal += longSession.duration;
    }

    // Tävlingsvecka: loppet äter största delen av veckans tid — håll passen före loppet korta.
    if (w === 20) {
      for (const s of weekPlan) {
        if (s.type === "easy") s.duration = 35;
        else if (s.type === "recovery") s.duration = 25;
      }
    }
    const variableSessions = weekPlan.filter(s => s.duration === undefined);
    const weights: Record<string, number> = { easy: 1.0, medium_long: 1.3, strides: 1.1, recovery: 0.7 };
    const totalWeight = variableSessions.reduce((acc, s) => acc + (weights[s.type] || 1.0), 0);
    const remaining = Math.max(0, weeklyMin - fixedTotal - variableSessions.length * 20);
    let allocated = 0;

    for (const s of variableSessions) {
      const wgt = weights[s.type] || 1.0;
      s.duration = 20 + Math.floor(remaining * wgt / totalWeight);
      allocated += s.duration;
    }
    // Preserve the exact remaining budget, not independent rounding per day.
    let remainder = Math.round(Math.max(variableSessions.length * 20, weeklyMin - fixedTotal) - allocated);
    for (let idx = 0; remainder > 0 && variableSessions.length > 0; idx++, remainder--) {
      const slot = variableSessions[idx % variableSessions.length];
      slot.duration = (slot.duration ?? 20) + 1;
    }

    for (const s of weekPlan) {
      const date = format(addDays(startDate, (w - 1) * 7 + s.dayOfWeek), "yyyy-MM-dd");
      sessions.push(buildSession(date, w, s.dayOfWeek, s.type, s.duration || 0));
    }
    // Race duration is unknown; this is training time only, excluding the race.
    weeklyVolumeMin[w - 1] = sessions.filter((s) => s.weekIndex === w).reduce((sum, s) => sum + s.planned_total_seconds / 60, 0);
  }

  return {
    weeks: 20, startDate: startMonday, sessions, weeklyVolumeMin,
    raceDate: format(addDays(startDate, 19 * 7 + 6), "yyyy-MM-dd"),
    phaseLabels: PHASE_LABELS,
  };
}
