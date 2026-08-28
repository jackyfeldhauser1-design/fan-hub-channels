import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const GATEWAY = "https://connector-gateway.lovable.dev/telegram";

async function tg(method: string, body: Record<string, unknown>) {
  const res = await fetch(`${GATEWAY}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}`,
      "X-Connection-Api-Key": `${process.env["TELEGRAM_API_KEY"]}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Telegram ${method} [${res.status}]: ${text}`);
  return JSON.parse(text) as { ok: boolean; result?: any; description?: string };
}

async function requireAdmin(context: any) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Forbidden");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export const getAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await (supabaseAdmin as any)
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    return { isAdmin: Boolean(isAdmin), adminExists: (count ?? 0) > 0 };
  });

export const claimAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { count } = await db.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "admin");
    if ((count ?? 0) > 0) throw new Error("Es gibt bereits einen Admin.");
    await db.from("user_roles").insert({ user_id: context.userId, role: "admin" });
    return { isAdmin: true };
  });

export const getOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await requireAdmin(context);
    const [{ data: paid }, { count: fans }, { data: pendingTon }, { data: settings }] = await Promise.all([
      db.from("purchases").select("amount_stars, commission_stars, created_at, title_snapshot, currency, amount_ton").eq("status", "paid"),
      db.from("tg_users").select("id", { count: "exact", head: true }),
      db.from("purchases").select("id").eq("status", "pending").eq("currency", "ton"),
      db.from("bot_settings").select("*").eq("id", true).maybeSingle(),
    ]);
    const rows = paid ?? [];
    const stars = rows.reduce((s: number, r: any) => s + r.amount_stars, 0);
    const ton = rows.reduce((s: number, r: any) => s + Number(r.amount_ton), 0);
    const commissions = rows.reduce((s: number, r: any) => s + r.commission_stars, 0);
    const since = Date.now() - 7 * 864e5;
    const week = rows.filter((r: any) => new Date(r.created_at).getTime() > since);
    return {
      stars,
      ton,
      commissions,
      sales: rows.length,
      fans: fans ?? 0,
      pendingTon: (pendingTon ?? []).length,
      weekStars: week.reduce((s: number, r: any) => s + r.amount_stars, 0),
      weekSales: week.length,
      configured: Boolean(settings?.free_group_url || settings?.vip_group_url),
      recent: rows.slice(-6).reverse(),
    };
  });

export const getSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await requireAdmin(context);
    const { data } = await db.from("bot_settings").select("*").eq("id", true).maybeSingle();
    return data;
  });

const settingsSchema = z.object({
  welcome_message: z.string().max(2000),
  free_group_url: z.string().max(300),
  vip_group_url: z.string().max(300),
  ton_wallet: z.string().max(120),
  affiliate_percent: z.number().int().min(0).max(90),
  tip_message: z.string().max(500),
  upsell_message: z.string().max(500),
});

export const saveSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => settingsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context);
    await db.from("bot_settings").update(data).eq("id", true);
    return { ok: true };
  });

export const listProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await requireAdmin(context);
    const { data } = await db.from("products").select("*").order("sort_order").order("created_at");
    return data ?? [];
  });

const productSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(120),
  description: z.string().max(1000),
  kind: z.enum(["single", "bundle", "ppv", "tip"]),
  price_stars: z.number().int().min(0).max(1000000),
  price_ton: z.number().min(0).max(100000),
  delivery_type: z.enum(["text", "file", "link"]),
  delivery_payload: z.string().max(2000),
  active: z.boolean(),
  sort_order: z.number().int().min(0).max(999),
  upsell_product_id: z.string().uuid().nullable(),
});

export const saveProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => productSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context);
    if (data.id) await db.from("products").update(data).eq("id", data.id);
    else await db.from("products").insert(data);
    return { ok: true };
  });

export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context);
    await db.from("products").delete().eq("id", data.id);
    return { ok: true };
  });

export const listPurchases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await requireAdmin(context);
    const { data } = await db
      .from("purchases")
      .select("*, tg_users!purchases_tg_user_id_fkey(username, first_name, telegram_id)")
      .order("created_at", { ascending: false })
      .limit(200);
    return data ?? [];
  });

export const confirmTonPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context);
    const { data: purchase } = await db
      .from("purchases")
      .select("*, tg_users!purchases_tg_user_id_fkey(telegram_id)")
      .eq("id", data.id)
      .maybeSingle();
    if (!purchase) throw new Error("Kauf nicht gefunden");
    await db.from("purchases").update({ status: "paid" }).eq("id", data.id);
    const chatId = purchase.tg_users?.telegram_id;
    if (chatId && purchase.product_id) {
      const { data: p } = await db.from("products").select("*").eq("id", purchase.product_id).maybeSingle();
      if (p) {
        if (p.delivery_type === "file" && p.delivery_payload) {
          await tg("sendDocument", { chat_id: chatId, document: p.delivery_payload, caption: p.title });
        } else if (p.delivery_type === "link" && p.delivery_payload) {
          await tg("sendMessage", {
            chat_id: chatId,
            text: `✅ ${p.title}`,
            reply_markup: { inline_keyboard: [[{ text: "Jetzt öffnen", url: p.delivery_payload }]] },
          });
        } else {
          await tg("sendMessage", { chat_id: chatId, text: `✅ ${p.title}\n\n${p.delivery_payload}` });
        }
      }
    }
    return { ok: true };
  });

export const listFans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await requireAdmin(context);
    const [{ data: users }, { data: purchases }] = await Promise.all([
      db.from("tg_users").select("*").order("created_at", { ascending: false }).limit(300),
      db.from("purchases").select("tg_user_id, referrer_id, amount_stars, commission_stars, status"),
    ]);
    const paid = (purchases ?? []).filter((p: any) => p.status === "paid");
    return (users ?? []).map((u: any) => ({
      ...u,
      spent: paid.filter((p: any) => p.tg_user_id === u.id).reduce((s: number, p: any) => s + p.amount_stars, 0),
      earned: paid.filter((p: any) => p.referrer_id === u.id).reduce((s: number, p: any) => s + p.commission_stars, 0),
      invited: (users ?? []).filter((x: any) => x.referred_by === u.id).length,
    }));
  });

export const getBotStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const me = await tg("getMe", {});
    const info = await tg("getWebhookInfo", {});
    return { username: me.result?.username ?? null, webhook: info.result?.url ?? "", pending: info.result?.pending_update_count ?? 0 };
  });

export const setupWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ baseUrl: z.string().url() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { createHash } = await import("crypto");
    const secret = createHash("sha256")
      .update(`telegram-webhook:${process.env["TELEGRAM_API_KEY"]}`)
      .digest("base64url");
    const url = `${data.baseUrl.replace(/\/$/, "")}/api/public/telegram/webhook`;
    const res = await tg("setWebhook", {
      url,
      secret_token: secret,
      allowed_updates: ["message", "edited_message", "callback_query", "pre_checkout_query"],
    });
    return { ok: res.ok, url };
  });
