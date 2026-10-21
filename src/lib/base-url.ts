export function resolvePublicBaseUrl(settings?: { app_base_url?: string | null } | null) {
  const envUrl = String(process.env["PUBLIC_APP_URL"] ?? "").trim();
  const configured = String(settings?.app_base_url ?? "").trim();
  const productionFallback = process.env["NODE_ENV"] === "production" ? "https://itsfelize.store" : "";
  const base = envUrl || configured || productionFallback;
  return base.replace(/\/$/, "");
}


/**
 * Kanonisches Telegram-Webhook-Ziel.
 * Produktion nutzt ausschließlich die Vercel-App-Route.
 */
export function resolveTelegramWebhookUrl(settings?: { app_base_url?: string | null } | null) {
  const base = resolvePublicBaseUrl(settings);
  return base ? `${base}/api/public/telegram/webhook` : "";
}
