export type TgSender = (method: string, body: Record<string, unknown>) => Promise<any>;

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function tgRequired(tg: TgSender, method: string, body: Record<string, unknown>) {
  const result = await tg(method, body);
  if (result === null || result === undefined) throw new Error(`Telegram ${method}: Zustellung fehlgeschlagen`);
  return result;
}

export function accessExpiry(accessMode: string, accessHours: number | null | undefined, now = Date.now()) {
  if (accessMode !== "hours") return null;
  const hours = Math.max(1, Math.min(8760, Number(accessHours ?? 24)));
  return new Date(now + hours * 3600_000).toISOString();
}

export function selectPreviewFileId(
  files: Array<{ id: string; preview_allowed?: boolean | null }>,
  requestedId?: string | null,
) {
  const allowed = files.filter((f) => f.preview_allowed === true);
  if (requestedId && !allowed.some((f) => f.id === requestedId)) {
    throw new Error("Die gewählte Datei ist nicht als Preview freigegeben oder gehört nicht zu diesem Medienordner.");
  }
  return requestedId ?? allowed[0]?.id ?? null;
}

export async function contentSetForProduct(db: any, productId: string) {
  const { data } = await db
    .from("content_sets")
    .select("*")
    .eq("product_id", productId)
    .maybeSingle();
  return data ?? null;
}

export async function grantContentAccess(
  db: any,
  opts: { tgUserId: string; contentSet: any; purchaseId?: string | null; source?: string; expiresAt?: string | null },
) {
  const { data: existing } = await db
    .from("content_access")
    .select("*")
    .eq("tg_user_id", opts.tgUserId)
    .eq("content_set_id", opts.contentSet.id)
    .maybeSingle();

  // A Telegram webhook replay for the same purchase must never extend a timed
  // entitlement. Return the already committed access row unchanged.
  if (existing && opts.purchaseId && existing.purchase_id === opts.purchaseId) return existing;

  let expiresAt = opts.expiresAt ?? null;
  if (opts.expiresAt === undefined && opts.contentSet.access_mode === "hours") {
    const previous = existing?.expires_at ? new Date(existing.expires_at).getTime() : 0;
    const base = Math.max(Date.now(), previous);
    expiresAt = accessExpiry("hours", opts.contentSet.access_hours, base);
  }

  const row = {
    tg_user_id: opts.tgUserId,
    content_set_id: opts.contentSet.id,
    purchase_id: opts.purchaseId ?? existing?.purchase_id ?? null,
    source: opts.source ?? "purchase",
    status: "active",
    expires_at: opts.contentSet.access_mode === "permanent" ? null : expiresAt,
    granted_at: new Date().toISOString(),
  };

  if (existing) {
    const { data, error } = await db.from("content_access").update(row).eq("id", existing.id).select("*").single();
    if (error) throw new Error(error.message);
    return data;
  }

  const { data, error } = await db.from("content_access").insert(row).select("*").single();
  if (error) {
    // A concurrent grant can win the unique (fan, content) race. Re-read it
    // instead of creating a duplicate entitlement.
    const { data: raced } = await db
      .from("content_access")
      .select("*")
      .eq("tg_user_id", opts.tgUserId)
      .eq("content_set_id", opts.contentSet.id)
      .maybeSingle();
    if (raced) return raced;
    throw new Error(error.message);
  }
  return data;
}

export async function syncVipContentAccess(db: any, tgUserId: string) {
  const { activeSubscription } = await import("@/lib/billing.server");
  const { hasVipAccess } = await import("@/lib/vip.server");
  const subscription = await activeSubscription(db, tgUserId);
  const permanentVip = subscription ? false : await hasVipAccess(db, tgUserId);
  if (!subscription && !permanentVip) return [];

  const { data: sets } = await db
    .from("content_sets")
    .select("id, access_mode, access_hours")
    .eq("access_mode", "vip")
    .eq("status", "active");

  const granted: any[] = [];
  for (const set of sets ?? []) {
    granted.push(
      await grantContentAccess(db, {
        tgUserId,
        contentSet: set,
        source: "vip",
        expiresAt: subscription?.expires_at ?? null,
      }),
    );
  }
  return granted;
}

export async function activeContentAccess(db: any, tgUserId: string, contentSetId: string) {
  const { data } = await db
    .from("content_access")
    .select("*")
    .eq("tg_user_id", tgUserId)
    .eq("content_set_id", contentSetId)
    .eq("status", "active")
    .order("granted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) {
    await db.from("content_access").update({ status: "expired" }).eq("id", data.id);
    return null;
  }
  return data;
}

export async function listFanContent(db: any, tgUserId: string) {
  const { data } = await db
    .from("content_access")
    .select("id, status, expires_at, granted_at, last_opened_at, content_sets(id, title, description, access_mode, access_hours, status, products(id, price_stars))")
    .eq("tg_user_id", tgUserId)
    .eq("status", "active")
    .order("granted_at", { ascending: false })
    .limit(40);

  const out: any[] = [];
  for (const row of data ?? []) {
    if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
      await db.from("content_access").update({ status: "expired" }).eq("id", row.id);
      continue;
    }
    // A set may be paused/archived for new sales without revoking purchases.
    // Existing active access remains visible until explicitly revoked/expired.
    out.push(row);
  }
  return out;
}

async function signedFileUrl(db: any, path: string) {
  const { data, error } = await db.storage.from("media-vault").createSignedUrl(path, 300);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "Medienlink konnte nicht erstellt werden");
  return data.signedUrl as string;
}

