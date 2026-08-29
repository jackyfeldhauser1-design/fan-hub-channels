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
    const { db } = await requireCallerRole("admin");
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
    const { db } = await requireCallerRole("admin");
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
    const { db } = await requireCallerRole("viewer");
    const { readSetupProgress } = await import("@/lib/setup.server");
    return readSetupProgress(db);
  });

/** Zuordnung zurücksetzen und neu einrichten. */
export const resetGuidedSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireCallerRole } = await import("@/lib/auth-context.server");
    const { db } = await requireCallerRole("admin");
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
