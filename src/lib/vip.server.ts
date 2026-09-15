/**
 * Zugangs-Weiterleitung in die Telegram-Chats:
 * erzeugt persönliche Einmal-Einladungslinks für Community (gratis)
 * und Shop/VIP (bezahlt) und fällt auf die hinterlegten festen Links zurück.
 */
import { tgApi } from "@/lib/telegram.server";

export type InviteTarget = "community" | "shop";

/** Erstellt einen persönlichen Einladungslink (1 Beitritt, begrenzte Gültigkeit). */
export async function personalInvite(
  settings: any,
  target: InviteTarget,
  name: string,
): Promise<{ url: string; personal: boolean; error: string }> {
  const chatId = target === "community" ? settings?.community_chat_id : settings?.shop_chat_id;
  const fallback = target === "community" ? settings?.free_group_url : settings?.vip_group_url;
  const hours = Math.max(1, Number(settings?.vip_invite_ttl_hours ?? 24));
  if (chatId) {
    try {
      const res = await tgApi("createChatInviteLink", {
        chat_id: chatId,
        name: name.slice(0, 32),
        member_limit: 1,
        expire_date: Math.floor(Date.now() / 1000) + hours * 3600,
        creates_join_request: false,
      });
      const url = String(res.result?.invite_link ?? "");
      if (url) return { url, personal: true, error: "" };
    } catch (e) {
      const error = e instanceof Error ? e.message.slice(0, 200) : "Einladung fehlgeschlagen";
      if (fallback) return { url: String(fallback), personal: false, error };
      return { url: "", personal: false, error };
    }
  }
  return { url: String(fallback ?? ""), personal: false, error: chatId ? "" : "Chat nicht verbunden" };
}

/** Prüft, ob ein Fan bereits einen bezahlten VIP-Zugang besitzt. */
export async function hasVipAccess(db: any, tgUserId: string) {
  const { data } = await db
    .from("purchases")
    .select("id")
    .eq("tg_user_id", tgUserId)
    .eq("status", "paid")
    .eq("title_snapshot", "VIP")
    .limit(1);
  if (data?.length) return true;
  const { data: rows } = await db
    .from("order_events")
    .select("id")
    .eq("tg_user_id", tgUserId)
    .eq("kind", "vip_granted")
    .limit(1);
  return Boolean(rows?.length);
}

/** Vergibt den VIP-Zugang: Einladungslink erzeugen, senden und protokollieren. */
export async function grantVipAccess(
  db: any,
  tg: (m: string, b: Record<string, unknown>) => Promise<any>,
  chatId: number | string,
  user: { id: string; first_name?: string | null; username?: string | null },
  settings: any,
  purchaseId: string | null,
) {
  const label = user.username ? `@${user.username}` : (user.first_name ?? "Fan");
  const invite = await personalInvite(settings, "shop", `VIP ${label}`);
  if (invite.url) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: `⭐ <b>VIP freigeschaltet</b>\nDein persönlicher Zugang zum Shop-Channel:\n${invite.personal ? "Der Link gilt nur für dich und einmalig." : ""}`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "🔓 VIP-Channel öffnen", url: invite.url }]] },
    });
  } else {
    await tg("sendMessage", {
      chat_id: chatId,
      text: "⭐ Deine Zahlung ist angekommen. Der VIP-Zugang wird gleich manuell freigeschaltet.",
    });
  }
  await db.from("order_events").insert({
    purchase_id: purchaseId,
    tg_user_id: user.id,
    kind: "vip_granted",
    detail: invite.url ? (invite.personal ? "persönlicher Einmal-Link" : "Fallback-Link") : invite.error,
  });
  // VIP-only Content-Sets are kept in the same entitlement system as paid sets.
  // This makes "Meine Inhalte" the single Telegram library for the fan.
  try {
    const { syncVipContentAccess } = await import("@/lib/content.server");
    await syncVipContentAccess(db, user.id);
  } catch {
    // A channel invite must not fail just because optional content sync is unavailable.
  }
  if (purchaseId) {
    await db
      .from("purchases")
      .update({ delivery_status: invite.url ? "delivered" : "pending", delivered_at: new Date().toISOString() })
      .eq("id", purchaseId);
  }
  return invite;
}
