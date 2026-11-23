/** Public URL must be explicitly configured; never silently point visitors to a retired domain. */
export function resolvePublicBaseUrl(settings?: { app_base_url?: string | null } | null) {
  const envUrl = String(process.env["PUBLIC_APP_URL"] ?? "").trim();
  const configured = String(settings?.app_base_url ?? "").trim();
  const base = envUrl || configured;
  if (!base) return "";
  return validateBaseUrl(base);
}

function validateBaseUrl(base: string) {
  try {
    const url = new URL(base);
    if (url.protocol !== "https:" && !(process.env["NODE_ENV"] !== "production" && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) return "";
    if (url.username || url.password || url.search || url.hash) return "";
    return url.origin + (url.pathname === "/" ? "" : url.pathname.replace(/\/$/, ""));
  } catch {
    return "";
  }
}

/** Canonical webhook URL. Never register a webhook against a guessed deployment. */
export function resolveTelegramWebhookUrl(settings?: { app_base_url?: string | null } | null) {
  // Keep the Telegram receiver independent of the public customer-facing domain.
  // When not configured, retain the existing URL until the new endpoint is verified.
  const exactWebhook = String(process.env["TELEGRAM_WEBHOOK_URL"] ?? "").trim();
  if (exactWebhook) {
    const parsed = validateBaseUrl(exactWebhook);
    return parsed && new URL(parsed).pathname.endsWith("/functions/v1/telegram-webhook") ? parsed : "";
  }
  const dedicated = String(process.env["TELEGRAM_WEBHOOK_BASE_URL"] ?? "").trim();
  const base = dedicated ? validateBaseUrl(dedicated) : resolvePublicBaseUrl(settings);
  return base ? `${base}/api/public/telegram/webhook` : "";
}
