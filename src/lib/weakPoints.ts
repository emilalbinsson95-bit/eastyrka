/**
 * Weak-point driven exercise selection. Cues fix gross technique early; after
 * that weaknesses are solved by exercise choice. Each weak point swaps the
 * lift's secondary (variation) slot for a targeted variation and adds one
 * targeted accessory per week (not in deload weeks).
 */
import { volumeCategory, type TemplateExercise, type TemplateWeek } from "@/lib/strengthTemplates";

export type WeakLift = "squat" | "bench" | "deadlift";

export interface WeakPoint {
  id: string;
  lift: WeakLift;
  label: string;
  why: string;
  variation: { exercise: string; reps: number; notes: string };
  accessory: { exercise: string; sets: number; reps: number; notes: string };
}

export const MAX_WEAK_POINTS = 3;

export const WEAK_POINTS: WeakPoint[] = [
  // ---- squat ----
  { id: "squat-bottom", lift: "squat", label: "Collapses in the hole", why: "Strength and tightness at the bottom position.",
    variation: { exercise: "Pause squat", reps: 4, notes: "2–3 s dead pause in the hole, stay tight." },
    accessory: { exercise: "Pin squat", sets: 3, reps: 3, notes: "From pins just below parallel — dead start." } },
  { id: "squat-shallow", lift: "squat", label: "Squats too shallow", why: "Depth confidence and mobility; train below parallel.",
    variation: { exercise: "Tempo squat", reps: 4, notes: "3 s down, hit clearly below parallel. Film depth every set." },
    accessory: { exercise: "Heel-elevated goblet squat", sets: 3, reps: 10, notes: "Full depth, slow. Ankle/hip range under load." } },
  { id: "squat-midrange", lift: "squat", label: "Stalls just above parallel", why: "Most common sticking region — hip and knee extensors mid-range.",
    variation: { exercise: "Pin squat", reps: 3, notes: "Pins at the sticking point. Dead start." },
    accessory: { exercise: "Leg press", sets: 3, reps: 10, notes: "Deep, controlled." } },
  { id: "squat-hips-up", lift: "squat", label: "Hips shoot up first", why: "Quads weak relative to posterior chain.",
    variation: { exercise: "Front squat", reps: 5, notes: "Upright torso, quad-driven." },
    accessory: { exercise: "Leg extension", sets: 3, reps: 12, notes: "Quad volume." } },
  { id: "squat-valgus", lift: "squat", label: "Knees cave clearly", why: "Adductor/hip strength and control (mild valgus is normal).",
    variation: { exercise: "Tempo squat", reps: 5, notes: "3 s down, knees tracking over toes." },
    accessory: { exercise: "Bulgarian split squat", sets: 3, reps: 8, notes: "Per leg, controlled." } },
  // ---- deadlift ----
  { id: "dl-floor", lift: "deadlift", label: "Slow off the floor", why: "Quads and start position.",
    variation: { exercise: "Deficit deadlift", reps: 4, notes: "2–5 cm deficit, same position as comp." },
    accessory: { exercise: "Front squat", sets: 3, reps: 6, notes: "Quad strength for the break." } },
  { id: "dl-hinge", lift: "deadlift", label: "Weak hinge / lockout", why: "Hip extensors and back strength near the knee.",
    variation: { exercise: "Block pull", reps: 3, notes: "Bar just below the knee. Heavier than comp." },
    accessory: { exercise: "Romanian deadlift", sets: 3, reps: 8, notes: "Hips back, neutral spine." } },
  { id: "dl-rounding", lift: "deadlift", label: "Back rounds", why: "Positional strength of the upper back / trunk.",
    variation: { exercise: "Pause deadlift", reps: 3, notes: "2 s pause just below the knee, hold position." },
    accessory: { exercise: "Chest-supported row", sets: 3, reps: 10, notes: "Upper back." } },
  // ---- bench ----
  { id: "bench-chest", lift: "bench", label: "Slow off the chest", why: "Pecs and front delts at the bottom.",
    variation: { exercise: "Long-pause bench press", reps: 4, notes: "2–3 s pause on the chest." },
    accessory: { exercise: "Dumbbell bench press", sets: 3, reps: 10, notes: "Full stretch." } },
  { id: "bench-mid", lift: "bench", label: "Stalls mid-range", why: "Transition from pecs to triceps, 5–15 cm off the chest.",
    variation: { exercise: "Spoto press", reps: 4, notes: "Stop 2–3 cm above the chest, 1 s hold." },
    accessory: { exercise: "Close-grip bench press", sets: 3, reps: 8, notes: "Triceps + pecs." } },
  { id: "bench-lockout", lift: "bench", label: "Weak lockout", why: "Triceps.",
    variation: { exercise: "Pin press", reps: 3, notes: "Pins in the upper half of the range." },
    accessory: { exercise: "Overhead triceps extension", sets: 3, reps: 12, notes: "Long head." } },
  { id: "bench-path", lift: "bench", label: "Bar path drifts", why: "Consistency; groove the path with control.",
    variation: { exercise: "Tempo bench press", reps: 5, notes: "3 s down, same touch point every rep." },
    accessory: { exercise: "Chest-supported row", sets: 3, reps: 10, notes: "Upper-back base." } },
  { id: "bench-butt", lift: "bench", label: "Butt lifts off the bench", why: "Uncontrolled leg drive.",
    variation: { exercise: "Larsen press", reps: 5, notes: "Feet off/relaxed — push the floor forward, not up." },
    accessory: { exercise: "Dumbbell bench press", sets: 3, reps: 10, notes: "Feet quiet, controlled." } },
  { id: "bench-shoulders", lift: "bench", label: "Shoulders roll forward at lockout", why: "Scapulae lose position.",
    variation: { exercise: "Pause bench press", reps: 4, notes: "Pause at lockout, actively keep shoulder blades back." },
    accessory: { exercise: "Face pull", sets: 3, reps: 15, notes: "Scapular control." } },
  { id: "bench-uneven", lift: "bench", label: "One arm leads", why: "Side-to-side imbalance. Film from the front.",
    variation: { exercise: "Tempo bench press", reps: 5, notes: "3 s down, even press." },
    accessory: { exercise: "Single-arm dumbbell press", sets: 3, reps: 10, notes: "Per arm." } },
  { id: "bench-bounce", lift: "bench", label: "Bounces off the chest / dies at the turnaround", why: "No tension at the bottom.",
    variation: { exercise: "Dead bench press", reps: 3, notes: "From pins at the chest, dead start every rep." },
    accessory: { exercise: "Dumbbell bench press", sets: 3, reps: 10, notes: "3 s eccentric." } },
  { id: "bench-elbows", lift: "bench", label: "Weak lockout despite strong triceps", why: "Elbows flare too early — groove the path.",
    variation: { exercise: "Floor press", reps: 5, notes: "Elbows tucked, same path every rep." },
    accessory: { exercise: "Pin press", sets: 3, reps: 5, notes: "Pins high, tempo." } },
  // ---- more squat ----
  { id: "squat-forward", lift: "squat", label: "Falls forward / onto the toes", why: "Balance not over mid-foot.",
    variation: { exercise: "Tempo squat", reps: 5, notes: "3 s down, whole foot on the floor." },
    accessory: { exercise: "Goblet squat", sets: 3, reps: 10, notes: "Technique drill, mid-foot balance." } },
  { id: "squat-brace", lift: "squat", label: "Loses brace mid-lift", why: "Breathing/brace releases.",
    variation: { exercise: "Pause squat", reps: 4, notes: "Hold the breath through the pause — belly into the belt." },
    accessory: { exercise: "Front squat", sets: 3, reps: 5, notes: "Punishes a lost brace." } },
  { id: "squat-bounce", lift: "squat", label: "Uncontrolled bounce out of the hole", why: "The bounce takes over.",
    variation: { exercise: "Pin squat", reps: 3, notes: "Dead start from the bottom (Anderson)." },
    accessory: { exercise: "Box squat", sets: 3, reps: 5, notes: "Box below parallel." } },
  { id: "squat-quads", lift: "squat", label: "Quads are the weak link", why: "Quad strength and volume.",
    variation: { exercise: "Heel-elevated squat", reps: 6, notes: "Cyclist-style, upright." },
    accessory: { exercise: "Hack squat", sets: 3, reps: 10, notes: "Deep, controlled." } },
  { id: "squat-back", lift: "squat", label: "Back tires before legs", why: "More leg volume without spinal load.",
    variation: { exercise: "Safety bar squat", reps: 6, notes: "Upper-back tolerance." } ,
    accessory: { exercise: "Belt squat", sets: 3, reps: 10, notes: "Leg volume, no back load." } },
  { id: "squat-shift", lift: "squat", label: "Hips shift side to side", why: "Left/right asymmetry. Film from the front.",
    variation: { exercise: "Tempo squat", reps: 5, notes: "3 s down, watch symmetry." },
    accessory: { exercise: "Bulgarian split squat", sets: 3, reps: 8, notes: "Per leg, weaker side first." } },
  // ---- more deadlift ----
  { id: "dl-hips-up", lift: "deadlift", label: "Hips shoot up off the floor", why: "Legs do too little at the start.",
    variation: { exercise: "Pause deadlift", reps: 3, notes: "Pause 2–3 cm off the floor. Push the floor away." },
    accessory: { exercise: "Front squat", sets: 3, reps: 6, notes: "Quad strength." } },
  { id: "dl-drift", lift: "deadlift", label: "Bar drifts away from the body", why: "Lats not engaged.",
    variation: { exercise: "Pause deadlift", reps: 3, notes: "Pause below the knee, bar touching the thighs — protect the armpits." },
    accessory: { exercise: "Straight-arm pulldown", sets: 3, reps: 12, notes: "Lat activation." } },
  { id: "dl-grip", lift: "deadlift", label: "Grip fails", why: "Grip strength.",
    variation: { exercise: "Double-overhand deadlift", reps: 3, notes: "No mixed grip. Hold the top 10–20 s after the last rep. Chalk." },
    accessory: { exercise: "Snatch-grip hold", sets: 3, reps: 1, notes: "10–20 s holds." } },
  { id: "dl-upper-back", lift: "deadlift", label: "Upper back rounds", why: "Upper-back strength.",
    variation: { exercise: "Snatch-grip deadlift", reps: 4, notes: "Wide grip, longer pull." },
    accessory: { exercise: "Face pull", sets: 3, reps: 15, notes: "Plus rows." } },
  { id: "dl-hitch", lift: "deadlift", label: "Hitches at lockout", why: "Weak hip extensors / glutes.",
    variation: { exercise: "Rack pull", reps: 3, notes: "Just above the knee." },
    accessory: { exercise: "Hip thrust", sets: 3, reps: 8, notes: "Pause at the top." } },
];

