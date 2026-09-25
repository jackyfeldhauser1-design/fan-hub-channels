import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Telegram-Setup ueber Supabase Edge Function; kein Lovable-Service-Key noetig. */
async function telegramAdmin(context: any, action: string, payload: Record<string, unknown> = {}) {
  const { data, error } = await context.supabase.functions.invoke("telegram-admin", { body: { action, ...payload } });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(String(data.error));
  return data;
}

export const saveBotToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ token: z.string().trim().min(20).max(200), baseUrl: z.string().url().optional() }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    const { requireCallerRole } = await import("@/lib/auth-context.server");
    const { db } = (await requireCallerRole("admin")) as unknown as { db: any };
    const { verifyToken, clearBotTokenCache, deriveWebhookSecret, tgApi } = await import("@/lib/telegram.server");
    const me = await verifyToken(data.token);

    const { error: credentialError } = await db.from("bot_credentials").upsert(
      { id: true, bot_token: data.token, bot_username: me.username },
      { onConflict: "id" },
    );
    if (credentialError) throw new Error(credentialError.message);
    clearBotTokenCache();

    const { data: settings } = await db.from("bot_settings").select("app_base_url").eq("id", true).maybeSingle();
    const { resolvePublicBaseUrl, resolveTelegramWebhookUrl } = await import("@/lib/base-url");
    const configured = resolvePublicBaseUrl(settings);
    const base = String(data.baseUrl || configured || "").replace(/\/$/, "");
    if (!base) throw new Error("Keine Basis-URL für den Telegram-Webhook hinterlegt.");

    const webhookUrl = resolveTelegramWebhookUrl({ app_base_url: base });
    if (!webhookUrl) throw new Error("Keine Telegram-Webhook-URL verfügbar.");
    await tgApi("setWebhook", {
      url: webhookUrl,
      secret_token: deriveWebhookSecret(data.token),
      allowed_updates: ["message", "edited_message", "callback_query", "pre_checkout_query", "my_chat_member", "channel_post"],
    });
    await db.from("bot_settings").update({ app_base_url: base }).eq("id", true);
    await db.from("admin_audit").insert({
      actor_id: context.userId,
      action: "bot_token_saved",
      target: `@${me.username}`,
      status: "ok",
      detail: `Webhook gesetzt: ${webhookUrl}`,
      meta: {},
    });

    return { username: me.username, webhookUrl, webhookError: "" };
  });

export const startGuidedSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ targets: z.array(z.enum(["community","shop","control"])).min(1).default(["community","shop","control"]) }).parse(d ?? {}))
  .handler(async ({ context, data }) => telegramAdmin(context, "start_setup", data));

export const getSetupProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => telegramAdmin(context, "progress"));

export const resetGuidedSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => telegramAdmin(context, "reset"));

const TARGET = z.enum(["community", "shop", "control"]);

/** Willkommens-/Pin-Vorlagen je Ziel laden. */
export const listChatTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { requireCallerRole } = await import("@/lib/auth-context.server");
    const { db } = (await requireCallerRole("viewer")) as unknown as { db: any };
    const { loadTemplates } = await import("@/lib/setup.server");
    return { items: await loadTemplates(db) };
  });

/** Vorlage speichern. */
export const saveChatTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ target: TARGET, body: z.string().trim().max(3500), pin: z.boolean().default(true) }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { requireCallerRole } = await import("@/lib/auth-context.server");
    const { db } = (await requireCallerRole("admin")) as unknown as { db: any };
    const { error } = await db
      .from("chat_templates")
      .upsert({ target: data.target, welcome_body: data.body, pin_message: data.pin }, { onConflict: "target" });
    if (error) throw new Error(error.message);
    await db.from("admin_audit").insert({
      actor_id: context.userId,
      action: "template_saved",
      target: data.target,
      status: "ok",
      detail: data.body ? `${data.body.length} Zeichen` : "Standardtext wiederhergestellt",
      meta: { pin: data.pin },
    });
    const { loadTemplate } = await import("@/lib/setup.server");
    return loadTemplate(db, data.target);
  });

