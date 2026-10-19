import { describe, expect, it } from "vitest";
import { addDays, format, parseISO } from "date-fns";
import { peakFinalSessionDates, peakStartDate } from "./peakingDates";
import { buildPeakingWeeks } from "./peaking";
import { plannedSessionDate } from "./planned-session-dates";

describe("competition-anchored peaking dates", () => {
  it("places every 2–6 week / 2–6 day plan before competition on every weekday", () => {
    for (let weekday = 0; weekday < 7; weekday++) {
      const meet = format(addDays(parseISO("2027-01-18"), weekday), "yyyy-MM-dd");
      for (const weeks of [2, 3, 4, 5, 6]) for (const days of [2, 3, 4, 5, 6]) {
        const start = peakStartDate(meet, weeks);
        const plan = buildPeakingWeeks(days, null, { weeks });
        const dates = plan.flatMap((week) => {
          const weekStart = format(addDays(parseISO(start), (week.week_index - 1) * 7), "yyyy-MM-dd");
          return week.sessions.map((s) => plannedSessionDate(weekStart, s, week.sessions));
        });
        expect(dates.every((date) => date >= start && date < meet)).toBe(true);
        expect(new Set(dates).size).toBe(dates.length);
        expect(dates.slice(-2)).toEqual(peakFinalSessionDates(meet));
      }
    }
  });
  it("gives concrete Saturday dates with five clear rest days after the last session", () => {
    expect(peakStartDate("2027-01-23", 3)).toBe("2027-01-02");
    expect(peakStartDate("2027-01-23", 6)).toBe("2026-12-12");
    expect(peakFinalSessionDates("2027-01-23")).toEqual(["2027-01-16", "2027-01-18"]);
  });
  it("rejects invalid dates and durations", () => {
    for (const date of ["", "2027-02-30", "bad"]) expect(peakStartDate(date, 3)).toBe("");
    for (const weeks of [1, 7, 2.5]) expect(peakStartDate("2027-01-23", weeks)).toBe("");
  });
});