const LIFT_CAT: Record<WeakLift, ReturnType<typeof volumeCategory>> = {
  squat: "squat",
  bench: "horizontal-press",
  deadlift: "hinge",
};

// A named comp lift is the comp slot unless its variation describes a true
// variant. Stance/grip notes (e.g. "Sumo stance", "Competition grip & pause")
// and over-warm singles still count as the competition lift.
const VARIANT = /pause squat|tempo|pin|deficit|block|spoto|larsen|touch|close|wide|board|floor/i;

function isCompSlot(e: TemplateExercise): boolean {
  return /^(back squat|bench press|deadlift|sumo deadlift)$/i.test(e.exercise) && (!e.variation || !VARIANT.test(e.variation));
}

export function getWeakPoints(ids: string[]): WeakPoint[] {
  return ids.map((id) => WEAK_POINTS.find((w) => w.id === id)).filter((w): w is WeakPoint => Boolean(w));
}

const isDeloadWeek = (w: TemplateWeek) => /deload|taper|meet/i.test(w.label);

export function applyWeakPoints(weeks: TemplateWeek[], ids: string[]): TemplateWeek[] {
  const selected = getWeakPoints(ids).slice(0, MAX_WEAK_POINTS);
  if (selected.length === 0) return weeks;
  return weeks.map((week) => {
    const deload = isDeloadWeek(week);
    const sessions = week.sessions.map((s) => ({ ...s, exercises: s.exercises.map((e) => ({ ...e })) }));
    const usedSlots = new Set<TemplateExercise>();
    for (const wp of selected) {
      const cat = LIFT_CAT[wp.lift];
      // 1. swap the lift's secondary slot for the targeted variation
      let slot: TemplateExercise | undefined;
      for (const s of sessions) {
        if (s.exercises.some((e) => e.exercise.toLowerCase() === wp.variation.exercise.toLowerCase())) continue;
        slot = s.exercises.find((e) => !usedSlots.has(e) && volumeCategory(e) === cat && !isCompSlot(e));
        if (slot) break;
      }
      if (slot) {
        usedSlots.add(slot);
        slot.exercise = wp.variation.exercise;
        slot.variation = undefined;
        slot.target_reps = wp.variation.reps;
        slot.notes = `Weak point — ${wp.label}: ${wp.variation.notes}`;
      } else {
        const hasVar = sessions.some((s) => s.exercises.some((e) => e.exercise.toLowerCase() === wp.variation.exercise.toLowerCase()));
        const host = hasVar ? undefined : sessions.find((s) => s.exercises.some((e) => volumeCategory(e) === cat));
        if (host && !deload) {
          const comp = host.exercises.find((e) => volumeCategory(e) === cat)!;
          const idx = host.exercises.indexOf(comp);
          const added: TemplateExercise = {
            exercise: wp.variation.exercise, target_sets: 3, target_reps: wp.variation.reps,
            target_rpe: Math.min(8, (comp.target_rpe ?? 8) - 0.5), intensity_metric: "rpe",
            notes: `Weak point — ${wp.label}: ${wp.variation.notes}`,
          };
          usedSlots.add(added);
          host.exercises.splice(idx + 1, 0, added);
        }
      }
      // 2. one targeted accessory per week, skipped in deloads
      if (deload) continue;
      const already = sessions.some((s) => s.exercises.some((e) => e.exercise.toLowerCase() === wp.accessory.exercise.toLowerCase()));
      if (already) continue;
      const hosts = sessions.filter((s) => s.exercises.some((e) => volumeCategory(e) === cat));
      const target = (hosts.length ? hosts : sessions).reduce((a, b) => (b.exercises.length < a.exercises.length ? b : a));
      target.exercises.push({
        exercise: wp.accessory.exercise, target_sets: wp.accessory.sets, target_reps: wp.accessory.reps,
        target_rpe: 8, intensity_metric: "rpe", notes: `Weak point — ${wp.label}: ${wp.accessory.notes}`,
      });
    }
    return { ...week, sessions };
  });
}
