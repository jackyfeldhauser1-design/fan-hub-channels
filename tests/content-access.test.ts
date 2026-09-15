import { describe, expect, it } from "vitest";
import { accessExpiry } from "../src/lib/content.server";

describe("content access windows", () => {
  it("keeps permanent access without expiry", () => {
    expect(accessExpiry("permanent", null, 0)).toBeNull();
  });

  it("calculates a bounded hourly expiry", () => {
    expect(accessExpiry("hours", 24, 0)).toBe(new Date(24 * 3600_000).toISOString());
  });

  it("uses at least one hour", () => {
    expect(accessExpiry("hours", 0, 0)).toBe(new Date(3600_000).toISOString());
  });
});
