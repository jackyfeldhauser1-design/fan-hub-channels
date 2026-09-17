/**
 * Hilfsfunktionen für den Ein-Klick-Verbindungs-Assistenten.
 * Enthält keine Server-Funktionen, damit die Wrapper-Datei schlank bleibt.
 */


export async function tgCall(method: string, body: Record<string, unknown> = {}) {
  const { tgApi } = await import("@/lib/telegram.server");
  return tgApi(method, body);
}

export type PlatformState = {
  id: "telegram" | "slack" | "webhook";
  name: string;
  connected: boolean;
  detail: string;
  items: { label: string; ok: boolean; detail: string }[];
};

/** Liest den Verbindungszustand aller unterstützten Plattformen. */
export async function readPlatformOverview(db: any, telegramStatus?: any): Promise<PlatformState[]> {
  const { data: settings } = await db.from("bot_settings").select("app_base_url, community_chat_id, shop_chat_id, control_chat_id").eq("id", true).maybeSingle();
  const checks = telegramStatus?.checks ?? [];
  const botCheck = checks.find((x: any) => x.key === "bot");
  const hookCheck = checks.find((x: any) => x.key === "webhook");
  const chatCount = ["community_chat_id", "shop_chat_id", "control_chat_id"].filter((k) => settings?.[k]).length;
  const botName = telegramStatus?.botUsername ?? "";
  const items: PlatformState["items"] = [
    { label: "Bot-Token", ok: Boolean(botCheck?.ok), detail: botCheck?.detail ?? (botName ? `@${botName}` : "nicht verbunden") },
    { label: "Webhook", ok: Boolean(hookCheck?.ok), detail: hookCheck?.detail ?? "nicht aktiv" },
    { label: "Chat-Zuordnung", ok: chatCount >= 3, detail: `${chatCount}/3 Ziele gesetzt (Community, Shop, Kontrollraum)` },
  ];
  const telegram: PlatformState = { id: "telegram", name: "Telegram", connected: Boolean(botCheck?.ok) && Boolean(hookCheck?.ok) && chatCount === 3, detail: botName ? `@${botName}` : "nicht verbunden", items };
  const { data: slackRows } = await db.from("notification_recipients").select("id, label, chat_id, active").eq("channel", "slack");
  const slack: PlatformState = { id: "slack", name: "Slack", connected: (slackRows ?? []).some((r:any)=>r.active), detail: `${(slackRows ?? []).length} Kanal/Kanäle hinterlegt`, items: (slackRows ?? []).map((r:any)=>({label:r.label,ok:Boolean(r.active),detail:String(r.chat_id ?? "").slice(0,60)+"…"})) };
  const { data: hooks } = await db.from("notification_webhooks").select("id, url, active");
  const webhook: PlatformState = { id: "webhook", name: "Externe Systeme (Webhook)", connected: (hooks ?? []).some((h:any)=>h.active), detail: `${(hooks ?? []).length} Ziel(e)`, items: (hooks ?? []).map((h:any)=>({label:h.url,ok:Boolean(h.active),detail:h.active?"aktiv":"inaktiv"})) };
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
