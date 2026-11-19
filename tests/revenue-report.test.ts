import { describe, expect, it } from "vitest";
import { last24Hours, summarizePaid } from "../supabase/functions/_shared/revenue-report";

describe("revenue reporting", () => {
  it("separates Stars and TON without converting between them", () => {
    expect(summarizePaid([
      { currency: "stars", amount_stars: 100 },
      { currency: "ton", amount_ton: 0.5 },
      { currency: "stars", amount_stars: 200 },
    ])).toEqual({ stars: 300, ton: 0.5, purchases: 3 });
  });

  it("uses a complete rolling day even when Berlin switches daylight-saving time", () => {
    for (const date of ["2026-03-29T07:00:00Z", "2026-10-25T07:00:00Z"]) {
      expect(Date.parse(date) - Date.parse(last24Hours(Date.parse(date)))).toBe(86_400_000);
    }
  });
});
