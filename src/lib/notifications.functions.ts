import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type TeamRole = "admin" | "operator" | "viewer";
const RANK: Record<TeamRole, number> = { viewer: 1, operator: 2, admin: 3 };

async function requireRole(context: any, min: TeamRole) {
  const { data } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  const roles = (data ?? []).map((r: any) => r.role).filter((r: string) => r in RANK) as TeamRole[];
  const role = roles.sort((a, b) => RANK[b] - RANK[a])[0] ?? null;
  if (!role || RANK[role] < RANK[min]) throw new Error("Forbidden");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { db: supabaseAdmin as any, role };
}

const channel = z.enum(["telegram", "email", "slack"]);
const kindEnum = z.enum(["expiring", "expired", "unpaid", "blocked", "reactivated"]);

export const listNotificationCenter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db, role } = await requireRole(context, "viewer");
    const { NOTIFY_KINDS, NOTIFY_VARIABLES } = await import("@/lib/notify.server");

    const [{ data: recipients }, { data: prefs }, { data: deliveries }] = await Promise.all([
      db.from("notification_recipients").select("*").order("created_at", { ascending: true }),
      db.from("notification_prefs").select("*"),
      db
        .from("notification_deliveries")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300),
    ]);

    const list = deliveries ?? [];
    return {
      role,
      kinds: NOTIFY_KINDS,
      variables: NOTIFY_VARIABLES,
      recipients: (recipients ?? []).map((r: any) => ({
        id: r.id,
        label: r.label,
        channel: r.channel,
        chatId: r.chat_id,
        email: r.email,
        fallbackChannel: r.fallback_channel,
        fallbackTarget: r.fallback_target,
        active: r.active,
        isDefault: r.is_default,
      })),
      prefs: (prefs ?? []).map((p: any) => ({ recipientId: p.recipient_id, kind: p.kind, enabled: p.enabled })),
      deliveries: list.map((d: any) => ({
        id: d.id,
        recipient: d.recipient_label,
        kind: d.kind,
        channel: d.channel,
        target: d.target,
        status: d.status,
        attempt: d.attempt,
        error: d.error,
        usedFallback: d.used_fallback,
        nextRetryAt: d.next_retry_at,
        createdAt: d.created_at,
      })),
      stats: {
        total: list.length,
        sent: list.filter((d: any) => d.status === "sent").length,
        retrying: list.filter((d: any) => d.status === "retrying").length,
        dead: list.filter((d: any) => d.status === "dead").length,
        skipped: list.filter((d: any) => d.status === "skipped_optout").length,
        fallback: list.filter((d: any) => d.used_fallback).length,
      },
    };
  });

export const saveRecipient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        label: z.string().min(1).max(80),
        channel,
        chatId: z.string().max(60).default(""),
        email: z.string().max(160).default(""),
        fallbackChannel: channel.nullable().default(null),
        fallbackTarget: z.string().max(160).default(""),
        active: z.boolean().default(true),
        isDefault: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { db } = await requireRole(context, "admin");
    const row = {
      label: data.label,
      channel: data.channel,
      chat_id: data.chatId,
      email: data.email,
      fallback_channel: data.fallbackChannel,
      fallback_target: data.fallbackTarget,
      active: data.active,
      is_default: data.isDefault,
    };
    if (data.id) {
      const { error } = await db.from("notification_recipients").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: created, error } = await db.from("notification_recipients").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { id: created.id as string };
  });

export const deleteRecipient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { db } = await requireRole(context, "admin");
    const { error } = await db.from("notification_recipients").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setRecipientPref = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ recipientId: z.string().uuid(), kind: kindEnum, enabled: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { db } = await requireRole(context, "admin");
    const { error } = await db
      .from("notification_prefs")
      .upsert(
        { recipient_id: data.recipientId, kind: data.kind, enabled: data.enabled },
        { onConflict: "recipient_id,kind" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Vorschau der Nachricht für einen Empfänger inkl. Variablenzuordnung. */
export const previewNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ recipientId: z.string().uuid().nullable().default(null), kind: kindEnum, tokenId: z.string().uuid().nullable().default(null) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { db } = await requireRole(context, "viewer");
    const { buildVars, renderTemplate, NOTIFY_VARIABLES } = await import("@/lib/notify.server");

    let tokenId = data.tokenId;
    if (!tokenId) {
      const { data: latest } = await db
        .from("access_tokens")
        .select("id")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      tokenId = latest?.id ?? null;
    }

    const vars = await buildVars(db, { tokenId, tgUserId: null, detail: "Beispiel-Ereignis" });
    let recipient: { label: string; channel: string; target: string; optedOut: boolean } | null = null;
    if (data.recipientId) {
      const { data: r } = await db.from("notification_recipients").select("*").eq("id", data.recipientId).maybeSingle();
      if (r) {
        const { data: pref } = await db
          .from("notification_prefs")
          .select("enabled")
          .eq("recipient_id", r.id)
          .eq("kind", data.kind)
          .maybeSingle();
        recipient = {
          label: r.label,
          channel: r.channel,
          target: r.channel === "email" ? r.email : r.chat_id,
          optedOut: pref?.enabled === false,
        };
      }
    }

    return {
      recipient,
      tokenId,
      body: renderTemplate(data.kind, vars, "admin") ?? "",
      fanBody: renderTemplate(data.kind, vars, "user"),
      variables: NOTIFY_VARIABLES.map((v) => ({ ...v, value: vars[v.key] || "—" })),
    };
  });