/** Vorlage sofort in den zugeordneten Chat senden (optional anpinnen). */
export const testChatTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ target: TARGET, body: z.string().trim().max(3500).optional() }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    const { requireCallerRole } = await import("@/lib/auth-context.server");
    const { db } = (await requireCallerRole("admin")) as unknown as { db: any };
    const { enforceRateLimit } = await import("@/lib/security.server");
    await enforceRateLimit(db, "template_test", context.userId, 20, 600_000);

    const { TARGETS, loadTemplate } = await import("@/lib/setup.server");
    const def = TARGETS.find((t) => t.key === data.target)!;
    const { data: settings } = await db.from("bot_settings").select(def.column).eq("id", true).maybeSingle();
    const chatId = String((settings as any)?.[def.column] ?? "").trim();
    if (!chatId) throw new Error(`${def.label} ist noch nicht zugeordnet.`);

    const tpl = await loadTemplate(db, data.target);
    const text = (data.body ?? "").trim() || tpl.welcomeBody;
    const { tgApi } = await import("@/lib/telegram.server");
    const sent = await tgApi("sendMessage", {
      chat_id: chatId,
      text: `${text}\n\n<i>Testnachricht</i>`,
      parse_mode: "HTML",
      disable_notification: true,
    });
    await db.from("admin_audit").insert({
      actor_id: context.userId,
      action: "template_test_post",
      target: def.label,
      chat_id: chatId,
      status: "ok",
      detail: "Testnachricht gesendet",
      meta: { message_id: sent.result?.message_id ?? null },
    });
    return { ok: true, chatId, messageId: sent.result?.message_id ?? null };
  });

/** Bot-Token sicher wechseln: prüfen, speichern, Webhook neu setzen, Altschlüssel kurz gültig lassen. */
export const rotateBotToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        token: z.string().trim().min(20).max(200).regex(/^\d+:[A-Za-z0-9_-]+$/, "Token-Format ungültig"),
        baseUrl: z.string().url().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { requireCallerRole } = await import("@/lib/auth-context.server");
    const { db } = (await requireCallerRole("admin")) as unknown as { db: any };
    const { enforceRateLimit } = await import("@/lib/security.server");
    await enforceRateLimit(db, "rotate_bot_token", context.userId, 5, 3_600_000);

    const { verifyToken, clearBotTokenCache, deriveWebhookSecret, tgApi } = await import("@/lib/telegram.server");
    const me = await verifyToken(data.token);

    const { data: current } = await db.from("bot_credentials").select("bot_token").eq("id", true).maybeSingle();
    const oldToken = String(current?.bot_token ?? "");
    if (oldToken && oldToken === data.token) throw new Error("Das ist bereits der aktive Token.");

    // Übergangsfrist: alter Webhook-Schlüssel bleibt 10 Minuten gültig – kein Ausfall.
    const graceUntil = new Date(Date.now() + 10 * 60_000).toISOString();
    const { error } = await db.from("bot_credentials").upsert(
      {
        id: true,
        bot_token: data.token,
        bot_username: me.username,
        previous_token: oldToken,
        previous_valid_until: oldToken ? graceUntil : null,
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(error.message);
    clearBotTokenCache();

    const { data: settings } = await db.from("bot_settings").select("app_base_url").eq("id", true).maybeSingle();
    const base = (data.baseUrl || settings?.app_base_url || "").replace(/\/$/, "");
    let webhookUrl = "";
    let webhookError = "";
    if (base) {
      webhookUrl = `${base}/api/public/telegram/webhook`;
      try {
        await tgApi("setWebhook", {
          url: webhookUrl,
          secret_token: deriveWebhookSecret(data.token),
          allowed_updates: ["message", "edited_message", "callback_query", "pre_checkout_query", "my_chat_member", "channel_post"],
        });
        await db.from("bot_settings").update({ app_base_url: base }).eq("id", true);
      } catch (e) {
        webhookError = e instanceof Error ? e.message.slice(0, 200) : "Webhook konnte nicht gesetzt werden";
        webhookUrl = "";
      }
    } else {
      webhookError = "Keine Basis-URL hinterlegt – Webhook nicht gesetzt.";
    }

    await db.from("admin_audit").insert({
      actor_id: context.userId,
      action: "bot_token_rotated",
      target: `@${me.username}`,
      status: webhookUrl ? "ok" : "warn",
      detail: webhookUrl ? `Webhook neu gesetzt: ${webhookUrl}` : webhookError,
      meta: { grace_until: oldToken ? graceUntil : null },
    });

    return {
      username: me.username,
      webhookUrl,
      webhookError,
      graceUntil: oldToken ? graceUntil : null,
    };
  });

/** Setup-Prüfung mit konkreten Fehlermeldungen. */
export const verifySetupStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { requireCallerRole } = await import("@/lib/auth-context.server");
    const { db } = (await requireCallerRole("admin")) as unknown as { db: any };
    const { verifySetup } = await import("@/lib/setup.server");
    return verifySetup(db);
  });

