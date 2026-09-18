import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Autorisiert Cron-Aufrufe: zuerst das Plattform-Geheimnis (CRON_SECRET; Legacy-Fallback wird weiter akzeptiert),
 * alternativ ein in der Datenbank hinterlegtes Hash-Token (pg_cron-Jobs).
 */
export async function authorizeCronRequest(request: Request): Promise<Response | null> {
  const platformResult = await authenticateCronRequest(request);
  if (!platformResult) return null;

  const match = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "");
  const token = match?.[1];
  if (!token) return platformResult;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("cron_token_valid", { p_token: token });
  if (!error && data === true) return null;

  return platformResult;
}
