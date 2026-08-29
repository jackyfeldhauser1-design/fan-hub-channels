/**
 * Geführtes Telegram-Setup: Einrichtungs-Codes erzeugen und eingehende
 * Chats automatisch als Community, Shop oder Kontrollraum einrichten.
 */
import { tgApi, tgSafe } from "@/lib/telegram.server";

export type SetupTarget = "community" | "shop" | "control";

export const TARGETS: { key: SetupTarget; label: string; column: string; hint: string; suggestedName: string }[] = [
  {
    key: "community",
    label: "Community",
    column: "community_chat_id",
    hint: "Kostenlose Fan-Gruppe – Einstieg aus dem Bot.",
    suggestedName: "Community",
  },
  {
    key: "shop",
    label: "Shop",
    column: "shop_chat_id",
    hint: "VIP-/Kaufbereich für Drops und Verkaufsposts.",
    suggestedName: "Shop VIP",
  },
  {
    key: "control",
    label: "Kontrollraum",
    column: "control_chat_id",
    hint: "Privater Admin-Chat für Alarme, Testposts und Fehler.",
    suggestedName: "Kontrollraum",
  },
];

const WELCOME: Record<SetupTarget, string> = {
  community:
    "👋 <b>Willkommen in der Community!</b>\nHier gibt es kostenlose Updates, Teaser und Ankündigungen. Starte den Bot, um Zugänge und Drops zu erhalten.",
  shop:
    "🛍 <b>Shop ist aktiv</b>\nHier erscheinen neue Drops, VIP-Inhalte und Angebote. Käufe laufen sicher über den Bot mit Stars oder TON.",
  control:
    "🛠 <b>Kontrollraum verbunden</b>\nHier landen ab sofort Alarme, Zustellprotokolle, Testposts und Fehlermeldungen.",
};

function newCode() {
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `S${rnd}${Date.now().toString(36).slice(-3).toUpperCase()}`;
}

/** Legt für jedes gewünschte Ziel einen einmaligen Code samt Telegram-Link an. */
export async function createSetupCodes(db: any, targets: SetupTarget[], userId: string | null) {
  const me = await tgApi("getMe", {});
  const username = String(me.result?.username ?? "");
  if (!username) throw new Error("Bot nicht erreichbar – bitte zuerst den Token speichern.");

  const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
  const out: {
    target: SetupTarget;
    label: string;
    hint: string;
    suggestedName: string;
    code: string;
    link: string;
    expiresAt: string;
  }[] = [];

  for (const t of TARGETS.filter((t) => targets.includes(t.key))) {
    const code = newCode();
    const { error } = await db
      .from("chat_setup_codes")
      .insert({ code, target: t.key, expires_at: expiresAt, created_by: userId });
    if (error) throw new Error(error.message);
    out.push({
      target: t.key,
      label: t.label,
      hint: t.hint,
      suggestedName: t.suggestedName,
      code,
      link:
        t.key === "control"
          ? `https://t.me/${username}?start=${code}`
          : `https://t.me/${username}?startgroup=${code}&admin=post_messages+pin_messages+invite_users`,
      expiresAt,
    });
  }
  return { botUsername: username, targets: out };
}

