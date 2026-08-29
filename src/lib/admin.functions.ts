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

// Admin check via the caller's own user_roles row. RLS ("users read own roles")
// restricts this to the caller's own roles, so no SECURITY DEFINER RPC is needed.
async function isAdminUser(context: any): Promise<boolean> {
  const { data } = await context.supabase
    .from("user_roles")
    .select("id")
    .eq("user_id", context.userId)
    .eq("role", "admin")
    .maybeSingle();
  return Boolean(data);
}

async function requireAdmin(context: any) {
  if (!(await isAdminUser(context))) throw new Error("Forbidden");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export type TeamRole = "admin" | "operator" | "viewer";
const RANK: Record<TeamRole, number> = { viewer: 1, operator: 2, admin: 3 };

/** Höchste Rolle des Aufrufers (RLS erlaubt nur die eigenen Rollen zu lesen). */
async function roleOf(context: any): Promise<TeamRole | null> {
  const { data } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  const roles = (data ?? []).map((r: any) => r.role).filter((r: string) => r in RANK) as TeamRole[];
  if (!roles.length) return null;
  return roles.sort((a, b) => RANK[b] - RANK[a])[0]!;
}

/** Prüft Mindestrolle und liefert den privilegierten DB-Client. */
async function requireRole(context: any, min: TeamRole) {
  const role = await roleOf(context);
  if (!role || RANK[role] < RANK[min]) throw new Error("Forbidden");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { db: supabaseAdmin as any, role };
}

export const getAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const isAdmin = await isAdminUser(context);
    const role = await roleOf(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await (supabaseAdmin as any)
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    return { isAdmin: Boolean(isAdmin), role, adminExists: (count ?? 0) > 0 };
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
  free_chat_id: z.string().max(60),
  vip_chat_id: z.string().max(60),
  app_base_url: z.string().max(300),
  early_access_price_stars: z.number().int().min(0).max(1000000),
  sponsor_price_stars: z.number().int().min(0).max(1000000),
  link_ttl_hours: z.number().int().min(1).max(720),
  link_max_views: z.number().int().min(1).max(50),
  max_purchases_per_hour: z.number().int().min(1).max(100),
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

// ---------- Bestell- & Liefer-Tracking ----------

export const listOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await requireAdmin(context);
    const [{ data: orders }, { data: events }, { data: tokens }] = await Promise.all([
      db
        .from("purchases")
        .select("*, tg_users!purchases_tg_user_id_fkey(username, first_name, telegram_id, blocked, risk_score)")
        .order("created_at", { ascending: false })
        .limit(200),
      db.from("order_events").select("*").order("created_at", { ascending: false }).limit(600),
      db.from("access_tokens").select("*").order("created_at", { ascending: false }).limit(400),
    ]);
    return (orders ?? []).map((o: any) => ({
      ...o,
      events: (events ?? []).filter((e: any) => e.purchase_id === o.id),
      tokens: (tokens ?? []).filter((t: any) => t.purchase_id === o.id),
    }));
  });

export const resendDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context);
    const { deliverProduct } = await import("@/lib/fulfillment.server");
    const { data: purchase } = await db
      .from("purchases")
      .select("*, tg_users!purchases_tg_user_id_fkey(telegram_id)")
      .eq("id", data.id)
      .maybeSingle();
    if (!purchase?.product_id) throw new Error("Kein lieferbarer Inhalt");
    const [{ data: product }, { data: settings }] = await Promise.all([
      db.from("products").select("*").eq("id", purchase.product_id).maybeSingle(),
      db.from("bot_settings").select("*").eq("id", true).maybeSingle(),
    ]);
    await deliverProduct(
      db,
      tg,
      purchase.tg_users.telegram_id,
      product,
      { id: purchase.id, tg_user_id: purchase.tg_user_id },
      settings,
    );
    return { ok: true };
  });

export const revokeAccessToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context);
    await db.from("access_tokens").update({ revoked: true }).eq("id", data.id);
    return { ok: true };
  });

// ---------- Anti-Fraud ----------

export const getRiskCenter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await requireAdmin(context);
    const since = new Date(Date.now() - 7 * 864e5).toISOString();
    const [{ data: users }, { data: actions }] = await Promise.all([
      db.from("tg_users").select("*").order("risk_score", { ascending: false }).limit(100),
      db.from("action_log").select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(300),
    ]);
    return {
      users: users ?? [],
      flags: (actions ?? []).filter((a: any) => a.action === "fraud_flag" || a.action === "rate_limit"),
      blocked: (users ?? []).filter((u: any) => u.blocked).length,
    };
  });

