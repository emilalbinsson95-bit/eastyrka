import { compLiftKey, isCompLift, type CompLift } from './liftIdentity';

export const WARMUP_RPES = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10] as const;
export function matchesWarmupLoad(exercise: string, variation: string | null, weight: number, loads: Partial<Record<CompLift, number>>): boolean {
  const lift = compLiftKey(exercise);
  return lift !== null && isCompLift(exercise, variation) && Number.isFinite(weight) && weight > 0 && loads[lift] === weight;
}
