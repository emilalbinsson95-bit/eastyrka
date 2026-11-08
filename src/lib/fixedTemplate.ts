import type { StrengthTemplate, TemplateWeek } from "@/lib/strengthTemplates";
import { applyDeadliftStyle, type DeadliftStyle } from "@/lib/weakPoints";

/** True for one-off weeks that must be generated exactly as written. */
export function isFixedTemplate(template: StrengthTemplate | undefined | null): boolean {
  return Boolean(template?.fixedPrescription);
}

/**
 * The only modifier a fixed week gets is the athlete's deadlift stance, so a
 * sumo lifter films a sumo triple. Everything else (length, history
 * adjustments, weak points, protocols, singles, volume changes, push) is skipped.
 */
export function buildFixedWeeks(template: StrengthTemplate, daysPerWeek: number, style: DeadliftStyle | null | undefined): TemplateWeek[] {
  return applyDeadliftStyle(template.buildWeeks(daysPerWeek), style);
}