export const setUserBlocked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), blocked: z.boolean(), reason: z.string().max(200).default("") }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context);
    await db
      .from("tg_users")
      .update({
        blocked: data.blocked,
        block_reason: data.blocked ? data.reason || "Manuell gesperrt" : "",
        risk_score: data.blocked ? 100 : 0,
      })
      .eq("id", data.id);
    return { ok: true };
  });

// ---------- Sponsored Posts ----------

export const listSponsoredPosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await requireAdmin(context);
    const { data } = await db.from("sponsored_posts").select("*").order("created_at", { ascending: false }).limit(200);
    return data ?? [];
  });

export const updateSponsoredPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["requested", "approved", "paid", "published", "rejected"]),
        price_stars: z.number().int().min(0).max(1000000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context);
    const patch: Record<string, unknown> = { status: data.status };
    if (typeof data.price_stars === "number") patch["price_stars"] = data.price_stars;
    await db.from("sponsored_posts").update(patch).eq("id", data.id);
    return { ok: true };
  });

export const publishSponsoredPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context);
    const [{ data: post }, { data: settings }] = await Promise.all([
      db.from("sponsored_posts").select("*").eq("id", data.id).maybeSingle(),
      db.from("bot_settings").select("*").eq("id", true).maybeSingle(),
    ]);
    if (!post) throw new Error("Buchung nicht gefunden");
    if (post.status !== "paid" && post.status !== "approved") throw new Error("Buchung ist noch nicht bezahlt.");

    const targets: string[] = [];
    if (post.target === "free" || post.target === "both") targets.push(settings?.free_chat_id);
    if (post.target === "vip" || post.target === "both") targets.push(settings?.vip_chat_id);
    const valid = targets.filter(Boolean);
    if (!valid.length) throw new Error("Bitte zuerst die Chat-ID der Gruppe im Bot-Setup hinterlegen.");

    for (const chatId of valid) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: `📣 <b>Anzeige</b> · ${post.advertiser}\n\n${post.content}`,
        parse_mode: "HTML",
        ...(post.link_url
          ? { reply_markup: { inline_keyboard: [[{ text: "Mehr erfahren", url: post.link_url }]] } }
          : {}),
      });
    }
    await db
      .from("sponsored_posts")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", post.id);
    return { ok: true, count: valid.length };
  });

// ---------- Leads / Warteliste ----------

export const listLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await requireAdmin(context);
    const { data } = await db.from("leads").select("*").order("created_at", { ascending: false }).limit(300);
    return data ?? [];
  });

export const deleteLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context);
    await db.from("leads").delete().eq("id", data.id);
    return { ok: true };
  });

// ---------- Admin-Status ----------

export const getAdminStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const adb = supabaseAdmin as any;

    let db: any;
    try {
      db = await requireAdmin(context);
    } catch {
      const { data: user } = await adb.auth.admin.getUserById(context.userId);
      const { count } = await adb.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "admin");
      return {
        account: { email: user?.user?.email ?? "", userId: context.userId },
        admin: { isAdmin: false, adminExists: (count ?? 0) > 0, since: null as string | null },
        bot: null as null | { username: string | null; webhook: string; pending: number },
        settings: null as Record<string, any> | null,
        counts: { products: 0, purchases: 0, fans: 0, leads: 0 },
      };
    }

    const [{ data: user }, { data: role }, settingsRes, products, purchases, fans, leads] = await Promise.all([
      adb.auth.admin.getUserById(context.userId),
      db.from("user_roles").select("role, created_at").eq("user_id", context.userId).eq("role", "admin").maybeSingle(),
      db.from("bot_settings").select("*").eq("id", true).maybeSingle(),
      db.from("products").select("id", { count: "exact", head: true }),
      db.from("purchases").select("id", { count: "exact", head: true }),
      db.from("tg_users").select("id", { count: "exact", head: true }),
      db.from("leads").select("id", { count: "exact", head: true }),
    ]);

    let bot: { username: string | null; webhook: string; pending: number } | null = null;
    try {
      const me = await tg("getMe", {});
      const info = await tg("getWebhookInfo", {});
      bot = { username: me.result?.username ?? null, webhook: info.result?.url ?? "", pending: info.result?.pending_update_count ?? 0 };
    } catch {
      bot = null;
    }

    return {
      account: { email: user?.user?.email ?? "", userId: context.userId },
      admin: { isAdmin: true, adminExists: true, since: (role as any)?.created_at ?? null },
      bot,
      settings: settingsRes.data ?? null,
      counts: {
        products: products.count ?? 0,
        purchases: purchases.count ?? 0,
        fans: fans.count ?? 0,
        leads: leads.count ?? 0,
      },
    };
  });

