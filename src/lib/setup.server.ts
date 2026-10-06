/**
 * Geführtes Telegram-Setup: Einrichtungs-Codes erzeugen und eingehende
 * Chats automatisch als Community, Shop oder Kontrollraum einrichten.
 */
import { tgApi, tgSafe } from "@/lib/telegram.server";

export type SetupTarget = "community" | "shop" | "control";

const FAN_BOT_COMMANDS = [
  { command: "start", description: "Hauptmenü öffnen" },
  { command: "menu", description: "Schnellmenü öffnen" },
  { command: "shop", description: "Shop öffnen" },
  { command: "drops", description: "Neue Drops ansehen" },
];

async function configureFanBotCommands() {
  await tgApi("setMyCommands", {
    commands: FAN_BOT_COMMANDS,
    scope: { type: "all_private_chats" },
    language_code: "de",
  });
  await tgApi("setChatMenuButton", {
    menu_button: { type: "commands" },
  });
}

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

export const DEFAULT_WELCOME: Record<SetupTarget, string> = {
  community:
    "👋 <b>Willkommen in der Community!</b>\nHier gibt es kostenlose Updates, Teaser und Ankündigungen. Starte den Bot, um Zugänge und Drops zu erhalten.",
  shop:
    "🛍 <b>Shop ist aktiv</b>\nHier erscheinen neue Drops, VIP-Inhalte und Angebote. Käufe laufen sicher über den Bot mit Stars oder TON.",
  control:
    "🛠 <b>Kontrollraum verbunden</b>\nHier landen ab sofort Alarme, Zustellprotokolle, Testposts und Fehlermeldungen.",
};

/** Vorlage (Willkommenstext + Pin-Option) für ein Ziel laden. */
export async function loadTemplate(db: any, target: SetupTarget) {
  const { data } = await db.from("chat_templates").select("*").eq("target", target).maybeSingle();
  const body = String(data?.welcome_body ?? "").trim();
  return {
    target,
    welcomeBody: body || DEFAULT_WELCOME[target],
    pinMessage: data?.pin_message ?? true,
    isDefault: !body,
  };
}

/** Alle drei Vorlagen für die Oberfläche. */
export async function loadTemplates(db: any) {
  return Promise.all(
    TARGETS.map(async (t) => ({ ...(await loadTemplate(db, t.key)), label: t.label, hint: t.hint })),
  );
}

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

