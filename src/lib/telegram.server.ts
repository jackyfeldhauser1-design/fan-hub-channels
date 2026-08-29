/**
 * Zentraler Telegram-Zugriff.
 * Nutzt den vom Betreiber hinterlegten Bot-Token (Tabelle `bot_credentials`),
 * sonst als Rückfallebene die vorhandene Telegram-Connector-Verbindung.
 * Der Token verlässt niemals den Server.
 */
import { createHash } from "crypto";

const GATEWAY = "https://connector-gateway.lovable.dev/telegram";

let cache: { token: string; username: string; previous: string; previousUntil: number; at: number } | null = null;

/** Liest den gespeicherten Bot-Token (60 Sekunden gecached). */
export async function getBotToken(): Promise<{ token: string; username: string }> {
  if (cache && Date.now() - cache.at < 60_000) return { token: cache.token, username: cache.username };
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any)
      .from("bot_credentials")
      .select("bot_token, bot_username, previous_token, previous_valid_until")
      .eq("id", true)
      .maybeSingle();
    cache = {
      token: data?.bot_token ?? "",
      username: data?.bot_username ?? "",
      previous: data?.previous_token ?? "",
      previousUntil: data?.previous_valid_until ? new Date(data.previous_valid_until).getTime() : 0,
      at: Date.now(),
    };
  } catch {
    cache = { token: "", username: "", previous: "", previousUntil: 0, at: Date.now() };
  }
  return { token: cache.token, username: cache.username };
}

/** Cache verwerfen, z. B. direkt nach dem Speichern eines neuen Tokens. */
export function clearBotTokenCache() {
  cache = null;
}

/** Geheimnis für die Webhook-Signatur, abgeleitet aus dem verwendeten Schlüssel. */
export function deriveWebhookSecret(key: string) {
  return createHash("sha256").update(`telegram-webhook:${key}`).digest("base64url");
}

/** Alle gültigen Webhook-Geheimnisse (eigener Token + Connector-Fallback). */
export async function validWebhookSecrets(): Promise<string[]> {
  const out: string[] = [];
  const { token } = await getBotToken();
  if (token) out.push(deriveWebhookSecret(token));
  // Übergangsfrist nach einem Token-Wechsel: alter Schlüssel bleibt kurz gültig.
  if (cache?.previous && cache.previousUntil > Date.now()) out.push(deriveWebhookSecret(cache.previous));
  const apiKey = process.env["TELEGRAM_API_KEY"];
  if (apiKey) out.push(deriveWebhookSecret(apiKey));
  return out;
}

/** Der Schlüssel, mit dem der Webhook aktuell registriert werden soll. */
export async function currentWebhookSecret(): Promise<string> {
  const { token } = await getBotToken();
  return deriveWebhookSecret(token || `${process.env["TELEGRAM_API_KEY"]}`);
}

type TgResponse = { ok: boolean; result?: any; description?: string };

/** Führt einen Telegram-Bot-API-Aufruf aus (eigener Token bevorzugt). */
export async function tgApi(method: string, body: Record<string, unknown> = {}): Promise<TgResponse> {
  const { token } = await getBotToken();
  const url = token ? `https://api.telegram.org/bot${token}/${method}` : `${GATEWAY}/${method}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!token) {
    headers["Authorization"] = `Bearer ${process.env["LOVABLE_API_KEY"]}`;
    headers["X-Connection-Api-Key"] = `${process.env["TELEGRAM_API_KEY"]}`;
  }
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`Telegram ${method} [${res.status}]: ${text.slice(0, 300)}`);
  const json = JSON.parse(text) as TgResponse;
  if (!json.ok) throw new Error(`Telegram ${method}: ${json.description ?? "unbekannter Fehler"}`);
  return json;
}

/** Wie `tgApi`, gibt aber bei Fehlern `null` zurück (für den Webhook-Pfad). */
export async function tgSafe(method: string, body: Record<string, unknown> = {}) {
  try {
    const json = await tgApi(method, body);
    return (json.result ?? null) as any;
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    return null;
  }
}

/** Prüft einen frisch eingegebenen Token direkt gegen die Bot-API. */
export async function verifyToken(token: string) {
  const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  const text = await res.text();
  if (!res.ok) throw new Error(`Token ungültig [${res.status}]`);
  const json = JSON.parse(text) as TgResponse;
  if (!json.ok) throw new Error(json.description ?? "Token ungültig");
  return { username: String(json.result?.username ?? ""), firstName: String(json.result?.first_name ?? "") };
}
