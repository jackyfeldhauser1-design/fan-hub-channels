/**
 * Kundenkonto für Fans: signierter Kurzzeit-Zugang aus dem Bot-Deeplink.
 * Kein Passwort – der Link ist mit der Telegram-Kennung verknüpft und läuft ab.
 */
import { createHmac, timingSafeEqual } from "crypto";

const TTL_MS = 7 * 86_400_000; // 7 Tage gültig

async function secret() {
  const { currentWebhookSecret } = await import("@/lib/telegram.server");
  const base = await currentWebhookSecret();
  if (!base) throw new Error("Konto ist noch nicht eingerichtet.");
  return `account:${base}`;
}

function sign(payload: string, key: string) {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

/** Erzeugt ein signiertes Konto-Ticket für einen Fan. */
export async function issueAccountTicket(tgUserId: string, ttlMs = TTL_MS) {
  const exp = Date.now() + ttlMs;
  const payload = `${tgUserId}.${exp}`;
  return `${payload}.${sign(payload, await secret())}`;
}

/** Prüft ein Konto-Ticket und gibt die Fan-Kennung zurück (sonst null). */
export async function readAccountTicket(ticket: string): Promise<string | null> {
  const parts = String(ticket ?? "").split(".");
  if (parts.length !== 3) return null;
  const [id, expRaw, sig] = parts as [string, string, string];
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  const expected = sign(`${id}.${exp}`, await secret());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return id;
}

/** Kontoübersicht: Käufe, Sterne, Abo, aktive Zugänge und Downloadereignisse. */
export async function loadAccount(db: any, tgUserId: string) {
  const [{ data: fan }, { data: purchases }, { data: tokens }, { data: downloads }] =

    await Promise.all([
      db.from("tg_users").select("id, username, first_name, blocked, created_at").eq("id", tgUserId).maybeSingle(),
      db
        .from("purchases")
        .select("id, title_snapshot, amount_stars, amount_ton, currency, status, delivery_status, created_at")
        .eq("tg_user_id", tgUserId)
        .order("created_at", { ascending: false })
        .limit(100),
      db
        .from("access_tokens")
        .select("id, token, expires_at, max_views, views, revoked, product_id, folder_id, purchase_id, created_at")
        .eq("tg_user_id", tgUserId)
        .order("created_at", { ascending: false })
        .limit(50),
      db
        .from("media_downloads")
        .select("id, allowed, reason, created_at, file_id, folder_id")
        .eq("tg_user_id", tgUserId)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);
  if (!fan) return null;

  const { activeSubscription } = await import("@/lib/billing.server");
  const sub = await activeSubscription(db, tgUserId);
  const conf = (await db.from("bot_settings").select("app_base_url").eq("id", true).maybeSingle()).data ?? {};
  const { resolvePublicBaseUrl } = await import("@/lib/base-url");\n  const base = resolvePublicBaseUrl(conf);

  const folderIds = [...new Set((tokens ?? []).map((t: any) => t.folder_id).filter(Boolean))];
  const productIds = [...new Set((tokens ?? []).map((t: any) => t.product_id).filter(Boolean))];
  const [{ data: folders }, { data: products }] = await Promise.all([
    folderIds.length ? db.from("media_folders").select("id, title").in("id", folderIds) : { data: [] },
    productIds.length ? db.from("products").select("id, title").in("id", productIds) : { data: [] },
  ]);
  const folderName = new Map((folders ?? []).map((f: any) => [f.id, f.title]));
  const productName = new Map((products ?? []).map((p: any) => [p.id, p.title]));

  const paid = (purchases ?? []).filter((p: any) => p.status === "paid");
  const now = Date.now();

  return {
    fan: {
      name: fan.first_name || (fan.username ? `@${fan.username}` : "Fan"),
      username: fan.username ?? "",
      blocked: Boolean(fan.blocked),
      since: fan.created_at,
    },
    totals: {
      purchases: paid.length,
      stars: paid.reduce((s: number, p: any) => s + Number(p.amount_stars ?? 0), 0),
      ton: paid.reduce((s: number, p: any) => s + Number(p.amount_ton ?? 0), 0),
    },
    subscription: sub
      ? { plan: sub.plan, status: sub.status, expiresAt: sub.expires_at, renewals: Number(sub.renewals ?? 0) }
      : null,
    purchases: (purchases ?? []).map((p: any) => ({
      id: p.id,
      title: p.title_snapshot,
      amountStars: Number(p.amount_stars ?? 0),
      amountTon: Number(p.amount_ton ?? 0),
      currency: p.currency,
      status: p.status,
      delivery: p.delivery_status,
      createdAt: p.created_at,
    })),
    access: (tokens ?? []).map((t: any) => {
      const expired = new Date(t.expires_at).getTime() < now;
      const usedUp = Number(t.views ?? 0) >= Number(t.max_views ?? 0);
      return {
        id: t.id,
        title:
          (t.folder_id ? folderName.get(t.folder_id) : null) ??
          (t.product_id ? productName.get(t.product_id) : null) ??
          "Zugang",
        expiresAt: t.expires_at,
        views: Number(t.views ?? 0),
        maxViews: Number(t.max_views ?? 0),
        revoked: Boolean(t.revoked),
        active: !t.revoked && !expired && !usedUp,
        state: t.revoked ? "gesperrt" : expired ? "abgelaufen" : usedUp ? "aufgebraucht" : "aktiv",
        url: base && !t.revoked && !expired && !usedUp ? `${base}/inhalt/${t.token}` : "",
      };
    }),
    downloads: (downloads ?? []).map((d: any) => ({
      id: d.id,
      allowed: Boolean(d.allowed),
      reason: d.reason ?? "",
      createdAt: d.created_at,
    })),
  };
}

/** Erneuert einen abgelaufenen Zugang, sofern der zugehörige Kauf bezahlt ist. */
export async function reissueAccess(db: any, tgUserId: string, accessId: string) {
  const { data: row } = await db
    .from("access_tokens")
    .select("id, product_id, folder_id, purchase_id, revoked, tg_user_id")
    .eq("id", accessId)
    .eq("tg_user_id", tgUserId)
    .maybeSingle();
  if (!row) throw new Error("Zugang nicht gefunden.");
  if (row.revoked) throw new Error("Dieser Zugang wurde gesperrt. Bitte melde dich beim Support.");

  if (row.purchase_id) {
    const { data: purchase } = await db.from("purchases").select("status").eq("id", row.purchase_id).maybeSingle();
    if (purchase && purchase.status !== "paid") throw new Error("Zu diesem Zugang liegt keine bezahlte Bestellung vor.");
  }

  const settings = (await db.from("bot_settings").select("*").eq("id", true).maybeSingle()).data ?? {};
  const ttl = Math.max(1, Number(settings.link_ttl_hours ?? 48));
  const maxViews = Math.max(1, Number(settings.link_max_views ?? 3));
  const { randomToken } = await import("@/lib/fulfillment.server");
  const token = randomToken();
  const { error } = await db.from("access_tokens").insert({
    token,
    purchase_id: row.purchase_id,
    product_id: row.product_id,
    folder_id: row.folder_id,
    tg_user_id: tgUserId,
    expires_at: new Date(Date.now() + ttl * 3_600_000).toISOString(),
    max_views: maxViews,
  });
  if (error) throw new Error(error.message);

  await db.from("order_events").insert({
    purchase_id: row.purchase_id,
    tg_user_id: tgUserId,
    kind: "access_reissued",
    detail: `Neuer Zugang über Kundenkonto (${maxViews}× / ${ttl}h)`,
  });

  const base = String(settings.app_base_url ?? "").replace(/\/$/, "");
  return { url: base ? `${base}/inhalt/${token}` : "", ttl, maxViews };
}
