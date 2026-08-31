import { describe, expect, it } from "vitest";
import { FakeDb } from "./fake-db";
import {
  activeSubscription,
  checkDiscount,
  closeInvoiceIntents,
  recordInvoiceIntent,
  redeemDiscount,
  startOrRenewSubscription,
} from "@/lib/billing.server";

/** Bildet die Idempotenz-Regel des Webhooks nach: eine Ladung = ein Kauf. */
async function bookPayment(db: FakeDb, charge: { id: string; user: string; amount: number; payload: string }) {
  const { data: already } = await db
    .from("purchases")
    .select("id")
    .eq("telegram_charge_id", charge.id)
    .maybeSingle();
  if (already) return { duplicate: true, purchaseId: already.id as string };

  const { data: purchase } = await db
    .from("purchases")
    .insert({
      tg_user_id: charge.user,
      amount_stars: charge.amount,
      currency: "stars",
      status: "paid",
      telegram_charge_id: charge.id,
    })
    .select("id")
    .single();
  await closeInvoiceIntents(db as any, charge.user, charge.payload);
  return { duplicate: false, purchaseId: purchase!.id as string };
}

describe("Zahlungs-Idempotenz", () => {
  it("legt bei doppelt zugestellter Zahlung nur einen Kauf an", async () => {
    const db = new FakeDb({ purchases: [], invoice_intents: [] });
    await recordInvoiceIntent(db as any, "fan1", 555, "vip:450", "VIP", 450);

    const first = await bookPayment(db, { id: "chg_1", user: "fan1", amount: 450, payload: "vip:450" });
    const replay = await bookPayment(db, { id: "chg_1", user: "fan1", amount: 450, payload: "vip:450" });

    expect(first.duplicate).toBe(false);
    expect(replay.duplicate).toBe(true);
    expect(replay.purchaseId).toBe(first.purchaseId);
    expect(db.rows("purchases")).toHaveLength(1);
    expect(db.rows("invoice_intents")[0]!["paid"]).toBe(true);
  });

  it("verarbeitet unterschiedliche Ladungen desselben Fans weiterhin einzeln", async () => {
    const db = new FakeDb({ purchases: [], invoice_intents: [] });
    await bookPayment(db, { id: "chg_a", user: "fan1", amount: 100, payload: "tip" });
    await bookPayment(db, { id: "chg_b", user: "fan1", amount: 100, payload: "tip" });
    expect(db.rows("purchases")).toHaveLength(2);
  });

  it("verlängert ein VIP-Abo bei Wiederholung statt es zu duplizieren", async () => {
    const db = new FakeDb({ subscriptions: [] });
    const first = await startOrRenewSubscription(db as any, "fan1", 30, "p1");
    const renewed = await startOrRenewSubscription(db as any, "fan1", 30, "p2");

    expect(db.rows("subscriptions")).toHaveLength(1);
    expect(renewed.renewed).toBe(true);
    expect(new Date(renewed.expires_at!).getTime()).toBeGreaterThan(new Date(first.expires_at!).getTime());
    expect(await activeSubscription(db as any, "fan1")).toBeTruthy();
  });

  it("meldet ein abgelaufenes Abo als inaktiv", async () => {
    const db = new FakeDb({
      subscriptions: [
        {
          tg_user_id: "fan1",
          plan: "vip",
          status: "active",
          expires_at: new Date(Date.now() - 86_400_000).toISOString(),
        },
      ],
    });
    expect(await activeSubscription(db as any, "fan1")).toBeNull();
  });
});

describe("Rabattcodes", () => {
  const seed = () =>
    new FakeDb({
      discount_codes: [
        {
          id: "code1",
          code: "SOMMER",
          percent_off: 10,
          stars_off: 0,
          active: true,
          max_uses: 1,
          used_count: 0,
          once_per_fan: true,
          expires_at: null,
        },
      ],
      code_redemptions: [],
    });

  it("rechnet den Rabatt korrekt auf den Preis an", async () => {
    const db = seed();
    const res = await checkDiscount(db as any, "sommer", "fan1", 450);
    expect(res.ok).toBe(true);
    expect(res.price).toBe(405);
    expect(res.saved).toBe(45);
  });

  it("blockt die zweite Einlösung desselben Fans", async () => {
    const db = seed();
    const ok = await checkDiscount(db as any, "SOMMER", "fan1", 450);
    await redeemDiscount(db as any, ok.discount!.id, "fan1", "p1", ok.saved);

    const again = await checkDiscount(db as any, "SOMMER", "fan1", 450);
    expect(again.ok).toBe(false);
    expect(db.rows("code_redemptions")).toHaveLength(1);
    expect(db.rows("discount_codes")[0]!["used_count"]).toBe(1);
  });

  it("blockt aufgebrauchte und abgelaufene Codes", async () => {
    const db = seed();
    db.rows("discount_codes")[0]!["used_count"] = 1;
    expect((await checkDiscount(db as any, "SOMMER", "fan2", 450)).ok).toBe(false);

    db.rows("discount_codes")[0]!["used_count"] = 0;
    db.rows("discount_codes")[0]!["expires_at"] = new Date(Date.now() - 1000).toISOString();
    expect((await checkDiscount(db as any, "SOMMER", "fan2", 450)).ok).toBe(false);
  });

  it("lehnt unbekannte Codes ab", async () => {
    const db = seed();
    expect((await checkDiscount(db as any, "WINTER", "fan1", 450)).ok).toBe(false);
  });
});
