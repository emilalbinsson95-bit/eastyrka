import { describe, expect, it } from "vitest";
import { isArchivedPath, isArchivedRole, pickAvailableRole } from "./moduleAvailability";

describe("temporary rehab archive", () => {
  it("locks patient and all patient descendants", () => {
    expect(isArchivedRole("patient")).toBe(true);
    expect(isArchivedPath("/patient")).toBe(true);
    expect(isArchivedPath("/patient/sessions/123")).toBe(true);
  });
  it("locks physio and all physio descendants", () => {
    expect(isArchivedRole("physio")).toBe(true);
    expect(isArchivedPath("/physio")).toBe(true);
    expect(isArchivedPath("/physio/patients/123/sessions/456")).toBe(true);
  });
  it("leaves coach, athlete and similarly prefixed paths available", () => {
    expect(isArchivedRole("coach")).toBe(false);
    expect(isArchivedRole("athlete")).toBe(false);
    expect(isArchivedPath("/coach/athletes/123")).toBe(false);
    expect(isArchivedPath("/today")).toBe(false);
    expect(isArchivedPath("/patient-info")).toBe(false);
  });
  it("ignores an archived saved view when an active role exists", () => {
    expect(pickAvailableRole(["physio", "athlete"], "physio")).toBe("athlete");
    expect(pickAvailableRole(["patient", "coach"], "patient")).toBe("coach");
  });
  it("preserves archived-only account identity without granting another role", () => {
    expect(pickAvailableRole(["patient"], "patient")).toBe("patient");
    expect(pickAvailableRole([], null)).toBeNull();
  });
});