/** Admin-Audit der Telegram-Zuordnung und Posts als CSV oder JSON exportieren. */
export const exportSetupAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        format: z.enum(["csv", "json"]).default("csv"),
        limit: z.number().int().min(1).max(5000).default(1000),
        days: z.number().int().min(1).max(365).default(90),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireCallerRole } = await import("@/lib/auth-context.server");
    const { db } = (await requireCallerRole("admin")) as unknown as { db: any };
    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();
    const { data: rows, error } = await db
      .from("admin_audit")
      .select("created_at, action, target, chat_id, status, detail, actor_email, meta")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as any[];

    if (data.format === "json") {
      return {
        filename: `telegram-audit-${new Date().toISOString().slice(0, 10)}.json`,
        mime: "application/json",
        content: JSON.stringify(list, null, 2),
        count: list.length,
      };
    }

    const cols = ["created_at", "action", "target", "chat_id", "status", "detail", "actor_email"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.join(","), ...list.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
    return {
      filename: `telegram-audit-${new Date().toISOString().slice(0, 10)}.csv`,
      mime: "text/csv",
      content: csv,
      count: list.length,
    };
  });

/** Livegang-Prüfung: Bot, Webhook, Chats, Katalog, Medien, Jobs und Zustellungen auf einmal. */
export const runGoLiveCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireCallerRole } = await import("@/lib/auth-context.server");
    const { db } = (await requireCallerRole("admin")) as unknown as { db: any };
    const { enforceRateLimit } = await import("@/lib/security.server");
    await enforceRateLimit(db, "golive_check", context.userId, 20, 600_000);

    const { buildGoLiveReport } = await import("@/lib/setup.server");
    const report = await buildGoLiveReport(db);

    await db.from("admin_audit").insert({
      actor_id: context.userId,
      action: "golive_check",
      status: report.ok ? "ok" : "warn",
      detail: `${report.passed}/${report.total} Prüfungen bestanden`,
      meta: { groups: report.groups },
    });

    return {
      groups: report.groups,
      passed: report.passed,
      total: report.total,
      ok: report.ok,
      checkedAt: report.checkedAt,
    };
  });

/** Startpaket: VIP-Zugang, digitaler Einzelinhalt, Trinkgeld und ein Medien-Ordner. */
export const seedStarterCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireCallerRole } = await import("@/lib/auth-context.server");
    const { db } = (await requireCallerRole("admin")) as unknown as { db: any };
    const { enforceRateLimit } = await import("@/lib/security.server");
    await enforceRateLimit(db, "seed_catalog", context.userId, 5, 3_600_000);

    const { data: settings } = await db.from("bot_settings").select("vip_price_stars").eq("id", true).maybeSingle();
    const vipPrice = Math.max(1, Number(settings?.vip_price_stars ?? 450));

    const wanted = [
      {
        title: "VIP-Zugang",
        description: "Dauerhafter Zugang zum VIP-Shop-Channel mit allen Drops und Angeboten.",
        kind: "single" as const,
        price_stars: vipPrice,
        delivery_type: "text" as const,
        delivery_payload: "Willkommen im VIP-Bereich! Dein Zugang wird direkt im Bot freigeschaltet.",
        sort_order: 1,
      },
      {
        title: "Digitaler Inhalt #1",
        description: "Erster digitaler Inhalt – Zugang über einen persönlichen Einmal-Link.",
        kind: "single" as const,
        price_stars: 150,
        delivery_type: "link" as const,
        delivery_payload: "",
        sort_order: 2,
      },
      {
        title: "Trinkgeld",
        description: "Kleine Unterstützung – danke!",
        kind: "tip" as const,
        price_stars: 50,
        delivery_type: "text" as const,
        delivery_payload: "💛 Danke für deine Unterstützung!",
        sort_order: 9,
      },
    ];

    const created: string[] = [];
    const skipped: string[] = [];
    let contentProductId: string | null = null;

    for (const p of wanted) {
      const { data: existing } = await db.from("products").select("id").eq("title", p.title).maybeSingle();
      if (existing) {
        skipped.push(p.title);
        if (p.title === "Digitaler Inhalt #1") contentProductId = existing.id;
        continue;
      }
      const { data: row, error } = await db
        .from("products")
        .insert({ ...p, active: true })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      created.push(p.title);
      if (p.title === "Digitaler Inhalt #1") contentProductId = row?.id ?? null;
    }

    const { data: folder } = await db.from("media_folders").select("id").eq("title", "Erster Drop").maybeSingle();
    let folderId = folder?.id ?? null;
    if (!folderId) {
      const { data: row, error } = await db
        .from("media_folders")
        .insert({
          title: "Erster Drop",
          description: "Lade hier deine ersten geschützten Medien hoch.",
          price_stars: 150,
          active: true,
          sort_order: 1,
          product_id: contentProductId,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      folderId = row?.id ?? null;
      created.push("Medien-Ordner „Erster Drop“");
    } else {
      skipped.push("Medien-Ordner „Erster Drop“");
    }

    await db.from("admin_audit").insert({
      actor_id: context.userId,
      action: "starter_catalog",
      status: "ok",
      detail: created.length ? `Angelegt: ${created.join(", ")}` : "Nichts Neues – alles vorhanden",
      meta: { created, skipped, folder_id: folderId },
    });

    return { created, skipped, folderId };
  });

