import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { tgSafe } from "@/lib/telegram.server";
import { selectPreviewFileId } from "@/lib/content.server";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export const quickPublishContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      title: z.string().min(1).max(140),
      description: z.string().max(3000).default(""),
      folderId: z.string().uuid(),
      previewFileId: z.string().uuid().nullable().optional(),
      priceStars: z.number().int().min(1).max(1_000_000),
      priceTon: z.number().min(0).max(100000).default(0),
      priceTrx: z.number().min(0).max(100000000).default(0),
      accessMode: z.enum(["permanent", "hours", "vip"]).default("permanent"),
      accessHours: z.number().int().min(1).max(8760).nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { data: result, error } = await context.supabase.functions.invoke("content-admin", { body: { action: "quick_publish", ...data } });
    if (error) throw new Error(error.message);
    if (result?.error) throw new Error(String(result.error));
    return result;
  });

async function teamDb(context: any) {
  const { data } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .in("role", ["admin", "operator"]);
  if (!data?.length) throw new Error("Forbidden");
  const isAdmin = data.some((r: any) => r.role === "admin");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { db: supabaseAdmin as any, isAdmin };
}

export const getContentStudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db, isAdmin } = await teamDb(context);
    const [
      { data: sets },
      { data: folders },
      { data: series },
      { data: publications },
      { data: purchases },
      { data: accesses },
      { data: bundles },
      { data: bundleItems },
    ] = await Promise.all([
      db
        .from("content_sets")
        .select("*, products(id,title,price_stars,price_ton,price_trx,active,kind,upsell_product_id), content_series(id,title), content_set_items(item_role,sort_order,media_file_id,media_files(id,display_name,mime_type,preview_allowed))")
        .order("created_at", { ascending: false }),
      db.from("media_folders").select("id,title,description,active,media_files(id,display_name,mime_type,preview_allowed,sort_order)").order("sort_order"),
      db.from("content_series").select("*").order("sort_order"),
      db.from("content_publications").select("*").order("created_at", { ascending: false }).limit(100),
      db.from("purchases").select("product_id,amount_stars,amount_ton,amount_trx,currency,status").eq("status", "paid").not("product_id", "is", null).limit(10000),
      db.from("content_access").select("content_set_id,status,last_opened_at").limit(10000),
      db.from("products").select("id,title,description,price_stars,active,sort_order").eq("kind", "bundle").order("sort_order"),
      db.from("bundle_items").select("bundle_id,product_id"),
    ]);

    const sales = new Map<string, { count: number; stars: number; ton: number; trx: number }>();
    for (const row of purchases ?? []) {
      if (!row.product_id) continue;
      const current = sales.get(row.product_id) ?? { count: 0, stars: 0, ton: 0, trx: 0 };
      current.count += 1;
      if (row.currency === "ton") current.ton += Number(row.amount_ton ?? 0);
      else if (row.currency === "trx") current.trx += Number(row.amount_trx ?? 0);
      else current.stars += Number(row.amount_stars ?? 0);
      sales.set(row.product_id, current);
    }
    const opens = new Map<string, number>();
    for (const row of accesses ?? []) {
      if (!row.last_opened_at) continue;
      opens.set(row.content_set_id, (opens.get(row.content_set_id) ?? 0) + 1);
    }
    const analytics = Object.fromEntries(
      (sets ?? []).map((set: any) => {
        const stats = set.products?.id ? sales.get(set.products.id) : null;
        return [set.id, { sales: stats?.count ?? 0, revenueStars: stats?.stars ?? 0, revenueTon: stats?.ton ?? 0, revenueTrx: stats?.trx ?? 0, ownersOpened: opens.get(set.id) ?? 0 }];
      }),
    );
    const bundleItemMap = new Map<string, string[]>();
    for (const row of bundleItems ?? []) {
      const list = bundleItemMap.get(row.bundle_id) ?? [];
      list.push(row.product_id);
      bundleItemMap.set(row.bundle_id, list);
    }
    const bundleList = (bundles ?? []).map((bundle: any) => ({ ...bundle, productIds: bundleItemMap.get(bundle.id) ?? [] }));

    return {
      isAdmin,
      sets: sets ?? [],
      folders: folders ?? [],
      series: series ?? [],
      publications: publications ?? [],
      analytics,
      bundles: bundleList,
    };
  });

