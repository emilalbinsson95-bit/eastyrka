/**
 * Shared competition-lift identity. One place that decides whether an
 * exercise entry IS the competition lift (squat / bench / deadlift) or a
 * variation of it — used by volume guards, weak points, overload options,
 * block volume and the EAk engine so the rules never drift apart.
 */

export type CompLift = "squat" | "bench" | "deadlift";

/**
 * Name normalisation shared by EAk, charts, baselines and volume guards.
 * Hyphens/underscores become spaces, case is ignored, and words that only
 * describe HOW the lift is entered (competition/comp/powerlifting prefix,
 * stance/grip/over-warm suffixes) are stripped — so "Back-Squat",
 * "Competition Squat" and "Squat competition stance" all resolve to the
 * same lift. True variants (pause, tempo, high-bar, close-grip, …) keep
 * their own names and never match.
 */
export function normalizeLiftName(exercise: string): string {
  let name = normalizeLiftLabel(exercise);
  // Separators come from both exercise names and combined display labels.
  name = name.replace(/\s+(competition stance|comp stance|competition grip (?:&|and) pause|competition grip|comp grip|conventional stance|sumo stance|over warm single|opener single)$/, "");
  name = name.replace(/^(?:(?:competition|comp|powerlifting)\s+)+/, "").replace(/\s+(competition|comp|powerlifting)$/, "");
  return name.replace(/\s+/g, " ").trim();
}

function normalizeLiftLabel(label: string): string {
  return label.trim().toLowerCase().replace(/[-_·/()[\]]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Strict allow-list: unknown notes are not silently treated as EAk lifts. */
export function isCompetitionDescriptor(variation?: string | null): boolean {
  const note = normalizeLiftLabel(variation ?? "");
  return !note || /^(competition stance|comp stance|competition grip (?:&|and) pause|competition grip|comp grip|conventional stance|sumo stance|over warm single|opener single)$/.test(note);
}

const COMP_RE: Record<CompLift, RegExp> = {
  squat: /^(back squat|backsquat|squat|knäböj|knaboj|böj)$/i,
  bench: /^(bench press|benchpress|bench|bänkpress|bänk)$/i,
  deadlift: /^(deadlift|dead lift|sumo dead ?lift|conventional dead ?lift|marklyft|mark|sumo marklyft|sumomarklyft|sumomark|konventionell marklyft|konventionellt marklyft)$/i,
};

/** Canonical exercise name per competition lift (matches baselines table). */
export const COMP_NAME: Record<CompLift, string> = {
  squat: "Back squat",
  bench: "Bench press",
  deadlift: "Deadlift",
};

/** Variations that make the entry a true variant, not the competition lift. */
const TRUE_VARIANT =
  /pause|tempo|pin|deficit|block|spoto|larsen|touch|close.?grip|wide|board|floor|high.?bar/i;

/** Labels that describe HOW the comp lift is performed — still the comp lift. */

/** Which competition lift an exercise name belongs to, regardless of variation. */
export function compLiftKey(exercise: string): CompLift | null {
  const name = normalizeLiftName(exercise);
  for (const key of Object.keys(COMP_RE) as CompLift[]) {
    if (COMP_RE[key].test(name)) return key;
  }
  return null;
}

/** Canonical read identity; never collapse sumo into conventional or generic deadlift. */
export function competitionExerciseName(exercise: string, variation?: string | null): string | null {
  const lift = compLiftKey(exercise);
  if (!lift) return null;
  if (lift !== "deadlift") return COMP_NAME[lift];
  const name = normalizeLiftLabel(exercise);
  const note = normalizeLiftLabel(variation ?? "");
  if (/\bsumo\b|sumomark/.test(`${name} ${note}`)) return "Sumo deadlift";
  if (/\bconventional\b|\bkonventionell(?:t)?\b/.test(`${name} ${note}`)) return "Conventional deadlift";
  return COMP_NAME.deadlift;
}

/**
 * True when the entry is the competition lift itself. Stance/grip notes and
 * over-warm/opener singles count as the comp lift; pause, tempo, deficit and
 * similar make it a variant.
 */
export function isCompLift(exercise: string, variation?: string | null): boolean {
  if (!compLiftKey(exercise)) return false;
  const v = (variation ?? "").trim();
  if (!v) return true;
  if (isCompetitionDescriptor(v)) return true;
  return !TRUE_VARIANT.test(v);
}

/** The week kinds a template can mark a week with. */
export type WeekKind = "working" | "deload" | "peak" | "taper" | "ramp";

/** Light weeks get no volume floors, ramps or added work. */
export function isLightKind(kind: WeekKind): boolean {
  return kind === "deload" || kind === "taper";
}