// ---------- Zugriffs- & Lieferprotokoll ----------

export const listAccessLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db, role } = await requireRole(context, "viewer");
    const [{ data: tokens }, { data: events }] = await Promise.all([
      db
        .from("access_tokens")
        .select(
          "*, products(title), tg_users(username, first_name, telegram_id, blocked), purchases(status, amount_stars, currency, delivery_status)",
        )
        .order("created_at", { ascending: false })
        .limit(300),
      db
        .from("order_events")
        .select("*, tg_users(username, first_name)")
        .in("kind", ["access_opened", "access_denied", "access_revoked", "delivered", "delivery_failed"])
        .order("created_at", { ascending: false })
        .limit(300),
    ]);

    const list = (tokens ?? []).map((t: any) => {
      const expired = new Date(t.expires_at).getTime() < Date.now();
      const usedUp = t.views >= t.max_views;
      const paid = !t.purchase_id || t.purchases?.status === "paid";
      const state = t.revoked
        ? "gesperrt"
        : !paid
          ? "unbezahlt"
          : expired
            ? "abgelaufen"
            : usedUp
              ? "aufgebraucht"
              : "aktiv";
      return {
        id: t.id,
        state,
        product: t.products?.title ?? "—",
        fan: t.tg_users?.username ? `@${t.tg_users.username}` : (t.tg_users?.first_name ?? "—"),
        blocked: Boolean(t.tg_users?.blocked),
        views: t.views,
        maxViews: t.max_views,
        expiresAt: t.expires_at,
        createdAt: t.created_at,
        reactivations: t.reactivations ?? 0,
        paid,
        amount: t.purchases ? `${t.purchases.amount_stars} ⭐` : "—",
      };
    });

    const ev = events ?? [];
    const delivered = ev.filter((e: any) => e.kind === "delivered").length;
    const opens = ev.filter((e: any) => e.kind === "access_opened").length;
    const denied = ev.filter((e: any) => e.kind === "access_denied").length;
    const total = list.length;
    const openRate = total ? Math.round((list.filter((t: any) => t.views > 0).length / total) * 100) : 0;

    return {
      role,
      tokens: list,
      events: ev.map((e: any) => ({
        id: e.id,
        kind: e.kind,
        detail: e.detail,
        createdAt: e.created_at,
        fan: e.tg_users?.username ? `@${e.tg_users.username}` : (e.tg_users?.first_name ?? "—"),
      })),
      stats: {
        total,
        active: list.filter((t: any) => t.state === "aktiv").length,
        revoked: list.filter((t: any) => t.state === "gesperrt").length,
        expired: list.filter((t: any) => t.state === "abgelaufen" || t.state === "aufgebraucht").length,
        unpaid: list.filter((t: any) => t.state === "unbezahlt").length,
        delivered,
        opens,
        denied,
        openRate,
      },
    };
  });

function csv(rows: (string | number)[][]) {
  return rows
    .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";"))
    .join("\n");
}

