import { addDays, format, parseISO } from "date-fns";

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