// Overload options — coach-selectable modifiers applied on top of a generated
// strength template (after individualisation, before the plan is written).
//
// Four levers, all optional:
//  1. Heavy over-warm singles (RPE 8) before working sets — neural familiarity
//     with heavier bar speeds without adding meaningful fatigue.
//  2. Commit to one deadlift stance — stop splitting main-stance adaptations;
//     the second pull of the week becomes a secondary builder (deficit / RDL).
//  3. Structured wave loading — replace flat weekly prescriptions with a 3-week
//     undulating wave (5s → 4s → 3s/2s) ahead of the deload.
//  4. Reduce weekly bench redundancy — consolidate bench work into at most
//     three clearly differentiated days instead of four semi-heavy ones.

import type { TemplateExercise, TemplateSession, TemplateWeek } from "./strengthTemplates";

export type DeadliftStance = "keep" | "conventional" | "sumo";

export interface OverloadOptions {
  overWarmSingles: boolean;
  deadliftStance: DeadliftStance;
  waveLoading: boolean;
  benchConsolidation: boolean;
}

export const DEFAULT_OVERLOAD: OverloadOptions = {
  overWarmSingles: false,
  deadliftStance: "keep",
  waveLoading: false,
  benchConsolidation: false,
};

export function overloadTouched(o: OverloadOptions): boolean {
  return (
    o.overWarmSingles || o.waveLoading || o.benchConsolidation || o.deadliftStance !== "keep"
  );
}

// ---------- lift identification ----------

type MainLift = "squat" | "bench" | "deadlift";

const OVER_WARM_VARIATION = "Over-warm single";

function text(e: Pick<TemplateExercise, "exercise" | "variation">): string {
  return `${e.exercise} ${e.variation ?? ""}`.toLowerCase();
}

/** Competition-style main lift, i.e. the barbell movement itself — not a variation. */
export function mainLift(e: Pick<TemplateExercise, "exercise" | "variation">): MainLift | null {
  const name = e.exercise.toLowerCase();
  if (/^(back squat|squat|comp squat)$/.test(name)) return "squat";
  if (/^(bench press|comp bench)$/.test(name)) return "bench";
  if (/^(deadlift|conventional deadlift|sumo deadlift)$/.test(name)) return "deadlift";
  return null;
}

/** Any bench-pattern pressing work that competes for weekly bench volume. */
function isBenchWork(e: TemplateExercise): boolean {
  return /bench press|close.?grip bench|spoto|board press|pin press|floor press|larsen/.test(
    text(e),
  );
}

function isDeadliftPattern(e: TemplateExercise): boolean {
  return /deadlift|block pull|rack pull|deficit/.test(text(e));
}

function isDeloadWeek(w: TemplateWeek): boolean {
  return /deload/i.test(w.label) || /deload/i.test(w.notes ?? "");
}

function mapSessions(
  week: TemplateWeek,
  fn: (s: TemplateSession) => TemplateSession,
): TemplateWeek {
  return { ...week, sessions: week.sessions.map(fn) };
}

function appendNote(existing: string | undefined, add: string): string {
  return existing ? `${existing} ${add}` : add;
}

// ---------- 1. over-warm singles ----------

function withOverWarmSingles(week: TemplateWeek): TemplateWeek {
  if (isDeloadWeek(week)) return week;
  return mapSessions(week, (s) => {
    const idx = s.exercises.findIndex(
      (e) =>
        mainLift(e) !== null &&
        e.target_reps >= 2 &&
        (e.variation ?? "") !== OVER_WARM_VARIATION &&
        !/touch.?and.?go|tempo|pause squat|high.?bar/i.test(e.variation ?? ""),
    );
    if (idx === -1) return s;
    const target = s.exercises[idx];
    const single: TemplateExercise = {
      exercise: target.exercise,
      variation: OVER_WARM_VARIATION,
      target_sets: 1,
      target_reps: 1,
      target_rpe: 8,
      intensity_metric: "rpe",
      notes:
        "Work up to one clean single @ RPE 8 (~90–92%) before the working sets. Stop the ramp if bar speed or technique drops — this is neural practice, not a max.",
    };
    const exercises = [...s.exercises];
    exercises.splice(idx, 0, single);
    return { ...s, exercises };
  });
}