export async function canPost(chatId: string) {
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
  const tpl = await loadTemplate(db, target);
  await db
    .from("bot_settings")
    .update({ [def.column]: chatId })
    .eq("id", true);

  let posted = false;
  if (perms.ok) {
    const sent = await tgSafe("sendMessage", {
      chat_id: chatId,
      text: tpl.welcomeBody,
      parse_mode: "HTML",
      disable_notification: true,
    });
    posted = Boolean(sent?.message_id);
    if (posted && tpl.pinMessage && type !== "private") {
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

/** Vollständige Prüfung: Token, Webhook, Chats, Rechte – mit klaren Fehlern. */
export async function verifySetup(db: any) {
  const { getBotToken, tgApi, currentWebhookSecret } = await import("@/lib/telegram.server");
  const checks: { key: string; label: string; ok: boolean; detail: string }[] = [];
  const { token, username } = await getBotToken();

  let botOk = false;
  let botName = username;
  try {
    const me = await tgApi("getMe", {});
    botOk = true;
    botName = String(me.result?.username ?? username);
    checks.push({ key: "bot", label: "Bot erreichbar", ok: true, detail: `@${botName}${token ? "" : " (Environment-Token)"}` });
  } catch (e) {
    checks.push({
      key: "bot",
      label: "Bot erreichbar",
      ok: false,
      detail: e instanceof Error ? e.message.slice(0, 200) : "Bot-API antwortet nicht – Token prüfen.",
    });
  }

  const { data: settings } = await db
    .from("bot_settings")
    .select("community_chat_id, shop_chat_id, control_chat_id, app_base_url")
    .eq("id", true)
    .maybeSingle();
  const { resolveTelegramWebhookUrl } = await import("@/lib/base-url");
  const expectedUrl = resolveTelegramWebhookUrl(settings);

  if (botOk) {
    try {
      await configureFanBotCommands();
      let info = await tgApi("getWebhookInfo", {});
      let url = String(info.result?.url ?? "");
      let pending = Number(info.result?.pending_update_count ?? 0);
      let lastError = String(info.result?.last_error_message ?? "");
      let match = Boolean(url) && (!expectedUrl || url === expectedUrl);

      if (expectedUrl && (!match || lastError)) {
        await tgApi("setWebhook", {
          url: expectedUrl,
          secret_token: await currentWebhookSecret(),
          allowed_updates: ["message", "edited_message", "callback_query", "pre_checkout_query", "my_chat_member", "channel_post"],
        });
        info = await tgApi("getWebhookInfo", {});
        url = String(info.result?.url ?? "");
        pending = Number(info.result?.pending_update_count ?? 0);
        lastError = String(info.result?.last_error_message ?? "");
        match = Boolean(url) && url === expectedUrl;
      }

      checks.push({
        key: "webhook",
        label: "Webhook aktiv",
        ok: match && !lastError,
        detail: !url
          ? "Kein Webhook gesetzt – Token erneut speichern."
          : !match
            ? `Webhook zeigt auf ${url}, erwartet ${expectedUrl}`
            : lastError
              ? `Telegram meldet: ${lastError}`
              : `${url} · ${pending} offene Updates`,
      });
      const secretOk = Boolean(await currentWebhookSecret());
      checks.push({
        key: "secret",
        label: "Webhook-Signatur",
        ok: secretOk,
        detail: secretOk ? "Geheimnis aus aktuellem Token abgeleitet" : "Kein Schlüssel vorhanden",
      });
    } catch (e) {
      checks.push({
        key: "webhook",
        label: "Webhook aktiv",
        ok: false,
        detail: e instanceof Error ? e.message.slice(0, 200) : "Webhook-Status nicht abrufbar",
      });
    }
  }

  const chats: { target: SetupTarget; label: string; chatId: string; ok: boolean; detail: string }[] = [];
  for (const t of TARGETS) {
    const chatId = String(settings?.[t.column] ?? "").trim();
    if (!chatId) {
      chats.push({ target: t.key, label: t.label, chatId: "", ok: false, detail: "Nicht zugeordnet – Setup-Link nutzen." });
      continue;
    }
    if (!botOk) {
      chats.push({ target: t.key, label: t.label, chatId, ok: false, detail: "Bot nicht erreichbar" });
      continue;
    }
    const perms = await canPost(chatId);
    chats.push({ target: t.key, label: t.label, chatId, ok: perms.ok, detail: perms.detail });
  }

  const ok = checks.every((c) => c.ok) && chats.every((c) => c.ok);
  await db.from("admin_audit").insert({
    action: "setup_verify",
    status: ok ? "ok" : "warn",
    detail: ok ? "Alle Prüfungen bestanden" : "Prüfung mit Hinweisen",
    meta: { checks, chats },
  });

  return { ok, botUsername: botName, expectedUrl, checks, chats };
}

/** Kompletter Livegang-Bericht (Telegram, Chats, Betrieb, Katalog) ohne Audit-Eintrag. */
export async function buildGoLiveReport(db: any) {
  const { readHealth } = await import("@/lib/health.server");
  const [setup, health, products, folders, files, settingsRes, paid] = await Promise.all([
    verifySetup(db),
    readHealth(db),
    db.from("products").select("id", { count: "exact", head: true }).eq("active", true),
    db.from("media_folders").select("id", { count: "exact", head: true }).eq("active", true),
    db.from("media_files").select("id", { count: "exact", head: true }),
    db.from("bot_settings").select("vip_price_stars, app_base_url, welcome_message").eq("id", true).maybeSingle(),
    db.from("purchases").select("id", { count: "exact", head: true }).eq("status", "paid"),
  ]);

  const settings = settingsRes.data ?? {};
  const catalog = [
    {
      key: "products",
      label: "Aktive Produkte",
      ok: (products.count ?? 0) > 0,
      detail: (products.count ?? 0) > 0 ? `${products.count} aktive Produkte` : "Noch kein aktives Produkt angelegt.",
    },
    {
      key: "media",
      label: "Medien-Ordner",
      ok: (folders.count ?? 0) > 0 && (files.count ?? 0) > 0,
      detail: `${folders.count ?? 0} aktive Ordner · ${files.count ?? 0} Dateien`,
    },
    {
      key: "vip",
      label: "VIP-Preis",
      ok: Number(settings.vip_price_stars ?? 0) > 0,
      detail: `${Number(settings.vip_price_stars ?? 0)} Stars`,
    },
    {
      key: "welcome",
      label: "Willkommensnachricht",
      ok: Boolean(String(settings.welcome_message ?? "").trim()),
      detail: String(settings.welcome_message ?? "").trim() ? "gesetzt" : "fehlt – Fans bekommen keinen Einstieg.",
    },
    {
      key: "sales",
      label: "Testkauf",
      ok: (paid.count ?? 0) > 0,
      detail: (paid.count ?? 0) > 0 ? `${paid.count} bezahlte Käufe` : "Noch kein bezahlter Kauf – 1-Stars-Test empfohlen.",
    },
  ];

  const groups = [
    { key: "telegram", label: "Telegram", checks: (setup as any).checks ?? [] },
    {
      key: "chats",
      label: "Chats",
      checks: ((setup as any).chats ?? []).map((c: any) => ({ key: c.target, label: c.label, ok: c.ok, detail: c.detail })),
    },
    { key: "betrieb", label: "Betrieb", checks: health.checks },
    { key: "katalog", label: "Katalog & Umsatz", checks: catalog },
  ];

  const all = groups.flatMap((g) => g.checks as { ok: boolean; label: string; detail: string }[]);
  const failed = all.filter((c) => !c.ok);
  const passed = all.length - failed.length;
  return {
    groups,
    passed,
    total: all.length,
    ok: failed.length === 0,
    failed,
    expectedUrl: (setup as any).expectedUrl ?? "",
    checkedAt: new Date().toISOString(),
  };
}

/** Setzt den Webhook auf die hinterlegte Basis-Adresse (Selbstheilung im Tagesjob). */
export async function repairWebhook(db: any) {
  const { data: settings } = await db.from("bot_settings").select("app_base_url").eq("id", true).maybeSingle();
  const { resolveTelegramWebhookUrl } = await import("@/lib/base-url");
  const url = resolveTelegramWebhookUrl(settings);
  if (!url) return { ok: false, detail: "Keine Webhook-Adresse konfigurierbar." };
  const { tgApi, currentWebhookSecret } = await import("@/lib/telegram.server");
  try {
    const info = await tgApi("getWebhookInfo", {});
    if (String(info.result?.url ?? "") === url && !String(info.result?.last_error_message ?? "")) {
      return { ok: true, detail: "Webhook bereits korrekt.", changed: false, url };
    }
    await tgApi("setWebhook", {
      url,
      secret_token: await currentWebhookSecret(),
      allowed_updates: ["message", "edited_message", "callback_query", "pre_checkout_query", "my_chat_member", "channel_post"],
    });
    await configureFanBotCommands();
    await db.from("admin_audit").insert({
      action: "webhook_repaired",
      status: "ok",
      detail: url,
      meta: {},
    });
    return { ok: true, detail: `Webhook neu gesetzt: ${url}`, changed: true, url };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message.slice(0, 200) : "Webhook nicht setzbar", url };
  }
}