export const createContentSet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        title: z.string().min(1).max(140),
        description: z.string().max(3000).default(""),
        folderId: z.string().uuid(),
        previewFileId: z.string().uuid().nullable().optional(),
        priceStars: z.number().int().min(1).max(1_000_000),
        priceTon: z.number().min(0).max(100000).default(0),
        priceTrx: z.number().min(0).max(100000000).default(0),
        accessMode: z.enum(["permanent", "hours", "vip"]).default("permanent"),
        accessHours: z.number().int().min(1).max(8760).nullable().optional(),
        seriesId: z.string().uuid().nullable().optional(),
        status: z.enum(["draft", "active"]).default("draft"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { db, isAdmin } = await teamDb(context);
    if (!isAdmin) throw new Error("Nur Admins können verkaufbare Inhalte anlegen.");

    const { data: files, error: filesError } = await db
      .from("media_files")
      .select("id, sort_order, preview_allowed")
      .eq("folder_id", data.folderId)
      .eq("archived", false)
      .order("sort_order");
    if (filesError) throw new Error(filesError.message);
    if (!files?.length) throw new Error("Der ausgewählte Medienordner enthält noch keine Dateien.");

    const previewId = selectPreviewFileId(files, data.previewFileId);

    const { data: product, error: productError } = await db
      .from("products")
      .insert({
        title: data.title,
        description: data.description,
        kind: "ppv",
        price_stars: data.priceStars,
        price_ton: data.priceTon,
        price_trx: data.priceTrx,
        delivery_type: "text",
        delivery_payload: "content:pending",
        active: data.status === "active",
      })
      .select("id")
      .single();
    if (productError) throw new Error(productError.message);

    const { data: set, error: setError } = await db
      .from("content_sets")
      .insert({
        title: data.title,
        description: data.description,
        product_id: product.id,
        series_id: data.seriesId ?? null,
        status: data.status,
        access_mode: data.accessMode,
        access_hours: data.accessMode === "hours" ? data.accessHours ?? 24 : null,
      })
      .select("id")
      .single();
    if (setError) {
      await db.from("products").delete().eq("id", product.id);
      throw new Error(setError.message);
    }

    const { error: productLinkError } = await db
      .from("products")
      .update({ delivery_payload: `content:${set.id}` })
      .eq("id", product.id);
    if (productLinkError) {
      await db.from("content_sets").delete().eq("id", set.id);
      await db.from("products").delete().eq("id", product.id);
      throw new Error(productLinkError.message);
    }
    const protectedItems = files.map((f: any, index: number) => ({
      content_set_id: set.id,
      media_file_id: f.id,
      item_role: "protected",
      sort_order: index,
    }));
    const previewItems = previewId
      ? [{ content_set_id: set.id, media_file_id: previewId, item_role: "preview", sort_order: 0 }]
      : [];
    const { error: itemsError } = await db.from("content_set_items").insert([...protectedItems, ...previewItems]);
    if (itemsError) {
      await db.from("content_sets").delete().eq("id", set.id);
      await db.from("products").delete().eq("id", product.id);
      throw new Error(itemsError.message);
    }

    return { ok: true, id: set.id };
  });


const CONTENT_SMOKE_TITLE = "🔧 Smoke Test – Content Unlock";