// ---------- 2. commit to one deadlift stance ----------

const STANCE_LABEL: Record<Exclude<DeadliftStance, "keep">, string> = {
  conventional: "Conventional stance",
  sumo: "Sumo stance",
};

function withStanceCommitment(week: TemplateWeek, stance: Exclude<DeadliftStance, "keep">): TemplateWeek {
  const label = STANCE_LABEL[stance];
  let mainPullSeen = 0;
  const sessions = week.sessions.map((s) => {
    const exercises = s.exercises.map((e) => {
      if (mainLift(e) === "deadlift") {
        mainPullSeen += 1;
        if (mainPullSeen === 1) {
          return { ...e, variation: label };
        }
        // Secondary pull becomes a builder instead of a second main-stance session.
        return {
          ...e,
          exercise: "Romanian deadlift",
          variation: label,
          target_reps: Math.max(6, e.target_reps + 3),
          target_rpe: e.target_rpe != null ? Math.max(6, e.target_rpe - 0.5) : e.target_rpe,
          lengthened_partials: true,
          notes:
            "Secondary builder — stance committed, so this trains the pull without a second heavy main-stance session.",
        };
      }
      if (isDeadliftPattern(e) && /deficit|block pull|rack pull/i.test(text(e))) {
        return { ...e, variation: e.variation ? `${e.variation} · ${label}` : label };
      }
      return e;
    });
    return { ...s, exercises };
  });
  return {
    ...week,
    notes: appendNote(
      week.notes,
      `Stance committed: ${label.toLowerCase()} for the whole block (8–12 weeks recommended). Secondary pulls are RDL / deficit, not the other stance.`,
    ),
    sessions,
  };
}

// ---------- 3. structured wave loading ----------

interface WaveStep {
  reps: number;
  deadliftReps: number;
  rpe: number;
  pct: string;
}

const WAVE: WaveStep[] = [
  { reps: 5, deadliftReps: 4, rpe: 7, pct: "70–75%" },
  { reps: 4, deadliftReps: 3, rpe: 8, pct: "77–82%" },
  { reps: 3, deadliftReps: 2, rpe: 8.5, pct: "85%+" },
];

function withWaveLoading(week: TemplateWeek, workingIndex: number): TemplateWeek {
  const step = WAVE[workingIndex % WAVE.length];
  const out = mapSessions(week, (s) => ({
    ...s,
    exercises: s.exercises.map((e) => {
      const lift = mainLift(e);
      if (!lift) return e;
      if ((e.variation ?? "") === OVER_WARM_VARIATION) return e;
      // Leave dedicated hypertrophy prescriptions (8+ reps) alone.
      if (e.target_reps > 6) return e;
      const reps = lift === "deadlift" ? step.deadliftReps : step.reps;
      return {
        ...e,
        target_reps: reps,
        target_rpe: step.rpe,
        target_rir: undefined,
        intensity_metric: "rpe" as const,
        notes: appendNote(e.notes, `Wave week ${workingIndex + 1}: ${reps}s @ ~${step.pct}.`),
      };
    }),
  }));
  return {
    ...out,
    label: `${out.label} · Wave ${workingIndex + 1}`,
    notes: appendNote(
      out.notes,
      `Wave loading week ${workingIndex + 1}/3 — main lifts ${step.reps}s @ ~${step.pct} (RPE ${step.rpe}).`,
    ),
  };
}

// ---------- 4. bench consolidation ----------

type BenchRole = "heavy" | "volume" | "triceps";

function benchRoleTitle(role: BenchRole): string {
  return role === "heavy"
    ? "Heavy competition pause"
    : role === "volume"
      ? "Hypertrophy / volume"
      : "Close-grip / triceps";
}

