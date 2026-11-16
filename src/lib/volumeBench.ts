import type { TemplateExercise, TemplateSession, TemplateWeek } from "./strengthTemplates";

/**
 * Volymblock bänk (steg 8): fixed-dose 21-session bench block. Part 1 (sessions
 * 1–10) is light fixed percent with a lot of reps, part 2 (11–20) ramps to
 * rising top sets, session 21 is the max. No floors, guards, push, weak points,
 * builders, protocols, singles or history suggestions — only the coach's
 * template options and the athlete's deadlift stance.
 */
export const VOLUME_BENCH_ID = "volume-bench";
export const VOLUME_BENCH_SESSIONS = 21;
export type VolumeBenchSchedule = "every-other-day" | "three-per-week";
export interface VolumeBenchOptions {
  schedule: VolumeBenchSchedule;
  /** Sets of 10 in part 1 (5–10). */
  setDose: number;
  /** Session 1 gets 6 sets, session 2 gets 8, then the full dose. */
  rampIn: boolean;
  /** First part-1 session each week starts with an over-warm single @ RPE 7 (EAk measurement). */
  measureSingle: boolean;
  /** Squat 3 × 3 @ 7 in one session and deadlift 3 × 3 @ 7 in another each week, after bench. */
  maintenance: boolean;
}
export const DEFAULT_VOLUME_BENCH: VolumeBenchOptions = { schedule: "every-other-day", setDose: 10, rampIn: false, measureSingle: false, maintenance: false };

export const VB_PART1_NOTE = "5–6 minuter per set inklusive vila. Inget set till failure.";
export const VB_TOP_NOTE = "Toppset";
export const VB_RAMP_NOTE = "Upptrappning";
export const VB_BACK_NOTE = "Bakåtset";
export const VB_MAX_NOTE = "Maxning: arbeta upp enligt raderna och ta toppsinglen bara med godkänd teknik. Bästa klarade singel blir ett maxförslag som coachen godkänner.";
export const BACK_UP_SESSIONS = 3;
export const BACK_UP_ABSENCE_DAYS = 5;

type Step = [pct: number, sets: number, reps: number, top?: true];
/** Part 2 and the max, exactly as the document's table. */
export const VB_PART2: Step[][] = [
  [[42, 2, 15], [54, 2, 10], [62, 1, 5], [67, 3, 3], [72, 5, 1, true], [62, 1, 10]],
  [[42, 2, 15], [54, 2, 12], [62, 1, 8], [67, 1, 5], [72, 5, 5, true], [62, 2, 12]],
  [[42, 2, 15], [54, 2, 12], [62, 1, 8], [67, 1, 5], [72, 1, 5], [77, 5, 5, true], [62, 2, 12]],
  [[42, 2, 15], [54, 2, 10], [64, 2, 5], [72, 2, 3], [80, 2, 2], [83, 5, 1, true], [62, 2, 12]],
  [[42, 2, 15], [54, 2, 12], [64, 1, 8], [72, 1, 5], [78, 1, 3], [84, 3, 2, true], [50, 2, 20]],
  [[42, 2, 10], [52, 2, 8], [61, 2, 5], [69, 2, 3], [76, 2, 2], [82, 1, 1], [87, 3, 1, true], [60, 3, 12]],
  [[42, 2, 10], [54, 2, 8], [64, 2, 5], [73, 2, 3], [81, 2, 2], [85, 1, 1], [88, 3, 1, true], [75, 5, 3], [60, 3, 12]],
  [[42, 2, 12], [54, 2, 8], [64, 2, 5], [73, 1, 2], [81, 1, 1], [88, 1, 1], [93, 3, 1, true], [81, 2, 4], [70, 2, 8], [60, 2, 12]],
  [[42, 2, 10], [54, 2, 5], [64, 2, 3], [73, 1, 1], [81, 1, 1], [88, 1, 1], [93, 1, 1], [97, 1, 1, true], [93, 1, 1], [85, 5, 1], [70, 1, 10], [55, 1, 20]],
  [[42, 2, 10], [54, 2, 5], [62, 3, 1]],
  [[42, 2, 10], [54, 2, 5], [64, 2, 3], [73, 1, 1], [81, 1, 1], [88, 1, 1], [93, 1, 1], [98, 1, 1], [103, 1, 1, true]],
];

const BENCH = { exercise: "Bench press", variation: "Competition grip & pause" };
const ACC_NOTE = "3–5 set × 8–20 reps. Första setet lätt (RPE 6), sedan RPE 7–8.";
const acc = (exercise: string): TemplateExercise => ({ exercise, target_sets: 4, target_reps: 8, target_reps_max: 20, target_rpe: 7.5, intensity_metric: "rpe", notes: ACC_NOTE });
const A = ["Overhead press", "Lateral raise", "Reverse fly", "Cable triceps pushdown"];
const B = ["Lat pulldown", "Barbell row", "Face pull", "Biceps curl"];
/** Accessory order for sessions 1–18. */
export const VB_ACCESSORY_ORDER = "ABAABABABABABAABAB";
function accessories(session: number): TemplateExercise[] {
  if (session <= 18) return (VB_ACCESSORY_ORDER[session - 1] === "A" ? A : B).map(acc);
  if (session === 19) return [acc("Reverse fly")];
  if (session === 20) return [acc("Lat pulldown"), acc("Barbell row")];
  return [];
}

