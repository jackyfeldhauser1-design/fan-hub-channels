import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ticketSchema = z.object({ ticket: z.string().trim().min(20).max(300) });

/** Kontoübersicht für einen Fan – nur mit gültigem, signiertem Ticket aus dem Bot. */
export const getAccountOverview = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ticketSchema.parse(d ?? {}))
  .handler(async ({ data }) => {
    const { readAccountTicket, loadAccount } = await import("@/lib/account.server");
    const fanId = await readAccountTicket(data.ticket);
    if (!fanId) return { status: "invalid" as const, account: null };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const account = await loadAccount(supabaseAdmin as any, fanId);
    if (!account) return { status: "invalid" as const, account: null };
    return { status: "ok" as const, account };
  });

/** Abgelaufenen Zugang erneut anfordern. */
export const reissueAccountAccess = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ticketSchema.extend({ accessId: z.string().uuid() }).parse(d ?? {}))
  .handler(async ({ data }) => {
    const { readAccountTicket, reissueAccess } = await import("@/lib/account.server");
    const fanId = await readAccountTicket(data.ticket);
    if (!fanId) throw new Error("Dein Konto-Link ist abgelaufen. Öffne im Bot erneut „Mein Konto“.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { rateLimit } = await import("@/lib/security.server");
    const gate = await rateLimit(db, "account_reissue", fanId, 10, 3_600_000);
    if (!gate.allowed) throw new Error("Zu viele Anfragen. Bitte versuche es später erneut.");
    return reissueAccess(db, fanId, data.accessId);
  });
