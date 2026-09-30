export function resolvePublicBaseUrl(settings?: { app_base_url?: string | null } | null) {
  const envUrl = String(process.env["PUBLIC_APP_URL"] ?? "").trim();
  const configured = String(settings?.app_base_url ?? "").trim();
  const base = envUrl || configured;
  return base.replace(/\/$/, "");
}


/**
 * Kanonisches Telegram-Webhook-Ziel.
 * In Produktion zeigt Telegram direkt auf die Supabase Edge Function.
 * Die App-Route bleibt nur als lokaler/Legacy-Fallback erhalten.
 */
export function resolveTelegramWebhookUrl(settings?: { app_base_url?: string | null } | null) {
  const supabaseUrl = String(
    process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "",
  ).trim().replace(/\/$/, "");

  if (supabaseUrl) return `${supabaseUrl}/functions/v1/telegram-webhook`;

  const base = resolvePublicBaseUrl(settings);
  return base ? `${base}/api/public/telegram/webhook` : "";
}