export const sendTestNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ recipientId: z.string().uuid(), kind: kindEnum }).parse(input))
  .handler(async ({ data, context }) => {
    const { db } = await requireRole(context, "admin");
    const { buildVars, renderTemplate, deliverOnce } = await import("@/lib/notify.server");
    const { data: r } = await db.from("notification_recipients").select("*").eq("id", data.recipientId).maybeSingle();
    if (!r) throw new Error("Empfänger nicht gefunden");

    const vars = await buildVars(db, { tokenId: null, tgUserId: null, detail: "Testnachricht aus dem Dashboard" });
    const body = `🔔 <b>Test</b>\n${renderTemplate(data.kind, vars, "admin") ?? ""}`;
    const target = r.channel === "email" ? r.email : r.chat_id;
    const { data: row } = await db
      .from("notification_deliveries")
      .insert({
        recipient_id: r.id,
        recipient_label: r.label,
        kind: data.kind,
        channel: r.channel,
        target,
        body,
        status: "queued",
      })
      .select("id")
      .single();

    const res = await deliverOnce(db, {
      id: row.id,
      channel: r.channel,
      target,
      body,
      attempt: 0,
      recipient_id: r.id,
    });
    return res.ok ? { ok: true } : { ok: false, error: res.error ?? "Versand fehlgeschlagen" };
  });

/** Manuelle Wiederholung einer fehlgeschlagenen Zustellung. */
export const retryDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { db } = await requireRole(context, "operator");
    const { deliverOnce } = await import("@/lib/notify.server");
    const { data: d } = await db
      .from("notification_deliveries")
      .select("id, channel, target, body, attempt, recipient_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!d) throw new Error("Eintrag nicht gefunden");
    const res = await deliverOnce(db, { ...d, attempt: 0 });
    return res.ok ? { ok: true } : { ok: false, error: res.error ?? "Versand fehlgeschlagen" };
  });

export const exportDeliveriesCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db } = await requireRole(context, "viewer");
    const { data: rows } = await db
      .from("notification_deliveries")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5000);
    const table: (string | number)[][] = [
      ["Zeitpunkt", "Empfänger", "Kanal", "Ziel", "Alarm", "Status", "Versuche", "Ersatzkanal", "Fehler"],
    ];
    for (const r of rows ?? [])
      table.push([
        new Date(r.created_at).toISOString(),
        r.recipient_label,
        r.channel,
        r.target,
        r.kind,
        r.status,
        r.attempt,
        r.used_fallback ? "ja" : "nein",
        r.error ?? "",
      ]);
    const content = table
      .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    return { filename: `benachrichtigungen-${new Date().toISOString().slice(0, 10)}.csv`, content };
  });

/** Empfänger-Zuordnung für einen Zugangslink lesen und speichern. */
export const getTokenRecipients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ tokenId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { db } = await requireRole(context, "viewer");
    const [{ data: all }, { data: linked }] = await Promise.all([
      db.from("notification_recipients").select("id, label, channel, active, is_default").order("created_at"),
      db.from("access_token_recipients").select("recipient_id").eq("token_id", data.tokenId),
    ]);
    return {
      recipients: (all ?? []).map((r: any) => ({
        id: r.id,
        label: r.label,
        channel: r.channel,
        active: r.active,
        isDefault: r.is_default,
      })),
      selected: (linked ?? []).map((r: any) => r.recipient_id as string),
    };
  });

export const setTokenRecipients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ tokenId: z.string().uuid(), recipientIds: z.array(z.string().uuid()).max(50) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { db } = await requireRole(context, "operator");
    await db.from("access_token_recipients").delete().eq("token_id", data.tokenId);
    if (data.recipientIds.length) {
      const { error } = await db
        .from("access_token_recipients")
        .insert(data.recipientIds.map((id) => ({ token_id: data.tokenId, recipient_id: id })));
      if (error) throw new Error(error.message);
    }
    return { ok: true, count: data.recipientIds.length };
  });