/** Weekday layout. day_of_week is zero-based when a week contains Monday (0) — see planned-session-dates. */
export function volumeBenchCalendar(schedule: VolumeBenchSchedule): number[][] {
  const weeks: number[][] = [];
  let left = VOLUME_BENCH_SESSIONS;
  for (let w = 0; left > 0; w++) {
    const days = schedule === "three-per-week" ? [1, 3, 5] : w % 2 === 0 ? [0, 2, 4, 6] : [2, 4, 6];
    weeks.push(days.slice(0, left));
    left -= Math.min(left, days.length);
  }
  return weeks;
}

function benchRows(session: number, o: VolumeBenchOptions, firstOfWeek: boolean): TemplateExercise[] {
  if (session <= 10) {
    const dose = Math.max(5, Math.min(10, Math.round(o.setDose)));
    const sets = o.rampIn && session === 1 ? Math.min(6, dose) : o.rampIn && session === 2 ? Math.min(8, dose) : dose;
    const single: TemplateExercise[] = o.measureSingle && firstOfWeek
      ? [{ ...BENCH, variation: "Over-warm single", target_sets: 1, target_reps: 1, target_rpe: 7, intensity_metric: "rpe", notes: "Mätsingel @ RPE 7 före bänkseten. Ger EAk ett mätset." }]
      : [];
    return [...single, { ...BENCH, target_sets: sets, target_reps: 10, target_pct: 58, rpe_cap: 8, intensity_metric: "rpe", notes: VB_PART1_NOTE }];
  }
  const steps = VB_PART2[session - 11];
  const topAt = steps.findIndex((s) => s[3]);
  return steps.map(([pct, sets, reps, top], i) => ({
    ...BENCH, target_sets: sets, target_reps: reps, target_pct: pct, intensity_metric: "rpe" as const,
    notes: top ? (session === 21 ? `${VB_TOP_NOTE}. ${VB_MAX_NOTE}` : VB_TOP_NOTE) : topAt >= 0 && i < topAt ? VB_RAMP_NOTE : topAt >= 0 ? VB_BACK_NOTE : undefined,
  }));
}

export function buildVolumeBenchWeeks(options: Partial<VolumeBenchOptions> = {}): TemplateWeek[] {
  const o = { ...DEFAULT_VOLUME_BENCH, ...options };
  let session = 0;
  return volumeBenchCalendar(o.schedule).map((days, wi) => {
    const start = session + 1;
    const sessions: TemplateSession[] = days.map((day, di) => {
      session += 1;
      const n = session;
      const maint: TemplateExercise[] = [];
      // Maintenance never lands on the last two sessions (opener day and max).
      if (o.maintenance && n <= 19) {
        const eligible = days.map((_, i) => start + i).filter((x) => x <= 19);
        if (n === eligible[0]) maint.push({ exercise: "Back squat", variation: "Competition stance", target_sets: 3, target_reps: 3, target_rpe: 7, intensity_metric: "rpe", notes: "Underhåll efter bänken." });
        if (eligible.length > 1 && n === eligible[eligible.length - 1]) maint.push({ exercise: "Deadlift", variation: "Competition stance", target_sets: 3, target_reps: 3, target_rpe: 7, intensity_metric: "rpe", notes: "Underhåll efter bänken." });
      }
      return {
        day_of_week: day,
        title: n === 21 ? "Pass 21 — maxning bänk" : `Pass ${n} — ${n <= 10 ? "volym bänk" : "toppset bänk"}`,
        notes: n <= 10 ? "Del 1: fast procent, mycket mängd." : n === 21 ? "Maxning." : "Del 2: stegrande toppset.",
        exercises: [...benchRows(n, o, di === 0 && n <= 10), ...maint, ...accessories(n)],
      };
    });
    return {
      week_index: wi + 1,
      kind: "working" as const,
      label: `Volymblock bänk v${wi + 1}`,
      notes: "Passen görs i ordning och hoppas aldrig över.",
      sessions,
    };
  });
}

/** Absence of five days or more suggests backing up three sessions (coach approves). */
export function suggestBackUp(lastTrainedISO: string | null, todayISO: string): boolean {
  if (!lastTrainedISO) return false;
  const days = Math.round((Date.parse(`${todayISO.slice(0, 10)}T00:00:00Z`) - Date.parse(`${lastTrainedISO.slice(0, 10)}T00:00:00Z`)) / 86400000);
  return days >= BACK_UP_ABSENCE_DAYS;
}