export const exportAccessCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ kind: z.enum(["tokens", "events"]) }).parse(input))
  .handler(async ({ data, context }) => {
    const { db } = await requireRole(context, "viewer");

    if (data.kind === "events") {
      const { data: events } = await db
        .from("order_events")
        .select("*, tg_users(username, first_name)")
        .order("created_at", { ascending: false })
        .limit(5000);
      const rows: (string | number)[][] = [["Zeitpunkt", "Ereignis", "Fan", "Bestellung", "Detail"]];
      for (const e of events ?? [])
        rows.push([
          new Date(e.created_at).toISOString(),
          e.kind,
          e.tg_users?.username ? `@${e.tg_users.username}` : (e.tg_users?.first_name ?? ""),
          e.purchase_id ?? "",
          e.detail ?? "",
        ]);
      return { filename: `lieferprotokoll-${new Date().toISOString().slice(0, 10)}.csv`, content: csv(rows) };
    }

    const { data: tokens } = await db
      .from("access_tokens")
      .select("*, products(title), tg_users(username, first_name), purchases(status, amount_stars, currency)")
      .order("created_at", { ascending: false })
      .limit(5000);
    const rows: (string | number)[][] = [
      ["Erstellt", "Inhalt", "Fan", "Zahlung", "Betrag", "Aufrufe", "Max", "Gültig bis", "Gesperrt", "Neuaktivierungen"],
    ];
    for (const t of tokens ?? [])
      rows.push([
        new Date(t.created_at).toISOString(),
        t.products?.title ?? "",
        t.tg_users?.username ? `@${t.tg_users.username}` : (t.tg_users?.first_name ?? ""),
        t.purchases?.status ?? "",
        t.purchases ? `${t.purchases.amount_stars} ${t.purchases.currency}` : "",
        t.views,
        t.max_views,
        new Date(t.expires_at).toISOString(),
        t.revoked ? "ja" : "nein",
        t.reactivations ?? 0,
      ]);
    return { filename: `zugriffe-${new Date().toISOString().slice(0, 10)}.csv`, content: csv(rows) };
  });

/** Abgelaufenen oder aufgebrauchten Einmal-Zugang neu aktivieren. */
export const reactivateAccessToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), hours: z.number().int().min(1).max(720).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { db } = await requireRole(context, "operator");
    const { data: settings } = await db.from("bot_settings").select("*").eq("id", true).maybeSingle();
    const hours = data.hours ?? Number(settings?.link_ttl_hours ?? 48);
    const { data: row } = await db.from("access_tokens").select("*").eq("id", data.id).maybeSingle();
    if (!row) throw new Error("Zugang nicht gefunden");

    await db
      .from("access_tokens")
      .update({
        revoked: false,
        views: 0,
        last_ip_hash: "",
        expires_at: new Date(Date.now() + hours * 3600_000).toISOString(),
        max_views: Math.max(row.max_views, Number(settings?.link_max_views ?? 3)),
        reactivated_at: new Date().toISOString(),
        reactivations: (row.reactivations ?? 0) + 1,
      })
      .eq("id", data.id);

    const { logOrderEvent } = await import("@/lib/fulfillment.server");
    const { notifyAccessIssue } = await import("@/lib/notify.server");
    await logOrderEvent(db, row.purchase_id, row.tg_user_id, "access_revoked", `Neu aktiviert für ${hours} h`);
    await notifyAccessIssue(db, "reactivated", { tgUserId: row.tg_user_id, detail: `Gültig für ${hours} Stunden` });
    return { ok: true, hours };
  });

// ---------- Team & Rollen ----------

export const listTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db } = await requireRole(context, "admin");
    const { data: roles } = await db.from("user_roles").select("*").order("created_at", { ascending: true });
    const { data: users } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
    const emails = new Map<string, string>((users?.users ?? []).map((u: any) => [u.id, u.email ?? ""]));
    return {
      members: (roles ?? []).map((r: any) => ({
        id: r.id,
        userId: r.user_id,
        role: r.role as TeamRole,
        email: emails.get(r.user_id) ?? r.user_id,
        createdAt: r.created_at,
        isSelf: r.user_id === context.userId,
      })),
      accounts: (users?.users ?? []).map((u: any) => ({ id: u.id, email: u.email ?? u.id })),
    };
  });

export const setTeamRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid(), role: z.enum(["admin", "operator", "viewer"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { db } = await requireRole(context, "admin");
    await db.from("user_roles").delete().eq("user_id", data.userId).in("role", ["admin", "operator", "viewer"]);
    await db.from("user_roles").insert({ user_id: data.userId, role: data.role });
    return { ok: true };
  });

export const removeTeamRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { db } = await requireRole(context, "admin");
    if (data.userId === context.userId) throw new Error("Du kannst dich nicht selbst entfernen.");
    const { count } = await db.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "admin");
    const { data: target } = await db.from("user_roles").select("role").eq("user_id", data.userId);
    const targetIsAdmin = (target ?? []).some((r: any) => r.role === "admin");
    if (targetIsAdmin && (count ?? 0) <= 1) throw new Error("Der letzte Admin kann nicht entfernt werden.");
    await db.from("user_roles").delete().eq("user_id", data.userId);
    return { ok: true };
  });
