import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const token = "test-token";
const secret = createHash("sha256").update("telegram-webhook:" + token).digest("base64url");
const telegramUser = { id: 4242, first_name: "Fan" };
const setId = "00000000-0000-4000-8000-000000000001";
const productId = "00000000-0000-4000-8000-000000000002";

const source = readFileSync(
  new URL("../supabase/functions/telegram-webhook/index.ts", import.meta.url),
  "utf8",
).replace(/^import .*;\r?\n/gm, "");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
});

type Grant = {
  id: string;
  tg_user_id: string;
  content_set_id: string;
  status: string;
  expires_at: string | null;
  content_sets: { title: string };
};

function grant(contentId: string, patch: Partial<Grant> = {}): Grant {
  return {
    id: contentId,
    tg_user_id: "buyer",
    content_set_id: contentId,
    status: "active",
    expires_at: null,
    content_sets: { title: contentId },
    ...patch,
  };
}

function fixture(grants: Grant[], failAccess = false) {
  const calls: Array<{ method: string; body: Record<string, unknown> }> = [];
  const accessQueries: URL[] = [];
  const requests: string[] = [];
  const upstream: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "api.telegram.org") {
      calls.push({ method: url.pathname.split("/").at(-1)!, body: JSON.parse(String(init?.body)) });
      return Response.json({ ok: true, result: { message_id: calls.length } });
    }
    const table = url.pathname.split("/").at(-1);
    requests.push((init?.method ?? "GET") + " " + table);
    if (url.pathname.includes("/storage/v1/object/sign/")) {
      return Response.json({ signedURL: "/object/sign/media-vault/example.jpg?token=test" });
    }
    if (init?.method === "POST") return Response.json([]);
    if (init?.method === "PATCH") return new Response(null, { status: 204 });
    if (table === "bot_credentials") return Response.json([{ bot_token: token }]);
    if (table === "tg_users") return Response.json([{ id: "buyer", telegram_id: telegramUser.id }]);
    if (table === "content_access") {
      if (failAccess) return Response.json({ message: "temporary failure" }, { status: 503 });
      accessQueries.push(url);
      const params = url.searchParams;
      const cutoff = params.get("or")?.split("expires_at.gt.")[1]?.slice(0, -1) ?? "";
      const offset = Number(params.get("offset") ?? 0);
      const limit = Number(params.get("limit") ?? grants.length);
      const rows = grants.filter((entry) =>
        params.get("tg_user_id") === "eq." + entry.tg_user_id
        && params.get("status") === "eq." + entry.status
        && (!params.has("content_set_id") || params.get("content_set_id") === "eq." + entry.content_set_id)
        && (entry.expires_at === null || entry.expires_at > cutoff),
      );
      return Response.json(rows.slice(offset, offset + limit));
    }
    if (table === "content_sets") return Response.json([{ id: setId, product_id: productId }]);
    if (table === "products") return Response.json([{ id: productId, title: "Testset", price_stars: 100 }]);
    if (table === "content_set_items") {
      return Response.json([{ media_files: { storage_path: "example.jpg", mime_type: "image/jpeg" } }]);
    }
    return Response.json([]);
  };

  let handler: (request: Request) => Promise<Response>;
  new Function("Deno", "EdgeRuntime", "createClient", "fetch", outputText)(
    { env: { get: () => "" }, serve: (callback: typeof handler) => { handler = callback; } },
    { waitUntil: () => {} },
    () => createClient("https://database.example", "test-key", {
      global: { fetch: upstream },
      auth: { persistSession: false },
    }),
    upstream,
  );

  let updateId = 0;
  async function send(update: object) {
    return handler(new Request("https://example.test/telegram-webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret },
      body: JSON.stringify({ update_id: ++updateId, ...update }),
    }));
  }
  function message(text: string) {
    return send({ message: { text, chat: { id: telegramUser.id, type: "private" }, from: telegramUser } });
  }
  function tap(data: string, chat = { id: telegramUser.id, type: "private" }) {
    return send({ callback_query: { id: "tap", data, from: telegramUser, message: { chat } } });
  }
  function buttons() {
    const markup = calls.filter((entry) => entry.method === "sendMessage").at(-1)?.body.reply_markup;
    return (markup as { inline_keyboard: Array<Array<{ callback_data: string }>> })
      .inline_keyboard.flat().map((button) => button.callback_data);
  }
  return { message, tap, buttons, calls, accessQueries, requests };
}