function shapeBench(e: TemplateExercise, role: BenchRole): TemplateExercise {
  if (role === "heavy") {
    return {
      ...e,
      exercise: "Bench press",
      variation: "Competition grip & pause",
      notes: appendNote(e.notes, "Heavy comp-pause day — the only maximal bench of the week."),
    };
  }
  if (role === "volume") {
    return {
      ...e,
      exercise: "Bench press",
      variation: "Touch-and-go",
      target_reps: Math.max(8, e.target_reps),
      target_rpe: e.target_rpe != null ? Math.max(6, Math.min(e.target_rpe, 8) - 1) : 7,
      intensity_metric: "rpe",
      notes: appendNote(e.notes, "Hypertrophy day — reps and control, not load."),
    };
  }
  return {
    ...e,
    exercise: "Close-grip bench",
    variation: undefined,
    target_reps: Math.max(6, e.target_reps),
    target_rpe: e.target_rpe != null ? Math.max(6, Math.min(e.target_rpe, 8.5) - 0.5) : 7.5,
    intensity_metric: "rpe",
    notes: appendNote(e.notes, "Triceps / lockout secondary — differentiated from the heavy day."),
  };
}

function withBenchConsolidation(week: TemplateWeek): TemplateWeek {
  const benchDayIdx = week.sessions
    .map((s, i) => (s.exercises.some(isBenchWork) ? i : -1))
    .filter((i) => i !== -1);
  if (benchDayIdx.length <= 1) return week;

  const roles: BenchRole[] = ["heavy", "volume", "triceps"];
  const roleByDay = new Map<number, BenchRole>();
  benchDayIdx.slice(0, 3).forEach((dayIdx, i) => roleByDay.set(dayIdx, roles[i]));
  const droppedDays = benchDayIdx.slice(3);

  let foldedSets = 0;
  let sessions = week.sessions.map((s, i) => {
    if (!droppedDays.includes(i)) return s;
    const kept: TemplateExercise[] = [];
    for (const e of s.exercises) {
      if (isBenchWork(e)) {
        foldedSets += e.target_sets;
        continue;
      }
      kept.push(e);
    }
    return {
      ...s,
      notes: appendNote(s.notes, "Bench volume moved to the dedicated bench days."),
      exercises: kept,
    };
  });

  sessions = sessions.map((s, i) => {
    const role = roleByDay.get(i);
    if (!role) return s;
    let shapedFirst = false;
    const exercises = s.exercises.map((e) => {
      if (!isBenchWork(e)) return e;
      if (shapedFirst) return e;
      shapedFirst = true;
      const withRole = shapeBench(e, role);
      if (role === "volume" && foldedSets > 0) {
        const add = Math.min(2, Math.ceil(foldedSets / 2));
        foldedSets = 0;
        return { ...withRole, target_sets: Math.min(6, withRole.target_sets + add) };
      }
      return withRole;
    });
    return {
      ...s,
      title: `${s.title} — bench: ${benchRoleTitle(role)}`,
      exercises,
    };
  });

  return {
    ...week,
    notes: appendNote(
      week.notes,
      `Bench consolidated into ${Math.min(3, benchDayIdx.length)} differentiated day(s): heavy comp pause, hypertrophy volume, close-grip secondary.`,
    ),
    sessions,
  };
}

// ---------- public API ----------

export function applyOverload(weeks: TemplateWeek[], o: OverloadOptions): TemplateWeek[] {
  if (!overloadTouched(o)) return weeks;
  let workingIndex = 0;
  return weeks.map((week) => {
    let w = week;
    const deload = isDeloadWeek(w);
    if (o.deadliftStance !== "keep") w = withStanceCommitment(w, o.deadliftStance);
    if (o.benchConsolidation) w = withBenchConsolidation(w);
    if (o.waveLoading && !deload) {
      w = withWaveLoading(w, workingIndex);
      workingIndex += 1;
    }
    if (o.overWarmSingles) w = withOverWarmSingles(w);
    return w;
  });
}

/** Human-readable summary lines for the mesocycle notes / preview. */
export function overloadSummary(o: OverloadOptions): string[] {
  const out: string[] = [];
  if (o.overWarmSingles)
    out.push("Heavy over-warm single @ RPE 8 (~90–92%) before working sets on main lifts");
  if (o.deadliftStance !== "keep")
    out.push(
      `Deadlift stance committed to ${o.deadliftStance} — second pull becomes RDL / deficit`,
    );
  if (o.waveLoading) out.push("3-week wave: 5s @70–75% → 4s @77–82% → 3s/2s @85%+ → deload");
  if (o.benchConsolidation)
    out.push("Bench consolidated into heavy pause / hypertrophy / close-grip days");
  return out;
}
