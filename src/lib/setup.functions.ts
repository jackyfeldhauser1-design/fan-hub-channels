import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Bestehenden Bot-Token speichern, prüfen und Webhook setzen. */
export const saveBotToken = createServerFn({ method: "POST" })
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
    await enforceRateLimit(db, "save_bot_token", context.userId, 10, 600_000);

    const { verifyToken, clearBotTokenCache, deriveWebhookSecret } = await import("@/lib/telegram.server");
    const me = await verifyToken(data.token);

    const { error } = await db
      .from("bot_credentials")
      .upsert({ id: true, bot_token: data.token, bot_username: me.username }, { onConflict: "id" });
    if (error) throw new Error(error.message);
    clearBotTokenCache();

    const { data: settings } = await db.from("bot_settings").select("app_base_url").eq("id", true).maybeSingle();
    const base = (data.baseUrl || settings?.app_base_url || "").replace(/\/$/, "");
    let webhookUrl = "";
    let webhookError = "";
    if (base) {
      const { tgApi } = await import("@/lib/telegram.server");
      webhookUrl = `${base}/api/public/telegram/webhook`;
      try {
        await tgApi("setWebhook", {
          url: webhookUrl,
          secret_token: deriveWebhookSecret(data.token),
          allowed_updates: ["message", "edited_message", "callback_query", "pre_checkout_query", "my_chat_member", "channel_post"],
        });
        await db.from("bot_settings").update({ app_base_url: base }).eq("id", true);
      } catch (e) {
        webhookError = e instanceof Error ? e.message.slice(0, 200) : "Webhook fehlgeschlagen";
        webhookUrl = "";
      }
    }

    await db.from("admin_audit").insert({
      actor_id: context.userId,
      action: "bot_token_saved",
      target: `@${me.username}`,
      status: webhookUrl ? "ok" : "warn",
      detail: webhookUrl || webhookError || "Kein Webhook gesetzt",
      meta: {},
    });

    return { username: me.username, link: `https://t.me/${me.username}`, webhookUrl, webhookError };
  });

/** Einrichtungs-Codes und Telegram-Links für die drei Ziele erzeugen. */
export const startGuidedSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ targets: z.array(z.enum(["community", "shop", "control"])).min(1).default(["community", "shop", "control"]) })
      .parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { requireCallerRole } = await import("@/lib/auth-context.server");
    const { db } = (await requireCallerRole("admin")) as unknown as { db: any };
    const { enforceRateLimit } = await import("@/lib/security.server");
    await enforceRateLimit(db, "guided_setup", context.userId, 20, 600_000);
    const { createSetupCodes } = await import("@/lib/setup.server");
    return createSetupCodes(db, data.targets, context.userId);
  });

/** Live-Fortschritt des geführten Setups. */
export const getSetupProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { requireCallerRole } = await import("@/lib/auth-context.server");
    const { db } = (await requireCallerRole("viewer")) as unknown as { db: any };
    const { readSetupProgress } = await import("@/lib/setup.server");
    return readSetupProgress(db);
  });

/** Zuordnung zurücksetzen und neu einrichten. */
export const resetGuidedSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireCallerRole } = await import("@/lib/auth-context.server");
    const { db } = (await requireCallerRole("admin")) as unknown as { db: any };
    const { enforceRateLimit } = await import("@/lib/security.server");
    await enforceRateLimit(db, "guided_setup_reset", context.userId, 10, 600_000);
    const { data: before } = await db
      .from("bot_settings")
      .select("community_chat_id, shop_chat_id, control_chat_id")
      .eq("id", true)
      .maybeSingle();
    await db
      .from("bot_settings")
      .update({ community_chat_id: "", shop_chat_id: "", control_chat_id: "" })
      .eq("id", true);
    await db.from("admin_audit").insert({
      actor_id: context.userId,
      action: "chat_setup_reset",
      status: "ok",
      detail: "Kanal-Zuordnung geleert",
      meta: before ?? {},
    });
    return { ok: true };
  });

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
  .handler(async ({ context }) => {
    const { requireCallerRole } = await import("@/lib/auth-context.server");
    const { db } = (await requireCallerRole("admin")) as unknown as { db: any };
    const { enforceRateLimit } = await import("@/lib/security.server");
    await enforceRateLimit(db, "setup_verify", context.userId, 30, 600_000);
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

    const { verifySetup } = await import("@/lib/setup.server");
    const { readHealth } = await import("@/lib/health.server");
    const [setup, health, products, folders, files, settingsRes, paid] = await Promise.all([
      verifySetup(db),
      readHealth(db),
      db.from("products").select("id", { count: "exact", head: true }).eq("active", true),
      db.from("media_folders").select("id", { count: "exact", head: true }).eq("active", true),
      db.from("media_files").select("id", { count: "exact", head: true }),
      db.from("bot_settings").select("vip_price_stars, app_base_url, welcome_message").eq("id", true).maybeSingle(),
      db.from("purchases").select("id", { count: "exact", head: true }).eq("status", "paid"),
    ]);

    const settings = settingsRes.data ?? {};
    const catalog = [
      {
        key: "products",
        label: "Aktive Produkte",
        ok: (products.count ?? 0) > 0,
        detail: (products.count ?? 0) > 0 ? `${products.count} aktive Produkte` : "Noch kein aktives Produkt angelegt.",
      },
      {
        key: "media",
        label: "Medien-Ordner",
        ok: (folders.count ?? 0) > 0 && (files.count ?? 0) > 0,
        detail: `${folders.count ?? 0} aktive Ordner · ${files.count ?? 0} Dateien`,
      },
      {
        key: "vip",
        label: "VIP-Preis",
        ok: Number(settings.vip_price_stars ?? 0) > 0,
        detail: `${Number(settings.vip_price_stars ?? 0)} Stars`,
      },
      {
        key: "welcome",
        label: "Willkommensnachricht",
        ok: Boolean(String(settings.welcome_message ?? "").trim()),
        detail: String(settings.welcome_message ?? "").trim() ? "gesetzt" : "fehlt – Fans bekommen keinen Einstieg.",
      },
      {
        key: "sales",
        label: "Testkauf",
        ok: (paid.count ?? 0) > 0,
        detail: (paid.count ?? 0) > 0 ? `${paid.count} bezahlte Käufe` : "Noch kein bezahlter Kauf – 1-Stars-Test empfohlen.",
      },
    ];

    const groups = [
      { key: "telegram", label: "Telegram", checks: (setup as any).checks ?? [] },
      {
        key: "chats",
        label: "Chats",
        checks: ((setup as any).chats ?? []).map((c: any) => ({ key: c.target, label: c.label, ok: c.ok, detail: c.detail })),
      },
      { key: "betrieb", label: "Betrieb", checks: health.checks },
      { key: "katalog", label: "Katalog & Umsatz", checks: catalog },
    ];

    const all = groups.flatMap((g) => g.checks as { ok: boolean }[]);
    const passed = all.filter((c) => c.ok).length;
    const ok = passed === all.length;

    await db.from("admin_audit").insert({
      actor_id: context.userId,
      action: "golive_check",
      status: ok ? "ok" : "warn",
      detail: `${passed}/${all.length} Prüfungen bestanden`,
      meta: { groups },
    });

    return { groups, passed, total: all.length, ok, checkedAt: new Date().toISOString() };
  });
