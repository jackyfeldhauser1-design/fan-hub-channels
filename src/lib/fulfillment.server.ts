import { createHash, randomBytes } from "crypto";

export type Tg = (method: string, body: Record<string, unknown>) => Promise<any>;

export function randomToken(bytes = 24) {
  return randomBytes(bytes).toString("base64url");
}

export function hashIp(ip: string | null | undefined) {
  if (!ip) return "";
  return createHash("sha256").update(`ip:${ip}`).digest("hex").slice(0, 32);
}

export async function logAction(db: any, tgUserId: string | null, action: string, meta = "") {
  if (!tgUserId) return;
  await db.from("action_log").insert({ tg_user_id: tgUserId, action, meta: meta.slice(0, 300) });
}

export async function logOrderEvent(
  db: any,
  purchaseId: string | null,
  tgUserId: string | null,
  kind: string,
  detail = "",
) {
  await db.from("order_events").insert({
    purchase_id: purchaseId,
    tg_user_id: tgUserId,
    kind,
    detail: detail.slice(0, 500),
  });
}

/**
 * Rate limits and repeat-payment / risk heuristics.
 * Returns null when the action is allowed, or a German reason string when blocked.
 */
export async function guardAction(
  db: any,
  user: any,
  settings: any,
  action: "buy" | "referral" | "access" | "lead",
): Promise<string | null> {
  if (!user) return null;
  if (user.blocked) return "Dein Zugang wurde vorübergehend gesperrt. Bitte melde dich beim Support.";

  const limits: Record<string, { max: number; windowMs: number }> = {
    buy: { max: Math.max(1, Number(settings?.max_purchases_per_hour ?? 6)), windowMs: 3600_000 },
    referral: { max: 20, windowMs: 3600_000 },
    access: { max: 30, windowMs: 3600_000 },
    lead: { max: 5, windowMs: 3600_000 },
  };
  const limit = limits[action]!;
  const since = new Date(Date.now() - limit.windowMs).toISOString();
  const { count } = await db
    .from("action_log")
    .select("id", { count: "exact", head: true })
    .eq("tg_user_id", user.id)
    .eq("action", action)
    .gte("created_at", since);

  if ((count ?? 0) >= limit.max) {
    const risk = (user.risk_score ?? 0) + 25;
    const shouldBlock = risk >= 100;
    await db
      .from("tg_users")
      .update({
        risk_score: risk,
        blocked: shouldBlock,
        block_reason: shouldBlock ? `Automatisch gesperrt: zu viele ${action}-Aktionen` : user.block_reason ?? "",
      })
      .eq("id", user.id);
    await logAction(db, user.id, "rate_limit", action);
    return shouldBlock
      ? "Zu viele Aktionen in kurzer Zeit – dein Zugang wurde zur Prüfung gesperrt."
      : "Zu viele Aktionen in kurzer Zeit. Bitte versuche es später noch einmal.";
  }

  await logAction(db, user.id, action);
  return null;
}

/** Flags suspicious repeat payments (same product bought several times in a short window). */
export async function flagRepeatPayment(db: any, user: any, productId: string | null) {
  if (!user || !productId) return;
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count } = await db
    .from("purchases")
    .select("id", { count: "exact", head: true })
    .eq("tg_user_id", user.id)
    .eq("product_id", productId)
    .gte("created_at", since);
  if ((count ?? 0) >= 3) {
    await db
      .from("tg_users")
      .update({
        risk_score: (user.risk_score ?? 0) + 40,
        block_reason: "Verdächtige Wiederholungs-Zahlungen",
      })
      .eq("id", user.id);
    await logAction(db, user.id, "fraud_flag", `repeat_purchase:${productId}`);
  }
}

/** Creates a signed one-time access token for gated content. */
export async function createAccessToken(
  db: any,
  opts: { purchaseId: string | null; productId: string | null; tgUserId: string; settings: any },
) {
  const ttl = Math.max(1, Number(opts.settings?.link_ttl_hours ?? 48));
  const maxViews = Math.max(1, Number(opts.settings?.link_max_views ?? 3));
  const token = randomToken();
  await db.from("access_tokens").insert({
    token,
    purchase_id: opts.purchaseId,
    product_id: opts.productId,
    tg_user_id: opts.tgUserId,
    expires_at: new Date(Date.now() + ttl * 3600_000).toISOString(),
    max_views: maxViews,
  });
  return { token, ttl, maxViews };
}

export function contentUrl(settings: any, token: string) {
  const base = String(settings?.app_base_url ?? "").replace(/\/$/, "");
  return base ? `${base}/inhalt/${token}` : "";
}

/**
 * Delivers a purchased product. Gated types (file/link) are delivered via a
 * secure one-time link when a public app URL is configured.
 */
