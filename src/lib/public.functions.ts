import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

const leadSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(200),
  telegram_handle: z.string().trim().max(60),
  interest: z.string().trim().max(500),
  early_access: z.boolean(),
});

const sponsorSchema = z.object({
  advertiser: z.string().trim().min(1).max(120),
  contact: z.string().trim().min(1).max(200),
  target: z.enum(["free", "vip", "both"]),
  content: z.string().trim().min(1).max(1500),
  link_url: z.string().trim().max(300),
  media_url: z.string().trim().max(300),
});

function clientIp() {
  try {
    const req = getRequest();
    return (
      req.headers.get("cf-connecting-ip") ??
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      null
    );
  } catch {
    return null;
  }
}

async function botUsername() {
  const res = await fetch("https://connector-gateway.lovable.dev/telegram/getMe", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}`,
      "X-Connection-Api-Key": `${process.env["TELEGRAM_API_KEY"]}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (!res.ok) return null;
  const json = (await res.json()) as any;
  return json?.result?.username ?? null;
}

export const submitLead = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => leadSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { randomToken, hashIp } = await import("@/lib/fulfillment.server");
    const db = supabaseAdmin as any;
    const ipHash = hashIp(clientIp());

    if (ipHash) {
      const since = new Date(Date.now() - 3600_000).toISOString();
      const { count } = await db
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("ip_hash", ipHash)
        .gte("created_at", since);
      if ((count ?? 0) >= 5) throw new Error("Zu viele Anfragen. Bitte versuche es später erneut.");
    }

    const claim = randomToken(12);
    const { data: settings } = await db
      .from("bot_settings")
      .select("early_access_price_stars")
      .eq("id", true)
      .maybeSingle();
    await db.from("leads").insert({
      name: data.name,
      email: data.email,
      telegram_handle: data.telegram_handle,
      interest: data.interest,
      early_access: data.early_access,
      claim_token: claim,
      ip_hash: ipHash,
      source: "web",
    });

    let claimUrl = "";
    if (data.early_access) {
      const username = await botUsername();
      if (username) claimUrl = `https://t.me/${username}?start=ea_${claim}`;
    }
    return { ok: true, claimUrl, priceStars: settings?.early_access_price_stars ?? 250 };
  });

export const submitSponsorRequest = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => sponsorSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { hashIp } = await import("@/lib/fulfillment.server");
    const db = supabaseAdmin as any;
    const ipHash = hashIp(clientIp());

    const since = new Date(Date.now() - 3600_000).toISOString();
    if (ipHash) {
      const { count } = await db
        .from("sponsored_posts")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since);
      if ((count ?? 0) >= 20) throw new Error("Zu viele Anfragen. Bitte versuche es später erneut.");
    }

    const { data: settings } = await db
      .from("bot_settings")
      .select("sponsor_price_stars")
      .eq("id", true)
      .maybeSingle();
    const price = settings?.sponsor_price_stars ?? 1500;

    const { data: post } = await db
      .from("sponsored_posts")
      .insert({ ...data, price_stars: price, status: "requested" })
      .select("id")
      .single();

    const username = await botUsername();
    return {
      ok: true,
      priceStars: price,
      payUrl: username && post ? `https://t.me/${username}?start=spo_${post.id}` : "",
    };
  });

export const openSecureContent = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: z.string().min(10).max(200) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { hashIp, logOrderEvent } = await import("@/lib/fulfillment.server");
    const db = supabaseAdmin as any;

    const { data: row } = await db
      .from("access_tokens")
      .select("*")
      .eq("token", data.token)
      .maybeSingle();
    if (!row) return { status: "invalid" as const };
    if (row.revoked) return { status: "revoked" as const };
    if (new Date(row.expires_at).getTime() < Date.now()) return { status: "expired" as const };
    if (row.views >= row.max_views) return { status: "used_up" as const };

    // Zugang nur für bezahlte Bestellungen und nicht gesperrte Fans.
    if (row.purchase_id) {
      const { data: purchase } = await db
        .from("purchases")
        .select("id, status, delivery_status")
        .eq("id", row.purchase_id)
        .maybeSingle();
      if (!purchase || purchase.status !== "paid" || purchase.delivery_status === "revoked") {
        await logOrderEvent(db, row.purchase_id, row.tg_user_id, "access_denied", "Zahlung nicht bestätigt");
        return { status: "unpaid" as const };
      }
    }
    if (row.tg_user_id) {
      const { data: fan } = await db.from("tg_users").select("blocked").eq("id", row.tg_user_id).maybeSingle();
      if (fan?.blocked) {
        await logOrderEvent(db, row.purchase_id, row.tg_user_id, "access_denied", "Konto gesperrt");
        return { status: "revoked" as const };
      }
    }

    const ipHash = hashIp(clientIp());
    if (row.last_ip_hash && ipHash && row.last_ip_hash !== ipHash && row.views > 0) {
      await db
        .from("access_tokens")
        .update({ revoked: true })
        .eq("id", row.id);
      await logOrderEvent(db, row.purchase_id, row.tg_user_id, "access_revoked", "Zugriff von anderem Gerät/Netz");
      return { status: "revoked" as const };
    }

    const { data: product } = await db.from("products").select("*").eq("id", row.product_id).maybeSingle();
    await db
      .from("access_tokens")
      .update({ views: row.views + 1, last_ip_hash: ipHash })
      .eq("id", row.id);
    await logOrderEvent(db, row.purchase_id, row.tg_user_id, "access_opened", `view ${row.views + 1}/${row.max_views}`);

    return {
      status: "ok" as const,
      title: product?.title ?? "Dein Inhalt",
      description: product?.description ?? "",
      deliveryType: product?.delivery_type ?? "text",
      payload: product?.delivery_payload ?? "",
      viewsLeft: row.max_views - row.views - 1,
      expiresAt: row.expires_at,
    };
  });
