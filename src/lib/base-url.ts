export function resolvePublicBaseUrl(settings?: { app_base_url?: string | null } | null) {
  const envUrl = String(process.env["PUBLIC_APP_URL"] ?? "").trim();
  const configured = String(settings?.app_base_url ?? "").trim();
  const base = envUrl || configured;
  return base.replace(/\/$/, "");
}


/**
 * Kanonisches Telegram-Webhook-Ziel.
 * Produktion nutzt ausschließlich die Vercel-App-Route.
 */
export function resolveTelegramWebhookUrl(settings?: { app_base_url?: string | null } | null) {
  const base = resolvePublicBaseUrl(settings) || "https://fan-hub-vercel2.vercel.app";
  return base ? `${base}/api/public/telegram/webhook` : "";
}
