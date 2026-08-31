import { describe, expect, it } from "vitest";
import { FakeDb } from "./fake-db";
import { acceptTelegramUpdate, rateLimit } from "@/lib/security.server";
import { deriveWebhookSecret } from "@/lib/telegram.server";

const now = () => Math.floor(Date.now() / 1000);

describe("Webhook-Replay-Schutz", () => {
  it("nimmt ein frisches Update an", async () => {
    const db = new FakeDb({ telegram_updates: [] });
    const res = await acceptTelegramUpdate(db as any, {
      update_id: 1,
      message: { date: now(), chat: { id: 5 }, text: "/start" },
    });
    expect(res.accept).toBe(true);
  });

  it("verwirft ein bereits verarbeitetes Update (Telegram-Wiederholung)", async () => {
    const db = new FakeDb({ telegram_updates: [] });
    const update = { update_id: 42, message: { date: now(), chat: { id: 5 }, text: "/start" } };

    const first = await acceptTelegramUpdate(db as any, update);
    expect(first.accept).toBe(true);
    await db.from("telegram_updates").upsert({ update_id: update.update_id }, { onConflict: "update_id" });

    const replay = await acceptTelegramUpdate(db as any, update);
    expect(replay.accept).toBe(false);
    expect(replay.reason).toBe("duplicate update_id");
    expect(db.rows("telegram_updates")).toHaveLength(1);
  });

  it("verwirft veraltete Updates aus einer Wiedereinspielung", async () => {
    const db = new FakeDb({ telegram_updates: [] });
    const res = await acceptTelegramUpdate(db as any, {
      update_id: 99,
      message: { date: now() - 4000, chat: { id: 5 }, text: "alt" },
    });
    expect(res.accept).toBe(false);
    expect(res.reason).toContain("stale");
  });

  it("verwirft Updates ohne update_id", async () => {
    const db = new FakeDb({ telegram_updates: [] });
    const res = await acceptTelegramUpdate(db as any, { message: { date: now() } });
    expect(res.accept).toBe(false);
  });

  it("bremst Update-Fluten pro Absender aus", async () => {
    const db = new FakeDb({ rate_limits: [] });
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await rateLimit(db as any, "tg_update", "777", 3, 60_000));
    expect(results.filter((r) => r.allowed)).toHaveLength(3);
    expect(results.at(-1)!.allowed).toBe(false);
  });

  it("leitet je Bot-Schlüssel ein stabiles, unterschiedliches Webhook-Geheimnis ab", () => {
    const a = deriveWebhookSecret("token-a");
    expect(deriveWebhookSecret("token-a")).toBe(a);
    expect(deriveWebhookSecret("token-b")).not.toBe(a);
  });
});
