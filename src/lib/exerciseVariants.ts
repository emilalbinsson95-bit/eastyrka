/**
 * Turn template "exercise + variation" pairs into distinct exercise names
 * when the variation is really a different lift (pause squat, touch-and-go
 * bench, hang clean…). Competition-style labels stay on the main lift.
 */
const KEEP = /^(competition stance|competition grip & pause|over-warm single|conventional stance|sumo stance)$/i;

const EXPLICIT: Array<[RegExp, RegExp, string]> = [
  [/^back squat$/i, /pause/i, "Pause squat"],
  [/^back squat$/i, /tempo/i, "Tempo squat"],
  [/^back squat$/i, /high-?bar/i, "High-bar squat"],
  [/^back squat$/i, /low-?bar/i, "Low-bar squat"],
  [/^bench press$/i, /touch.?and.?go/i, "Touch-and-go bench press"],
  [/^bench press$/i, /spoto/i, "Spoto press"],
  [/^bench press$/i, /larsen/i, "Larsen press"],
  [/^overhead press$/i, /dumbbell seated/i, "Seated dumbbell press"],
  [/^power clean$/i, /hang/i, "Hang power clean"],
  [/^deadlift$/i, /deficit/i, "Deficit deadlift"],
  [/^deadlift$/i, /pause/i, "Pause deadlift"],
];

export function resolveVariantExercise(
  exercise: string,
  variation?: string | null,
): { exercise: string; variation: string | null } {
  const v = (variation ?? "").trim();
  if (!v || KEEP.test(v)) return { exercise, variation: v || null };
  for (const [ex, re, name] of EXPLICIT) {
    if (ex.test(exercise) && re.test(v)) return { exercise: name, variation: null };
  }
  if (/pause|tempo|pin|spoto|larsen/i.test(v) && v.split(/\s+/).length <= 2) {
    return { exercise: `${v} ${exercise.toLowerCase()}`, variation: null };
  }
  return { exercise, variation: v };
}