export async function deliverContentSet(
  db: any,
  tg: TgSender,
  chatId: number,
  tgUserId: string,
  contentSetId: string,
) {
  const access = await activeContentAccess(db, tgUserId, contentSetId);
  if (!access) return { ok: false, reason: "Kein aktiver Zugriff" };

  const { data: set } = await db
    .from("content_sets")
    .select("id, title, description, status")
    .eq("id", contentSetId)
    .maybeSingle();
  if (!set) return { ok: false, reason: "Inhalt nicht gefunden" };

  const { data: items } = await db
    .from("content_set_items")
    .select("sort_order, media_files(id, storage_path, display_name, mime_type)")
    .eq("content_set_id", contentSetId)
    .eq("item_role", "protected")
    .order("sort_order", { ascending: true });

  const files = (items ?? []).map((x: any) => x.media_files).filter(Boolean);
  if (!files.length) {
    await tgRequired(tg, "sendMessage", { chat_id: chatId, text: `🔓 ${set.title}\n\nDer Inhalt ist freigeschaltet, aber noch nicht mit Medien befüllt.` });
    return { ok: true, delivered: 0 };
  }

  await tgRequired(tg, "sendMessage", {
    chat_id: chatId,
    text: `🔓 <b>${escapeHtml(set.title)}</b>\n${set.description ? `\n${escapeHtml(set.description)}` : ""}`,
    parse_mode: "HTML",
  });

  let delivered = 0;
  let batch: any[] = [];
  const flushBatch = async () => {
    if (!batch.length) return;
    if (batch.length === 1) {
      const [item] = batch;
      if (item.type === "video") {
        await tgRequired(tg, "sendVideo", { chat_id: chatId, video: item.media });
      } else {
        await tgRequired(tg, "sendPhoto", { chat_id: chatId, photo: item.media });
      }
      delivered += 1;
      batch = [];
      return;
    }
    await tgRequired(tg, "sendMediaGroup", { chat_id: chatId, media: batch });
    delivered += batch.length;
    batch = [];
  };

  for (const file of files) {
    const url = await signedFileUrl(db, file.storage_path);
    const mime = String(file.mime_type ?? "");
    if (mime.startsWith("image/") || mime.startsWith("video/")) {
      batch.push({
        type: mime.startsWith("video/") ? "video" : "photo",
        media: url,
      });
      if (batch.length === 10) await flushBatch();
      continue;
    }
    await flushBatch();
    if (mime.startsWith("audio/")) {
      await tgRequired(tg, "sendAudio", { chat_id: chatId, audio: url, caption: file.display_name || set.title });
    } else {
      await tgRequired(tg, "sendDocument", { chat_id: chatId, document: url, caption: file.display_name || set.title });
    }
    delivered++;
  }
  await flushBatch();

  await db.from("content_access").update({ last_opened_at: new Date().toISOString() }).eq("id", access.id);
  return { ok: true, delivered };
}

export async function offerContentSet(db: any, tg: TgSender, chatId: number, user: any, contentSetId: string) {
  const { data: set } = await db
    .from("content_sets")
    .select("id, title, description, status, access_mode, access_hours, products(id, title, price_stars, active)")
    .eq("id", contentSetId)
    .maybeSingle();

  if (!set || set.status !== "active") {
    await tg("sendMessage", { chat_id: chatId, text: "Dieses Angebot ist gerade nicht verfügbar." });
    return { ok: false };
  }

  if (set.access_mode === "vip") {
    await syncVipContentAccess(db, user.id);
    const vipOwned = await activeContentAccess(db, user.id, set.id);
    if (vipOwned) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: `🔓 <b>${escapeHtml(set.title)}</b> ist in deinem VIP-Zugang enthalten.`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "Inhalt anzeigen", callback_data: `content_${set.id}` }]] },
      });
      return { ok: true, owned: true, vip: true };
    }
    await tg("sendMessage", {
      chat_id: chatId,
      text: `👑 <b>${escapeHtml(set.title)}</b> ist VIP-Inhalt.`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "⭐ VIP freischalten", callback_data: "vip" }]] },
    });
    return { ok: true, owned: false, vip: true };
  }

  if (!set.products?.active) {
    await tg("sendMessage", { chat_id: chatId, text: "Dieses Angebot ist gerade nicht verfügbar." });
    return { ok: false };
  }

  const owned = await activeContentAccess(db, user.id, set.id);
  if (owned) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: `🔓 <b>${escapeHtml(set.title)}</b> ist bereits freigeschaltet.`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "Inhalt anzeigen", callback_data: `content_${set.id}` }]] },
    });
    return { ok: true, owned: true };
  }

  const accessText =
    set.access_mode === "hours"
      ? `${set.access_hours ?? 24} Stunden Zugriff`
      : set.access_mode === "vip"
        ? "VIP-Inhalt"
        : "Dauerhafter Zugriff";

  await tg("sendMessage", {
    chat_id: chatId,
    text: `🔒 <b>${escapeHtml(set.title)}</b>\n\n${escapeHtml(set.description || "Exklusiver Inhalt")}\n\n${accessText}\nPreis: <b>⭐ ${set.products.price_stars}</b>`,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [[{ text: `🔓 Für ⭐ ${set.products.price_stars} freischalten`, callback_data: `buy_${set.products.id}` }]] },
  });
  return { ok: true, owned: false };
}
