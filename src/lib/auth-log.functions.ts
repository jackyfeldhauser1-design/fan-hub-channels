import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";

/** E-Mail nur maskiert speichern (Datenschutz im Protokoll). */
function maskEmail(email: string) {
  const [name = "", domain = ""] = email.split("@");
  const head = name.slice(0, 2);
  return `${head}${name.length > 2 ? "***" : ""}@${domain}`;
}

async function hashIp(ip: string) {
  const bytes = new TextEncoder().encode(`login:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

/**
 * Öffentlicher Endpunkt: protokolliert Login-Versuche im Lieferprotokoll.
 * Schreibt nur ein Ereignis mit maskierter E-Mail – keine Passwörter, keine Tokens.
 */
export const logLoginAttempt = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        email: z.string().max(160).optional().default(""),
        success: z.boolean(),
        method: z.enum(["password", "google", "2fa"]).default("password"),
        reason: z.string().max(200).optional().default(""),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const forwarded = getRequestHeader("x-forwarded-for") ?? "";
    const ip = forwarded.split(",")[0]?.trim() || "unknown";
    const parts = [
      `Methode: ${data.method}`,
      data.email ? `Konto: ${maskEmail(data.email)}` : "Konto: —",
      `IP-Hash: ${await hashIp(ip)}`,
    ];
    if (!data.success && data.reason) parts.push(`Grund: ${data.reason.slice(0, 200)}`);

    await (supabaseAdmin as any).from("order_events").insert({
      kind: data.success ? "login_success" : "login_failed",
      detail: parts.join(" · "),
    });
    return { ok: true };
  });
