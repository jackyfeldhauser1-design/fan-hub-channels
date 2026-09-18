export function resolvePublicBaseUrl(settings?: { app_base_url?: string | null } | null) {
  const envUrl = String(process.env["PUBLIC_APP_URL"] ?? "").trim();
  const configured = String(settings?.app_base_url ?? "").trim();
  const base = envUrl || configured;
  return base.replace(/\/$/, "");
}
