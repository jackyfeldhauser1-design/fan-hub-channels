import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("crypto cron routing", () => {
  it("targets the internal Fan Hub API instead of the retired public domain", () => {
    const migration = readFileSync(
      "supabase/migrations/20261109204424_schedule_crypto_payment_verification.sql",
      "utf8",
    );
    expect(migration).toContain(
      "https://fan-hub-vercel2.vercel.app/api/public/jobs/crypto",
    );
    expect(migration).not.toContain("https://itsfelize.store");
    expect(migration).toContain("fan-hub-crypto-verification");
    expect(migration).toContain("fan_hub_cart_recovery_token");
  });
});