export const createContentSmokeTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db, isAdmin } = await teamDb(context);
    if (!isAdmin) throw new Error("Forbidden");

    const { data: existing } = await db
      .from("content_sets")
      .select("id,product_id")
      .eq("title", CONTENT_SMOKE_TITLE)
      .maybeSingle();
    if (existing) {
      await db.from("content_sets").update({ status: "active", access_mode: "permanent", access_hours: null }).eq("id", existing.id);
      if (existing.product_id) await db.from("products").update({ active: true, price_stars: 1 }).eq("id", existing.product_id);
      return { ok: true, id: existing.id, reused: true };
    }

    const { data: media, error: mediaError } = await db
      .from("media_files")
      .select("id,folder_id,display_name")
      .eq("preview_allowed", true)
      .eq("archived", false)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (mediaError) throw new Error(mediaError.message);
    if (!media) throw new Error("Für den Smoke-Test wird mindestens ein als Preview freigegebenes Medium benötigt.");

    const { data: product, error: productError } = await db
      .from("products")
      .insert({
        title: CONTENT_SMOKE_TITLE,
        description: "Technischer 1-Star-Test für Shop-Post, Zahlung, Freischaltung und Telegram-Auslieferung.",
        kind: "ppv",
        price_stars: 1,
        price_ton: 0,
        delivery_type: "text",
        delivery_payload: "content:pending",
        active: true,
      })
      .select("id")
      .single();
    if (productError) throw new Error(productError.message);

    const { data: set, error: setError } = await db
      .from("content_sets")
      .insert({
        title: CONTENT_SMOKE_TITLE,
        description: `Testmedium: ${media.display_name || "Preview"}`,
        product_id: product.id,
        status: "active",
        access_mode: "permanent",
        access_hours: null,
      })
      .select("id")
      .single();
    if (setError) {
      await db.from("products").delete().eq("id", product.id);
      throw new Error(setError.message);
    }

    try {
      const { error: linkError } = await db.from("products").update({ delivery_payload: `content:${set.id}` }).eq("id", product.id);
      if (linkError) throw new Error(linkError.message);
      const { error: itemsError } = await db.from("content_set_items").insert([
        { content_set_id: set.id, media_file_id: media.id, item_role: "preview", sort_order: 0 },
        { content_set_id: set.id, media_file_id: media.id, item_role: "protected", sort_order: 0 },
      ]);
      if (itemsError) throw new Error(itemsError.message);
    } catch (error) {
      await db.from("content_sets").delete().eq("id", set.id);
      await db.from("products").delete().eq("id", product.id);
      throw error;
    }

    return { ok: true, id: set.id, productId: product.id, mediaFileId: media.id, reused: false };
  });

export const cleanupContentSmokeTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db, isAdmin } = await teamDb(context);
    if (!isAdmin) throw new Error("Forbidden");
    const { data: set } = await db
      .from("content_sets")
      .select("id,product_id")
      .eq("title", CONTENT_SMOKE_TITLE)
      .maybeSingle();
    if (!set) return { ok: true, removed: false };
    const { error: setError } = await db.from("content_sets").delete().eq("id", set.id);
    if (setError) throw new Error(setError.message);
    if (set.product_id) {
      const { error: productError } = await db.from("products").delete().eq("id", set.product_id);
      if (productError) throw new Error(productError.message);
    }
    return { ok: true, removed: true };
  });

