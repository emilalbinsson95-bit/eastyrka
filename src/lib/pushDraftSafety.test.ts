import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("drizzle/migrations/0040_push_future_draft_only.sql", "utf8");
describe("future push prescription protection", () => {
  it("requires draft status before updating future prescriptions", () => {
    expect(sql).toContain("AND wp.status=''draft''");
  });
  it("excludes deload, ramp, peak and taper from future changes", () => {
    expect(sql).toContain("AND NOT wp.is_deload");
    expect(sql).toContain("NOT IN (''deload'',''ramp'',''peak'',''taper'')");
  });
});