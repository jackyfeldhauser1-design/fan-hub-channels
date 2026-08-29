/**
 * Serverlogik für Drops: Aktionspreise, begrenzte Stückzahlen und
 * Veröffentlichung in Ankündigungs- und Trailer-Channel.
 */


async function tg(method: string, body: Record<string, unknown> = {}) {
  const { tgApi } = await import("@/lib/telegram.server");
  return tgApi(method, body);
}

export type DropItem = {
  id: string;
  kind: "product" | "folder";
  title: string;
  description: string;
  active: boolean;
  priceStars: number;
  salePriceStars: number;
  saleUntil: string | null;
  stockLimit: number;
  stockSold: number;
  effectivePrice: number;
  soldOut: boolean;
  saleActive: boolean;
};

function decorate(row: any, kind: "product" | "folder"): DropItem {
  const saleActive =
    Number(row.sale_price_stars ?? 0) > 0 &&
    (!row.sale_until || new Date(row.sale_until).getTime() > Date.now());
  const stockLimit = Number(row.stock_limit ?? 0);
  const stockSold = Number(row.stock_sold ?? 0);
  return {
    id: row.id,
    kind,
    title: row.title ?? "",
    description: row.description ?? "",
    active: Boolean(row.active),
    priceStars: Number(row.price_stars ?? 0),
    salePriceStars: Number(row.sale_price_stars ?? 0),
    saleUntil: row.sale_until ?? null,
    stockLimit,
    stockSold,
    effectivePrice: saleActive ? Number(row.sale_price_stars) : Number(row.price_stars ?? 0),
    soldOut: stockLimit > 0 && stockSold >= stockLimit,
    saleActive,
  };
}

/** Liest alle verkaufbaren Einheiten (Produkte + Medienordner) mit Aktionsdaten. */
export async function readDrops(db: any) {
  const [{ data: products }, { data: folders }, { data: settings }] = await Promise.all([
    db
      .from("products")
      .select("id, title, description, active, price_stars, sale_price_stars, sale_until, stock_limit, stock_sold")
      .order("sort_order"),
    db
      .from("media_folders")
      .select("id, title, description, active, price_stars, sale_price_stars, sale_until, stock_limit, stock_sold")
      .order("sort_order"),
    db
      .from("bot_settings")
      .select("shop_chat_id, community_chat_id, app_base_url")
      .eq("id", true)
      .maybeSingle(),
  ]);

  return {
    items: [
      ...((products ?? []) as any[]).map((r) => decorate(r, "product")),
      ...((folders ?? []) as any[]).map((r) => decorate(r, "folder")),
    ],
    channels: {
      shop: settings?.shop_chat_id ?? "",
      community: settings?.community_chat_id ?? "",
      baseUrl: settings?.app_base_url ?? "",
    },
  };
}

/** Speichert Aktionspreis, Laufzeit und Stückzahl-Limit. */
export async function writeDropPricing(
  db: any,
  input: {
    id: string;
    kind: "product" | "folder";
    salePriceStars: number;
    saleUntil: string | null;
    stockLimit: number;
  },
) {
  const table = input.kind === "product" ? "products" : "media_folders";
  const { error } = await db
    .from(table)
    .update({
      sale_price_stars: input.salePriceStars,
      sale_until: input.saleUntil,
      stock_limit: input.stockLimit,
    })
    .eq("id", input.id);
  if (error) throw new Error(error.message);
  return { saved: true };
}

async function botLink(db: any) {
  try {
    const me = await tg("getMe", {});
    const username = me.result?.username ?? "";
    return username ? `https://t.me/${username}?start=drop` : "";
  } catch {
    void db;
    return "";
  }
}

/** Baut den Nachrichtentext für einen Drop-Post. */
export function dropMessage(item: DropItem, variant: "drop" | "teaser", link: string) {
  const price = item.saleActive
    ? `⭐ ${item.effectivePrice} statt ⭐ ${item.priceStars}`
    : `⭐ ${item.priceStars}`;
  const rest =
    item.stockLimit > 0 ? `\nNoch ${Math.max(item.stockLimit - item.stockSold, 0)} von ${item.stockLimit} verfügbar.` : "";
  const until = item.saleActive && item.saleUntil ? `\nAktion bis ${new Date(item.saleUntil).toLocaleString("de-DE")}.` : "";
  const head = variant === "teaser" ? "🎬 Vorschau" : "🔥 Neuer Drop";
  const body = item.description ? `\n\n${item.description.slice(0, 500)}` : "";
  const cta = link ? `\n\n👉 Jetzt sichern: ${link}` : "";
  return `${head}: ${item.title}\n${price}${until}${rest}${body}${cta}`;
}

/** Postet einen Drop in den Shop-Kanal und/oder als Teaser in die Community. */
export async function publishDropPost(
  db: any,
  input: { id: string; kind: "product" | "folder"; targets: ("shop" | "community")[] },
  actor: { id: string | null; email: string | null },
) {
  const { items, channels } = await readDrops(db);
  const item = items.find((i) => i.id === input.id && i.kind === input.kind);
  if (!item) throw new Error("Eintrag nicht gefunden");

  const link = await botLink(db);
  const { auditLog } = await import("@/lib/security.server");
  const posts: { target: string; chatId: string; ok: boolean; error: string }[] = [];

  for (const t of input.targets) {
    const chatId = t === "shop" ? channels.shop : channels.community;
    const label = t === "shop" ? "Shop" : "Community";
    if (!chatId) {
      posts.push({ target: label, chatId: "", ok: false, error: "Channel nicht verbunden" });
      continue;
    }
    const text = dropMessage(item, t === "shop" ? "drop" : "teaser", link);
    let ok = true;
    let err = "";
    let messageId = "";
    try {
      const res = await tg("sendMessage", { chat_id: chatId, text, disable_web_page_preview: false });
      messageId = String(res.result?.message_id ?? "");
    } catch (e) {
      ok = false;
      err = e instanceof Error ? e.message.slice(0, 300) : "Fehler";
    }
    await db.from("notification_deliveries").insert({
      recipient_label: `Drop: ${label}`,
      kind: "reactivated",
      channel: "telegram",
      target: chatId,
      body: text,
      status: ok ? "sent" : "dead",
      attempt: 1,
      error: err,
      provider_message_id: messageId,
    });
    await auditLog(db, {
      actorId: actor.id,
      actorEmail: actor.email,
      action: "drop_publish",
      target: `${item.kind}:${item.title}`,
      chatId,
      status: ok ? "ok" : "error",
      detail: err || `Drop-Post gesendet (msg ${messageId})`,
      meta: { variant: t, price: item.effectivePrice },
    });
    posts.push({ target: label, chatId, ok, error: err });
  }

  return { posts, item };
}