export const updateContentSet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        title: z.string().min(1).max(140).optional(),
        description: z.string().max(3000).optional(),
        status: z.enum(["draft", "active", "archived"]).optional(),
        priceStars: z.number().int().min(1).max(1_000_000).optional(),
        priceTon: z.number().min(0).max(100000).optional(),
        priceTrx: z.number().min(0).max(100000000).optional(),
        accessMode: z.enum(["permanent", "hours", "vip"]).optional(),
        accessHours: z.number().int().min(1).max(8760).nullable().optional(),
        seriesId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { db, isAdmin } = await teamDb(context);
    if (!isAdmin) throw new Error("Forbidden");
    const { data: set } = await db.from("content_sets").select("product_id,access_mode").eq("id", data.id).maybeSingle();
    if (!set) throw new Error("Content-Set nicht gefunden");

    const setPatch: Record<string, unknown> = {};
    if (data.title !== undefined) setPatch['title'] = data.title;
    if (data.description !== undefined) setPatch['description'] = data.description;
    if (data.status !== undefined) setPatch['status'] = data.status;
    if (data.accessMode !== undefined) setPatch['access_mode'] = data.accessMode;
    if (data.accessHours !== undefined) setPatch['access_hours'] = data.accessHours;
    if (data.seriesId !== undefined) setPatch['series_id'] = data.seriesId;
    if (data.accessMode && data.accessMode !== "hours") setPatch['access_hours'] = null;
    if (Object.keys(setPatch).length) {
      const { error } = await db.from("content_sets").update(setPatch).eq("id", data.id);
      if (error) throw new Error(error.message);
    }

    const productPatch: Record<string, unknown> = {};
    if (data.title !== undefined) productPatch['title'] = data.title;
    if (data.description !== undefined) productPatch['description'] = data.description;
    if (data.priceStars !== undefined) productPatch['price_stars'] = data.priceStars;
    if (data.priceTon !== undefined) productPatch['price_ton'] = data.priceTon;
    if (data.priceTrx !== undefined) productPatch['price_trx'] = data.priceTrx;
    if (data.status !== undefined) productPatch['active'] = data.status === "active";
    if (set.product_id && Object.keys(productPatch).length) {
      const { error } = await db.from("products").update(productPatch).eq("id", set.product_id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const createContentSeries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ title: z.string().min(1).max(140), description: z.string().max(2000).default("") }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { db, isAdmin } = await teamDb(context);
    if (!isAdmin) throw new Error("Forbidden");
    const { data: row, error } = await db
      .from("content_series")
      .insert({ title: data.title, description: data.description })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id };
  });

export const createContentBundle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        title: z.string().min(1).max(140),
        description: z.string().max(2000).default(""),
        priceStars: z.number().int().min(1).max(1_000_000),
        contentSetIds: z.array(z.string().uuid()).min(2).max(20),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { db, isAdmin } = await teamDb(context);
    if (!isAdmin) throw new Error("Forbidden");
    const ids = [...new Set(data.contentSetIds)];
    if (ids.length < 2) throw new Error("Ein Bundle braucht mindestens zwei verschiedene Content-Sets.");

    const { data: sets, error: setsError } = await db
      .from("content_sets")
      .select("id,product_id,title")
      .in("id", ids);
    if (setsError) throw new Error(setsError.message);
    if ((sets ?? []).length !== ids.length || (sets ?? []).some((set: any) => !set.product_id)) {
      throw new Error("Mindestens ein Content-Set ist nicht vollständig mit einem Produkt verknüpft.");
    }

    const { data: product, error: productError } = await db
      .from("products")
      .insert({
        title: data.title,
        description: data.description,
        kind: "bundle",
        price_stars: data.priceStars,
        price_ton: 0,
        price_trx: 0,
        delivery_type: "text",
        delivery_payload: "bundle:content",
        active: true,
      })
      .select("id")
      .single();
    if (productError) throw new Error(productError.message);

    const { error: itemError } = await db.from("bundle_items").insert(
      (sets ?? []).map((set: any) => ({ bundle_id: product.id, product_id: set.product_id })),
    );
    if (itemError) {
      await db.from("products").delete().eq("id", product.id);
      throw new Error(itemError.message);
    }
    return { ok: true, id: product.id };
  });

