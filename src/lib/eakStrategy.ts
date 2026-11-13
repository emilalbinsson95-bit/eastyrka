import { z } from "zod";
import { DEFAULT_STRATEGY, resolveStrategy, type EakStrategy } from "./eakSignal";

export const STRATEGY_FIELDS = [
  { key: "fallStage1Pct", column: "fall_stage1_pct", label: "Bevaka/bromsa: tapp (%)" },
  { key: "fallStage2Pct", column: "fall_stage2_pct", label: "Bromsa nu: tapp (%)" },
  { key: "pushLowPct", column: "push_low_pct", label: "Redo för mer: nedre EAk (%)" },
  { key: "pushHighPct", column: "push_high_pct", label: "Redo för mer: övre EAk (%)" },
  { key: "readinessBelowPct", column: "readiness_below_pct", label: "Readiness: EAk under (%)" },
  { key: "readinessShare", column: "readiness_share", label: "Readiness: andel pass (0–1)", share: true },
  { key: "mesoMinSessions", column: "meso_min_sessions", label: "Minsta antal mätpass", integer: true },
  { key: "mesoMaxSessions", column: "meso_max_sessions", label: "Antal mätpass i fönstret", integer: true },
  { key: "inSessionDropStopPct", column: "in_session_drop_stop_pct", label: "Trötthetsgräns i pass: tapp (%)" },
  { key: "inSessionDropOkPct", column: "in_session_drop_ok_pct", label: "Bra i pass: högst tapp (%)" },
  { key: "noiseRatioFlag", column: "noise_ratio_flag", label: "Brusvarning: kvot" },
  { key: "poolMesocycles", column: "pool_mesocycles", label: "Mesocykler i brusunderlaget", integer: true },
  { key: "defaultSem", column: "default_sem", label: "Brus innan tillräcklig historik (%)" },
  { key: "warmupRpeDrift", column: "warmup_rpe_drift", label: "Uppvärmning: ökning i RPE" },
  { key: "subjectiveWorseDays", column: "subjective_worse_days", label: "Sämre mående: antal dagar", integer: true },
  { key: "subjectiveWorsePoints", column: "subjective_worse_points", label: "Sämre mående: poäng mot eget snitt" },
  { key: "historyDays", column: "history_days", label: "Historik för stödsignaler: dagar", integer: true },
  { key: "pushSessionBelowPct", column: "push_session_below_pct", label: "Redo för mer: EAk per pass (%)" },
  { key: "pushShare", column: "push_share", label: "Redo för mer: andel pass (0–1)", share: true },
] as const satisfies ReadonlyArray<{ key: keyof EakStrategy; column: string; label: string; integer?: boolean; share?: boolean }>;

export function strategyFromRow(row: Record<string, unknown> | null) {
  const values: Partial<Record<keyof EakStrategy, number | null>> = {};
  for (const f of STRATEGY_FIELDS) values[f.key] = row?.[f.column] == null ? null : Number(row[f.column]);
  return values;
}

export function strategyValuesToRow(values: Partial<Record<keyof EakStrategy, string>>) {
  const row: Record<string, number | null> = {};
  const partial: Partial<Record<keyof EakStrategy, number | null>> = {};
  for (const f of STRATEGY_FIELDS) {
    const raw = values[f.key]?.trim() ?? "";
    const value = raw === "" ? null : Number(raw.replace(",", "."));
    if (value !== null && (!Number.isFinite(value) || value <= 0 || ("integer" in f && !Number.isInteger(value)) || ("share" in f && value > 1))) {
      throw new Error(`Kontrollera ${f.label.toLowerCase()}.`);
    }
    row[f.column] = value;
    partial[f.key] = value;
  }
  const effective = resolveStrategy(partial);
  if (effective.mesoMinSessions > effective.mesoMaxSessions || effective.fallStage1Pct > effective.fallStage2Pct || effective.pushLowPct > effective.pushHighPct || effective.inSessionDropOkPct > effective.inSessionDropStopPct) {
    throw new Error("Den nedre gränsen får inte vara större än den övre.");
  }
  return row;
}

type StrategyValues = Partial<Record<keyof EakStrategy, number>>;

/**
 * Ready-made levels so coaches can pick a strategy without filling every
 * field. Only the signal limits change; in-session drop limits stay as they are.
 */
export const STRATEGY_PRESETS: ReadonlyArray<{ id: "careful" | "standard" | "offensive"; label: string; text: string; values: StrategyValues }> = [
  { id: "careful", label: "Försiktig", text: "Bromsar vid mindre tapp och kräver mer innan den föreslår ökning. För nya atleter, tung vardag eller skadehistorik.", values: { fallStage1Pct: 3, fallStage2Pct: 7, pushLowPct: 105, pushHighPct: 107, pushSessionBelowPct: 104, pushShare: 0.8, readinessBelowPct: 98 } },
  { id: "standard", label: "Standard", text: "Appens grundinställning: bevaka vid 5 % tapp, bromsa vid 10 %, redo för mer från 104 %.", values: {} },
  { id: "offensive", label: "Offensiv", text: "Tål större tapp innan den bromsar och föreslår ökning tidigare. För vana atleter som återhämtar sig bra.", values: { fallStage1Pct: 7, fallStage2Pct: 12, pushLowPct: 103, pushHighPct: 105, pushSessionBelowPct: 102, pushShare: 0.67, readinessBelowPct: 96 } },
];

export type StrategyPresetId = (typeof STRATEGY_PRESETS)[number]["id"];

/** Form values for a preset: unchanged fields stay empty so they follow the default. */
export function presetFormValues(id: StrategyPresetId): Partial<Record<keyof EakStrategy, string>> {
  const preset = STRATEGY_PRESETS.find((p) => p.id === id);
  return Object.fromEntries(STRATEGY_FIELDS.map((f) => [f.key, preset?.values[f.key] == null ? "" : String(preset.values[f.key])]));
}

/** Which preset the saved or typed values equal, or null for a custom strategy. */
export function matchPreset(values: Partial<Record<keyof EakStrategy, string | number | null>>): StrategyPresetId | null {
  const parsed: Partial<Record<keyof EakStrategy, number | null>> = {};
  for (const f of STRATEGY_FIELDS) {
    const raw = values[f.key];
    const n = raw == null || raw === "" ? null : Number(String(raw).replace(",", "."));
    parsed[f.key] = n != null && Number.isFinite(n) ? n : null;
  }
  const current = resolveStrategy(parsed);
  for (const p of STRATEGY_PRESETS) {
    const target = resolveStrategy(p.values);
    if (STRATEGY_FIELDS.every((f) => Math.abs(current[f.key] - target[f.key]) < 1e-9)) return p.id;
  }
  return null;
}

export const eakDecisionSchema = z.object({
  evaluationId: z.string().uuid(),
  decision: z.enum(["approved", "rejected", "modified"]),
  note: z.string().max(1000).optional(),
  planChanged: z.boolean(),
});

export { DEFAULT_STRATEGY };