export async function deliverProduct(
  db: any,
  tg: Tg,
  chatId: number,
  product: any,
  purchase: { id: string; tg_user_id: string } | null,
  settings: any,
) {
  if (!product) return { ok: false, note: "kein Produkt" };

  const gated = product.delivery_type === "link";
  let note = "direkt im Chat";
  let contentHandled = false;

  if (purchase?.tg_user_id && product.id && product.kind === "bundle") {
    const { data: bundleRows, error: bundleError } = await db
      .from("bundle_items")
      .select("product_id")
      .eq("bundle_id", product.id);
    if (bundleError) throw new Error(bundleError.message);

    const productIds = (bundleRows ?? []).map((row: any) => row.product_id).filter(Boolean);
    if (productIds.length) {
      const { contentSetForProduct, grantContentAccess, activeContentAccess, deliverContentSet } = await import("@/lib/content.server");
      let deliveredSets = 0;
      for (const childProductId of productIds) {
        const contentSet = await contentSetForProduct(db, childProductId);
        if (!contentSet) continue;
        let access = await activeContentAccess(db, purchase.tg_user_id, contentSet.id);
        if (!access) {
          access = await grantContentAccess(db, {
            tgUserId: purchase.tg_user_id,
            contentSet,
            purchaseId: purchase.id,
            source: "bundle",
          });
        }
        const delivered = await deliverContentSet(db, tg, chatId, purchase.tg_user_id, contentSet.id);
        if (!delivered.ok) throw new Error(delivered.reason ?? "Bundle-Inhalt konnte nicht ausgeliefert werden");
        deliveredSets += 1;
      }
      if (deliveredSets > 0) {
        note = `Bundle (${deliveredSets} Content-Sets)`;
        contentHandled = true;
      }
    }
  }

  if (!contentHandled && purchase?.tg_user_id && product.id) {
    const { contentSetForProduct, grantContentAccess, activeContentAccess, deliverContentSet } = await import("@/lib/content.server");
    const contentSet = await contentSetForProduct(db, product.id);
    if (contentSet) {
      let access = await activeContentAccess(db, purchase.tg_user_id, contentSet.id);
      if (!access) {
        access = await grantContentAccess(db, {
          tgUserId: purchase.tg_user_id,
          contentSet,
          purchaseId: purchase.id,
          source: "purchase",
        });
      }
      const delivered = await deliverContentSet(db, tg, chatId, purchase.tg_user_id, contentSet.id);
      if (!delivered.ok) throw new Error(delivered.reason ?? "Content konnte nicht ausgeliefert werden");
      note = `Telegram-Content (${delivered.delivered ?? 0} Medien)`;
      contentHandled = true;
    }
  }

  if (!contentHandled && gated && purchase && contentUrl(settings, "x")) {
    const { token, ttl, maxViews } = await createAccessToken(db, {
      purchaseId: purchase.id,
      productId: product.id,
      tgUserId: purchase.tg_user_id,
      settings,
    });
    await tg("sendMessage", {
      chat_id: chatId,
      text: `✅ <b>${product.title}</b>\n\n🔐 Dein persönlicher Zugang ist <b>${ttl} Stunden</b> gültig und kann <b>${maxViews}×</b> geöffnet werden. Bitte nicht weitergeben – der Link ist mit deinem Konto verknüpft.`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "🔓 Inhalt öffnen", url: contentUrl(settings, token) }]] },
    });
    note = `Einmal-Link (${maxViews}× / ${ttl}h)`;
  } else if (!contentHandled && product.delivery_type === "file" && product.delivery_payload) {
    await tg("sendDocument", { chat_id: chatId, document: product.delivery_payload, caption: product.title });
    note = "Datei im Chat";
  } else if (!contentHandled && product.delivery_type === "link" && product.delivery_payload) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: `✅ <b>${product.title}</b>\nDein Zugang:`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "Jetzt öffnen", url: product.delivery_payload }]] },
    });
    note = "Direktlink im Chat";
  } else if (!contentHandled) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: `✅ <b>${product.title}</b>\n\n${product.delivery_payload || "Danke für deinen Kauf!"}`,
      parse_mode: "HTML",
    });
  }

  if (purchase) {
    await db
      .from("purchases")
      .update({ delivery_status: "delivered", delivered_at: new Date().toISOString(), delivery_note: note })
      .eq("id", purchase.id);
    await logOrderEvent(db, purchase.id, purchase.tg_user_id, "delivered", note);
  }

  if (product.upsell_product_id) {
    const { data: up } = await db.from("products").select("*").eq("id", product.upsell_product_id).maybeSingle();
    if (up?.active) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: `${settings?.upsell_message ?? "Das könnte dir auch gefallen:"}\n<b>${up.title}</b>`,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[{ text: `Jetzt sichern — ⭐ ${up.price_stars}`, callback_data: `buy_${up.id}` }]],
        },
      });
    }
  }

  return { ok: true, note };
}
