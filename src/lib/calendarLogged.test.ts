import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { markLoggedPlannedItems, type CalendarItem } from "./calendar";

function planned(id: string, extra: Partial<CalendarItem> = {}): CalendarItem {
  return {
    key: `planned:${id}`, source: "planned", sourceId: id, ownerId: "a", title: id,
    suggestedDate: "2026-10-27", effectiveDate: "2026-10-27", isGhost: true, isCancelled: false, ...extra,
  };
}

describe("markLoggedPlannedItems", () => {
  it("shows a planned session with logged sets as done instead of suggested", () => {
    const items = [planned("s1"), planned("s2")];
    markLoggedPlannedItems(items, new Map([["e1", "s1"], ["e2", "s2"]]), ["e1"]);
    expect(items[0].isGhost).toBe(false);
    expect(items[0].isLogged).toBe(true);
    expect(items[1].isGhost).toBe(true);
    expect(items[1].isLogged).toBeUndefined();
  });

  it("keeps a cancelled session cancelled even if sets exist", () => {
    const items = [planned("s1", { isCancelled: true, isGhost: false })];
    markLoggedPlannedItems(items, new Map([["e1", "s1"]]), ["e1"]);
    expect(items[0].isLogged).toBeUndefined();
  });
});
