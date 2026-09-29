import type { VolumeCategory } from "@/lib/strengthTemplates";

export interface StrengthVolumeProfile {
  squat: number;
  bench: number;
  deadlift: number;
}

export const DEFAULT_STRENGTH_VOLUME: StrengthVolumeProfile = { squat: 1, bench: 1, deadlift: 1 };

export function volumeFactorForCategory(category: VolumeCategory, profile: StrengthVolumeProfile): number {
  if (category === "squat") return profile.squat;
  if (category === "hinge") return profile.deadlift;
  if (category === "horizontal-press") return profile.bench;
  return 1;
}

export function volumeProfileFromRow(row: {
  squat_factor: number;
  bench_factor: number;
  deadlift_factor: number;
} | null): StrengthVolumeProfile {
  return row
    ? { squat: Number(row.squat_factor), bench: Number(row.bench_factor), deadlift: Number(row.deadlift_factor) }
    : DEFAULT_STRENGTH_VOLUME;
}