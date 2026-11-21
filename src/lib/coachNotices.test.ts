import { describe, expect, it } from "vitest";
import { isNoticeCurrent, resolveRecipients, stockholmToday } from "./coachNotices";

describe("coach notices", () => {
  it("uses the Swedish date, so a notice for Sunday still shows late Sunday evening", () => {
    expect(stockholmToday(new Date("2026-11-22T22:30:00Z"))).toBe("2026-11-22");
    expect(stockholmToday(new Date("2026-11-22T23:30:00Z"))).toBe("2026-11-23");
  });
  it("shows the notice through its last day and hides it the day after", () => {
    expect(isNoticeCurrent("2026-11-22", "2026-11-22")).toBe(true);
    expect(isNoticeCurrent("2026-11-22", "2026-11-23")).toBe(false);
    expect(isNoticeCurrent(null, "2030-01-01")).toBe(true);
  });
  it("sends to all athletes or only to the chosen ones", () => {
    expect(resolveRecipients("all", ["a"])).toBeNull();
    expect(resolveRecipients("pick", ["a", "b", "a"])).toEqual(["a", "b"]);
  });
});
