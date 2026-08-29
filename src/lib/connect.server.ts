/**
 * Hilfsfunktionen für den Ein-Klick-Verbindungs-Assistenten.
 * Enthält keine Server-Funktionen, damit die Wrapper-Datei schlank bleibt.
 */

const GATEWAY = "https://connector-gateway.lovable.dev/telegram";

export async function tgCall(method: string, body: Record<string, unknown>) {
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
  if (!res.ok) throw new Error(`Telegram ${method} [${res.status}]: ${text.slice(0, 300)}`);
  return JSON.parse(text) as { ok: boolean; result?: any; description?: string };
}

export type PlatformState = {
  id: "telegram" | "slack" | "webhook";
  name: string;
  connected: boolean;
  detail: string;
  items: { label: string; ok: boolean; detail: string }[];
};

/** Liest den Verbindungszustand aller unterstützten Plattformen. */
export async function readPlatformOverview(db: any): Promise<PlatformState[]> {
  const { data: settings } = await db
    .from("bot_settings")
    .select("app_base_url, free_chat_id, vip_chat_id, admin_chat_id, announce_chat_id, preview_chat_id")
    .eq("id", true)
    .maybeSingle();

  // Telegram
  const items: PlatformState["items"] = [];
  let botOk = false;
  let botName = "";
  try {
    const me = await tgCall("getMe", {});
    botName = me.result?.username ?? "";
    botOk = true;
    items.push({ label: "Bot-Token", ok: true, detail: botName ? `@${botName}` : "Bot erreichbar" });
  } catch (e) {
    items.push({ label: "Bot-Token", ok: false, detail: e instanceof Error ? e.message.slice(0, 160) : "Fehler" });
  }
  let hookUrl = "";
  if (botOk) {
    try {
      const info = await tgCall("getWebhookInfo", {});
      hookUrl = info.result?.url ?? "";
      items.push({ label: "Webhook", ok: Boolean(hookUrl), detail: hookUrl || "nicht aktiv" });
    } catch (e) {
      items.push({ label: "Webhook", ok: false, detail: e instanceof Error ? e.message.slice(0, 160) : "Fehler" });
    }
  }
  const chatKeys = ["free_chat_id", "vip_chat_id", "admin_chat_id", "announce_chat_id", "preview_chat_id"];
  const chatCount = chatKeys.filter((k) => settings?.[k]).length;
  items.push({
    label: "Chat-Zuordnung",
    ok: chatCount >= 3,
    detail: `${chatCount}/5 Ziele gesetzt (Gratis, VIP, Admin, Ankündigungen, Trailer)`,
  });

  const telegram: PlatformState = {
    id: "telegram",
    name: "Telegram",
    connected: botOk && Boolean(hookUrl) && chatCount >= 3,
    detail: botName ? `@${botName}` : "nicht verbunden",
    items,
  };

  // Slack (Incoming Webhooks als Empfänger)
  const { data: slackRows } = await db
    .from("notification_recipients")
    .select("id, label, chat_id, active")
    .eq("channel", "slack");
  const slack: PlatformState = {
    id: "slack",
    name: "Slack",
    connected: (slackRows ?? []).some((r: any) => r.active),
    detail: `${(slackRows ?? []).length} Kanal/Kanäle hinterlegt`,
    items: (slackRows ?? []).map((r: any) => ({
      label: r.label,
      ok: Boolean(r.active),
      detail: String(r.chat_id ?? "").slice(0, 60) + "…",
    })),
  };

  // Ausgehende Webhooks
  const { data: hooks } = await db.from("notification_webhooks").select("id, url, active");
  const webhook: PlatformState = {
    id: "webhook",
    name: "Externe Systeme (Webhook)",
    connected: (hooks ?? []).some((h: any) => h.active),
    detail: `${(hooks ?? []).length} Ziel(e)`,
    items: (hooks ?? []).map((h: any) => ({ label: h.url, ok: Boolean(h.active), detail: h.active ? "aktiv" : "inaktiv" })),
  };

  return [telegram, slack, webhook];
}

/** Testet eine Slack-Incoming-Webhook-URL und legt sie als Empfänger an. */
export async function connectSlackWebhook(db: any, url: string, label: string, sendTest: boolean) {
  if (sendTest) {
    const { sendSlack } = await import("@/lib/notify.server");
    await sendSlack(url, "✅ Verbindung erfolgreich: Dieser Kanal empfängt jetzt Benachrichtigungen.");
  }
  const { data: existing } = await db
    .from("notification_recipients")
    .select("id")
    .eq("channel", "slack")
    .eq("chat_id", url)
    .maybeSingle();
  if (existing?.id) {
    await db.from("notification_recipients").update({ label, active: true }).eq("id", existing.id);
    return { id: existing.id as string, created: false };
  }
  const { data: created, error } = await db
    .from("notification_recipients")
    .insert({ label, channel: "slack", chat_id: url, email: "", active: true, is_default: false })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: created.id as string, created: true };
}
