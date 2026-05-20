import { addDays, format, parseISO } from "date-fns";

type PlannedSessionDayLike = {
  day_of_week: number | null;
  title?: string | null;
};

function titleDayNumber(title?: string | null) {
  const match = title?.match(/\bday\s+(\d+)\b/i);
  return match ? Number(match[1]) : null;
}

export function plannedSessionDayOffset(
  session: PlannedSessionDayLike,
  siblings: PlannedSessionDayLike[] = [session],
) {
  const numericDays = siblings
    .map((s) => Number(s.day_of_week))
    .filter((day) => Number.isFinite(day));
  const hasZeroIndexedDay = numericDays.includes(0);
  const hasZeroIndexedTitle = siblings.some((s) => {
    const titleDay = titleDayNumber(s.title);
    return titleDay != null && Number(s.day_of_week) === titleDay - 1;
  });
  const usesZeroBasedDays = hasZeroIndexedDay || hasZeroIndexedTitle;
  const day = Number(session.day_of_week ?? (usesZeroBasedDays ? 0 : 1));
  const offset = usesZeroBasedDays ? day : day - 1;
  return Math.max(0, Math.min(6, offset));
}

export function plannedSessionDate(
  weekStartDate: string,
  session: PlannedSessionDayLike,
  siblings: PlannedSessionDayLike[] = [session],
) {
  return format(
    addDays(parseISO(weekStartDate), plannedSessionDayOffset(session, siblings)),
    "yyyy-MM-dd",
  );
}