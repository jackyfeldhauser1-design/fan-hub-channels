export function resolvePublicBaseUrl(settings?: { app_base_url?: string | null } | null) {
  const envUrl = String(process.env["PUBLIC_APP_URL"] ?? "").trim();
  const configured = String(settings?.app_base_url ?? "").trim();
  const base = envUrl || configured;
  return base.replace(/\/$/, "");
}


/**
 * Kanonisches Telegram-Webhook-Ziel.
 * Telegram zeigt in Produktion auf die stabile Vercel-App-Route.
 * Supabase bleibt Datenbank/Storage/Edge-Runtime, ist aber nicht das Webhook-Ziel.
 */
export function resolveTelegramWebhookUrl(settings?: { app_base_url?: string | null } | null) {
  const base = resolvePublicBaseUrl(settings);
  return base ? `${base}/api/public/telegram/webhook` : "";
}
