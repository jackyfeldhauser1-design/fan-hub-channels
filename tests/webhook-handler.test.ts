import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb } from "./fake-db";

const SECRET = "test-secret";
const sent: Array<{ method: string; body: any }> = [];

let db: FakeDb;

vi.mock("@/lib/telegram.server", () => ({
  validWebhookSecrets: async () => [SECRET],
  currentWebhookSecret: async () => SECRET,
  deriveWebhookSecret: (k: string) => k,
  getBotToken: async () => ({ token: "t", username: "bot" }),
  tgSafe: async (method: string, body: any) => {
    sent.push({ method, body });
    return { message_id: sent.length };
  },
  tgApi: async (method: string, body: any) => {
    sent.push({ method, body });
    return { ok: true, result: { message_id: sent.length } };
  },
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return db;
  },
}));

async function handler() {
  const mod = await import("@/routes/api/public/telegram/webhook");
  const route = mod.Route as any;
  const post = (route.options ?? route)?.server?.handlers?.POST;
  if (!post) throw new Error("POST-Handler nicht gefunden");
  return post as (ctx: { request: Request }) => Promise<Response>;
}

function post(update: unknown, secret = SECRET) {
  return new Request("http://localhost/api/public/telegram/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": secret },
    body: JSON.stringify(update),
  });
}

const paymentUpdate = (updateId: number, chargeId: string) => ({
  update_id: updateId,
  message: {
    message_id: updateId,
    date: Math.floor(Date.now() / 1000),
    chat: { id: 4242, type: "private" },
    from: { id: 4242, username: "fan", first_name: "Fan" },
    successful_payment: {
      currency: "XTR",
      total_amount: 450,
      invoice_payload: "vip:450",
      telegram_payment_charge_id: chargeId,
      provider_payment_charge_id: "prov_1",
    },
  },
});

beforeEach(() => {
  sent.length = 0;
  db = new FakeDb({
    telegram_updates: [],
    rate_limits: [],
    bot_settings: [{ id: true, vip_price_stars: 450, vip_period_days: 30, sequence_enabled: false }],
    tg_users: [],
    purchases: [],
    subscriptions: [],
    invoice_intents: [],
    order_events: [],
    action_log: [],
    products: [],
    fan_sequences: [],
  });
});

describe("Telegram-Webhook Integration", () => {
  it("weist Anfragen mit falschem Signatur-Geheimnis ab", async () => {
    const res = await (await handler())({ request: post(paymentUpdate(1, "chg_x"), "falsch") });
    expect(res.status).toBe(401);
    expect(db.rows("purchases")).toHaveLength(0);
  });

  it("weist unlesbare Nutzlast ab", async () => {
    const req = new Request("http://localhost/api/public/telegram/webhook", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": SECRET },
      body: "kein-json",
    });
    const res = await (await handler())({ request: req });
    expect(res.status).toBe(400);
  });

  it("bucht eine Stars-Zahlung genau einmal, auch bei Telegram-Wiederholung", async () => {
    const run = await handler();

    const first = await run({ request: post(paymentUpdate(10, "chg_1")) });
    expect(first.status).toBe(200);
    expect(db.rows("purchases")).toHaveLength(1);

    // 1) identische Wiedereinspielung (gleiche update_id) -> Replay-Schutz
    const sameUpdate = await run({ request: post(paymentUpdate(10, "chg_1")) });
    expect(await sameUpdate.json()).toMatchObject({ ignored: "duplicate update_id" });

    // 2) neue update_id, gleiche Zahlung -> Idempotenz über telegram_charge_id
    const sameCharge = await run({ request: post(paymentUpdate(11, "chg_1")) });
    expect(await sameCharge.json()).toMatchObject({ duplicate: true });

    expect(db.rows("purchases")).toHaveLength(1);
    expect(db.rows("subscriptions").length).toBeLessThanOrEqual(1);
  });

  it("verarbeitet eine echte zweite Zahlung mit neuer Ladungs-ID", async () => {
    const run = await handler();
    await run({ request: post(paymentUpdate(20, "chg_a")) });
    await run({ request: post(paymentUpdate(21, "chg_b")) });
    expect(db.rows("purchases")).toHaveLength(2);
  });
});
