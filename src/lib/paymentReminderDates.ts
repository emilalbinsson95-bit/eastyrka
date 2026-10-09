import { addMonths, differenceInCalendarMonths, format, parseISO } from "date-fns";

/** Always anchor to the original day, so February never shifts March's due date. */
export function paymentReminderDates(startDate: string, rangeStart: string, rangeEnd: string): string[] {
  const anchor = parseISO(startDate);
  const firstMonth = Math.max(0, differenceInCalendarMonths(parseISO(rangeStart), anchor));
  const lastMonth = differenceInCalendarMonths(parseISO(rangeEnd), anchor);
  const dates: string[] = [];
  for (let month = firstMonth; month <= lastMonth; month++) {
    const date = format(addMonths(anchor, month), "yyyy-MM-dd");
    if (date >= rangeStart && date <= rangeEnd) dates.push(date);
  }
  return dates;
}