async function canPost(chatId: string) {
  try {
    const me = await tgApi("getMe", {});
    const member = await tgApi("getChatMember", { chat_id: chatId, user_id: me.result?.id });
    const s = member.result?.status;
    if (s === "administrator") return { ok: true, detail: "Bot ist Administrator" };
    if (s === "member" || s === "creator") return { ok: true, detail: "Bot ist Mitglied" };
    if (s === "private") return { ok: true, detail: "Privatchat" };
    return { ok: false, detail: `Bot-Status: ${s ?? "unbekannt"}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message.slice(0, 200) : "Rechte nicht prüfbar" };
  }
}

/**
 * Löst einen Setup-Code ein: Ziel speichern, Rechte prüfen,
 * Willkommenspost senden und anpinnen, Audit schreiben.
 */
export async function redeemSetupCode(
  db: any,
  code: string,
  chat: { id: number | string; title?: string; type?: string },
) {
  const clean = code.trim().toUpperCase();
  const { data: row } = await db.from("chat_setup_codes").select("*").eq("code", clean).maybeSingle();
  if (!row) return { ok: false, detail: "Code unbekannt" };
  if (row.used_at) return { ok: false, detail: "Code bereits verwendet" };
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await db.from("chat_setup_codes").update({ status: "expired", detail: "abgelaufen" }).eq("id", row.id);
    return { ok: false, detail: "Code abgelaufen" };
  }
  return applyTarget(db, row, String(chat.id), chat.title ?? "", chat.type ?? "");
}

/** Schreibt ein erkanntes Ziel in die Bot-Einstellungen und richtet den Chat ein. */
export async function applyTarget(db: any, row: any, chatId: string, title: string, type: string) {
  const target = row.target as SetupTarget;
  const def = TARGETS.find((t) => t.key === target)!;

  const perms = await canPost(chatId);
  await db
    .from("bot_settings")
    .update({ [def.column]: chatId })
    .eq("id", true);

  let posted = false;
  if (perms.ok) {
    const sent = await tgSafe("sendMessage", {
      chat_id: chatId,
      text: WELCOME[target],
      parse_mode: "HTML",
      disable_notification: true,
    });
    posted = Boolean(sent?.message_id);
    if (posted && type !== "private") {
      await tgSafe("pinChatMessage", { chat_id: chatId, message_id: sent.message_id, disable_notification: true });
    }
  }

  await db
    .from("chat_setup_codes")
    .update({
      used_at: new Date().toISOString(),
      chat_id: chatId,
      chat_title: title,
      status: perms.ok ? "connected" : "needs_rights",
      detail: perms.ok ? (posted ? "Willkommenspost gesendet" : perms.detail) : perms.detail,
    })
    .eq("id", row.id);

  await db.from("admin_audit").insert({
    action: "chat_setup",
    target: def.label,
    chat_id: chatId,
    status: perms.ok ? "ok" : "warn",
    detail: perms.detail,
    meta: { title, type, code: row.code },
  });

  return { ok: perms.ok, detail: perms.detail, target, chatId, title };
}

/** Fallback: Bot wurde ohne Code in eine Gruppe aufgenommen. */
export async function claimPendingForChat(db: any, chatId: string, title: string, type: string) {
  const { data: rows } = await db
    .from("chat_setup_codes")
    .select("*")
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true });
  const list = (rows ?? []) as any[];
  if (list.length === 0) return { ok: false, detail: "kein offener Setup-Code" };
  const wantGroup = type === "group" || type === "supergroup" || type === "channel";
  const row = list.find((r) => (wantGroup ? r.target !== "control" : r.target === "control")) ?? list[0];
  return applyTarget(db, row, chatId, title, type);
}

/** Fortschritt für die Oberfläche. */
export async function readSetupProgress(db: any) {
  const [{ data: settings }, { data: codes }] = await Promise.all([
    db.from("bot_settings").select("community_chat_id, shop_chat_id, control_chat_id, app_base_url").eq("id", true).maybeSingle(),
    db.from("chat_setup_codes").select("*").order("created_at", { ascending: false }).limit(12),
  ]);
  const { getBotToken } = await import("@/lib/telegram.server");
  const { username } = await getBotToken();
  const items = TARGETS.map((t) => {
    const chatId = String((settings as any)?.[t.column] ?? "").trim();
    const last = (codes ?? []).find((c: any) => c.target === t.key);
    return {
      target: t.key,
      label: t.label,
      hint: t.hint,
      chatId,
      connected: Boolean(chatId),
      status: chatId ? "connected" : (last?.status ?? "open"),
      detail: last?.detail ?? "",
      chatTitle: last?.chat_title ?? "",
    };
  });
  return {
    botUsername: username,
    baseUrl: (settings as any)?.app_base_url ?? "",
    connected: items.filter((i) => i.connected).length,
    total: items.length,
    items,
  };
}