describe("Supabase Telegram webhook · purchased sets", () => {
  it("lists permanent and time-limited sets on subsequent pages", async () => {
    const active = Array.from({ length: 19 }, (_, i) => grant("set-" + (i + 1)));
    active[18]!.expires_at = "2099-01-01T00:00:00Z";
    const bot = fixture([
      grant("expired", { expires_at: "2000-01-01T00:00:00Z" }),
      grant("other-user", { tg_user_id: "someone-else" }),
      grant("revoked", { status: "revoked" }),
      ...active,
    ]);
    expect((await bot.message("/inhalte")).status).toBe(200);
    expect(bot.buttons().filter((button) => button.startsWith("content_"))).toHaveLength(12);
    expect(bot.buttons()).toContain("my_content_1");
    expect((await bot.tap("my_content_1")).status).toBe(200);
    expect(bot.buttons().filter((button) => button.startsWith("content_"))).toEqual(
      active.slice(12).map((row) => "content_" + row.content_set_id),
    );
    expect(bot.buttons()).toContain("my_content_0");
    expect(bot.buttons()).not.toContain("my_content_2");
    expect(bot.accessQueries.at(-1)?.searchParams.get("order")).toBe("granted_at.desc,id.desc");
  });

  it("reopens an owned teaser set in the private chat without a payment", async () => {
    const bot = fixture([grant(setId)]);
    expect((await bot.message("/start c_" + setId + "_free_A")).status).toBe(200);
    expect(bot.buttons()).toContain("content_" + setId);
    expect((await bot.tap("stars_" + setId)).status).toBe(200);
    expect(bot.buttons()).toContain("content_" + setId);
    expect((await bot.tap("ton_" + setId)).status).toBe(200);
    expect(bot.buttons()).toContain("content_" + setId);
    expect((await bot.tap("content_" + setId)).status).toBe(200);
    expect(bot.calls.filter((call) => call.method === "sendPhoto")).toMatchObject([
      { body: { chat_id: telegramUser.id, protect_content: true } },
    ]);
    expect(bot.calls.some((call) => call.method === "sendInvoice")).toBe(false);
    expect(bot.requests).not.toContain("POST purchases");
  });

  it("keeps checkout available for a set with expired access", async () => {
    const bot = fixture([grant(setId, { expires_at: "2000-01-01T00:00:00Z" })]);
    expect((await bot.message("/start c_" + setId)).status).toBe(200);
    expect(bot.buttons()).toContain("stars_" + setId);
    expect(bot.buttons()).not.toContain("content_" + setId);
  });

  it("rejects expired, foreign and non-private access before sending media", async () => {
    const denied = fixture([grant(setId, { tg_user_id: "other-user" })]);
    expect((await denied.tap("content_" + setId)).status).toBe(200);
    expect(denied.buttons()).toContain("my_content");
    const expired = fixture([grant(setId, { expires_at: "2000-01-01T00:00:00Z" })]);
    expect((await expired.tap("content_" + setId)).status).toBe(200);
    const group = fixture([grant(setId)]);
    expect((await group.tap("content_" + setId, { id: -1001, type: "supergroup" })).status).toBe(200);
    for (const bot of [denied, expired, group]) {
      expect(bot.calls.some((call) => call.method === "sendPhoto")).toBe(false);
    }
    expect(group.accessQueries).toHaveLength(0);
  });

  it("does not offer payment if access verification fails", async () => {
    const bot = fixture([], true);
    expect((await bot.message("/start c_" + setId)).status).toBe(500);
    expect(bot.calls).toHaveLength(0);
    expect(bot.requests).not.toContain("POST purchases");
  });
});
