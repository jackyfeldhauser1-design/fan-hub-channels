import { describe, expect, it } from "vitest";
import { crossSellDue, hasContactConsent, loadContactPermission, promoWindowOpen } from "../supabase/functions/_shared/retention-policy";
import { FakeDb } from "./fake-db";

const consent = { ageVerified: true, consent: true, optedOut: false };

describe("scheduled retention contact", () => {
  it.each([
    ["2026-11-12T06:59:00Z", false],
    ["2026-11-12T07:00:00Z", true],
    ["2026-11-12T20:59:00Z", true],
    ["2026-11-12T21:00:00Z", false],
    ["2026-07-12T05:59:00Z", false],
    ["2026-07-12T06:00:00Z", true],
    ["2026-07-12T20:00:00Z", false],
  ])("applies Berlin quiet hours at %s", (date, allowed) => {
    expect(promoWindowOpen(new Date(date))).toBe(allowed);
  });

  it("requires explicit current consent and respects blocks and opt-out", () => {
    expect(hasContactConsent(consent)).toBe(true);
    expect(hasContactConsent(consent, true)).toBe(false);
    expect(hasContactConsent({ ...consent, optedOut: true })).toBe(false);
    expect(hasContactConsent({ ...consent, ageVerified: false })).toBe(false);
    expect(hasContactConsent({ consent: "true", ageVerified: true })).toBe(false);
    expect(hasContactConsent(null)).toBe(false);
  });

  it("uses the latest onboarding decision, not an older consent", async () => {
    const db = new FakeDb({
      tg_users: [{ id: "fan", blocked: false }],
      action_log: [
        { tg_user_id: "fan", action: "telegram_onboarding", created_at: "2026-11-01", meta: JSON.stringify(consent) },
        { tg_user_id: "fan", action: "telegram_onboarding", created_at: "2026-11-02", meta: JSON.stringify({ ...consent, optedOut: true }) },
      ],
    });
    expect(await loadContactPermission(db, "fan")).toBe(false);
    db.rows("action_log")[1]!.meta = JSON.stringify(consent);
    expect(await loadContactPermission(db, "fan")).toBe(true);
    db.rows("tg_users")[0]!.blocked = true;
    expect(await loadContactPermission(db, "fan")).toBe(false);
    expect(await loadContactPermission(db, "unknown")).toBe(false);
    db.rows("action_log")[1]!.meta = "invalid JSON";
    expect(await loadContactPermission(db, "fan")).toBe(false);
  });

  it("propagates database errors instead of allowing contact", async () => {
    const error = new Error("permission lookup unavailable");
    const query: any = { select: () => query, eq: () => query, order: () => query, limit: () => query, maybeSingle: async () => ({ error }) };
    await expect(loadContactPermission({ from: () => query }, "fan")).rejects.toThrow(error);
  });

  it("waits 24 hours after the latest open without recommending stale activity", () => {
    const now = Date.parse("2026-11-12T12:00:00Z");
    expect(crossSellDue("2026-11-12T11:00:00Z", 24, now)).toBe(false);
    expect(crossSellDue("2026-11-11T12:00:00Z", 24, now)).toBe(true);
    expect(crossSellDue("2026-11-10T12:00:00Z", 24, now)).toBe(true);
    expect(crossSellDue("2026-11-04T12:00:00Z", 24, now)).toBe(false);
    expect(crossSellDue("2026-11-13T12:00:00Z", 24, now)).toBe(false);
    expect(crossSellDue(null, 24, now)).toBe(false);
  });
});