export const setContentUpsell = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ contentSetId: z.string().uuid(), upsellContentSetId: z.string().uuid().nullable() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { db, isAdmin } = await teamDb(context);
    if (!isAdmin) throw new Error("Forbidden");
    const { data: source } = await db.from("content_sets").select("product_id").eq("id", data.contentSetId).maybeSingle();
    if (!source?.product_id) throw new Error("Quell-Produkt fehlt.");
    let upsellProductId: string | null = null;
    if (data.upsellContentSetId) {
      if (data.upsellContentSetId === data.contentSetId) throw new Error("Ein Set kann nicht sein eigenes Upsell sein.");
      const { data: target } = await db.from("content_sets").select("product_id").eq("id", data.upsellContentSetId).maybeSingle();
      if (!target?.product_id) throw new Error("Upsell-Produkt fehlt.");
      upsellProductId = target.product_id;
    }
    const { error } = await db.from("products").update({ upsell_product_id: upsellProductId }).eq("id", source.product_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const publishContentSet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid(), target: z.enum(["shop", "community"]).default("shop") }).parse(input))
  .handler(async ({ data, context }) => {
    const { db, isAdmin } = await teamDb(context);
    if (!isAdmin) throw new Error("Forbidden");

    const { data: set } = await db
      .from("content_sets")
      .select("id,title,description,status,access_mode,access_hours,products(id,price_stars,price_ton,price_trx,active),content_set_items(item_role,sort_order,media_files(storage_path,mime_type))")
      .eq("id", data.id)
      .maybeSingle();
    if (!set) throw new Error("Content-Set nicht gefunden");
    if (set.status !== "active" || !set.products?.active) throw new Error("Set zuerst aktivieren.");

    const { data: settings } = await db
      .from("bot_settings")
      .select("shop_chat_id,community_chat_id")
      .eq("id", true)
      .maybeSingle();
    const chatId = String(data.target === "shop" ? settings?.shop_chat_id ?? "" : settings?.community_chat_id ?? "").trim();
    if (!chatId) throw new Error(data.target === "shop" ? "Shop-Gruppe ist nicht verbunden." : "Community-Gruppe ist nicht verbunden.");

    const me = await tgSafe("getMe", {});
    const username = String((me as any)?.username ?? "");
    if (!username) throw new Error("Bot-Benutzername konnte nicht ermittelt werden.");

    const accessText = set.access_mode === "hours" ? `${set.access_hours ?? 24}h Zugriff` : set.access_mode === "vip" ? "👑 Im VIP-Zugang enthalten" : "dauerhaft";
    const cryptoPrices = [Number(set.products.price_ton) > 0 ? `${set.products.price_ton} TON` : "", Number(set.products.price_trx) > 0 ? `${set.products.price_trx} TRX` : ""].filter(Boolean).join(" · ");
    const priceText = set.access_mode === "vip" ? "" : ` · <b>⭐ ${set.products.price_stars}${cryptoPrices ? ` · ${cryptoPrices}` : ""}</b>`;
    const caption = `🔒 <b>${escapeHtml(set.title)}</b>\n\n${escapeHtml(set.description || "Exklusiver Content")}\n\n${accessText}${priceText}`;
    const markup = { inline_keyboard: [[{ text: set.access_mode === "vip" ? "👑 VIP im Bot öffnen" : "🔓 Im Bot freischalten", url: `https://t.me/${username}?start=c_${set.id}` }]] };
    const preview = (set.content_set_items ?? [])
      .filter((x: any) => x.item_role === "preview")
      .sort((a: any, b: any) => a.sort_order - b.sort_order)[0]?.media_files;

    let sent: any = null;
    if (preview?.storage_path) {
      const { data: signed, error } = await db.storage.from("media-vault").createSignedUrl(preview.storage_path, 300);
      if (error) throw new Error(error.message);
      const mime = String(preview.mime_type ?? "");
      sent = await tgSafe(mime.startsWith("video/") ? "sendVideo" : "sendPhoto", {
        chat_id: chatId,
        [mime.startsWith("video/") ? "video" : "photo"]: signed.signedUrl,
        caption,
        parse_mode: "HTML",
        reply_markup: markup,
      });
    } else {
      sent = await tgSafe("sendMessage", { chat_id: chatId, text: caption, parse_mode: "HTML", reply_markup: markup });
    }

    if (!sent) throw new Error("Telegram konnte den Shop-Post nicht veröffentlichen.");
    const messageId = Number((sent as any)?.message_id ?? 0) || null;
    const { error: publicationError } = await db.from("content_publications").insert({
      content_set_id: set.id,
      target: data.target,
      telegram_chat_id: chatId,
      telegram_message_id: messageId,
      status: "published",
      published_at: new Date().toISOString(),
    });
    if (publicationError) throw new Error(`Telegram-Post wurde veröffentlicht, aber die Veröffentlichung konnte intern nicht gespeichert werden: ${publicationError.message}`);
    return { ok: true, messageId };
  });
