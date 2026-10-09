import { describe, expect, it } from "vitest";
import { paymentReminderDates } from "./paymentReminderDates";

describe("monthly payment reminders", () => {
  it("starts on the chosen day and repeats monthly", () => {
    expect(paymentReminderDates("2026-10-09", "2026-10-01", "2026-12-31")).toEqual(["2026-10-09", "2026-11-09", "2026-12-09"]);
  });
  it("clamps short months without moving the original day", () => {
    expect(paymentReminderDates("2026-01-31", "2026-02-01", "2026-03-31")).toEqual(["2026-02-28", "2026-03-31"]);
  });
  it("handles leap years and year boundaries", () => {
    expect(paymentReminderDates("2027-12-31", "2028-01-01", "2028-03-31")).toEqual(["2028-01-31", "2028-02-29", "2028-03-31"]);
  });
  it("never adds reminders before the start", () => {
    expect(paymentReminderDates("2026-11-09", "2026-10-01", "2026-10-31")).toEqual([]);
  });
});