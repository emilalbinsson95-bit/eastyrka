import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";

export function validPeakDate(value: string): boolean {
  const date = parseISO(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(date.getTime()) && format(date, "yyyy-MM-dd") === value;
}

/** Seven-day training windows end the day before competition, on any weekday. */
export function peakStartDate(competitionDate: string, weeks: number): string {
  if (!validPeakDate(competitionDate) || !Number.isInteger(weeks) || weeks < 2 || weeks > 6) return "";
  return format(addDays(parseISO(competitionDate), -weeks * 7), "yyyy-MM-dd");
}

export function peakFinalSessionDates(competitionDate: string): string[] {
  if (!validPeakDate(competitionDate)) return [];
  return [7, 5].map((days) => format(addDays(parseISO(competitionDate), -days), "yyyy-MM-dd"));
}
/** Inclusive coach-selected period, between 14 and 42 days. */
export function peakPeriodDays(start: string, end: string): number {
  if (!validPeakDate(start) || !validPeakDate(end)) return 0;
  const days = differenceInCalendarDays(parseISO(end), parseISO(start)) + 1;
  return days >= 14 && days <= 42 ? days : 0;
}

/** A partial first window keeps the final seven-day taper anchored to the end. */
export function peakWeekStartDates(start: string, end: string): string[] {
  const days = peakPeriodDays(start, end);
  if (!days) return [];
  const firstDays = days % 7 || 7;
  return Array.from({ length: Math.ceil(days / 7) }, (_, i) =>
    format(addDays(parseISO(start), i === 0 ? 0 : firstDays + (i - 1) * 7), "yyyy-MM-dd"));
}
