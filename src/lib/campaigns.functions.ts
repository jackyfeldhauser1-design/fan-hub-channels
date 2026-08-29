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

const kindEnum = z.enum(["expiring", "expired", "unpaid", "blocked", "reactivated"]);
const audienceEnum = z.enum(["admin", "user"]);
const segmentEnum = z.enum(["all", "expiring", "expired", "unused", "revoked"]);

/** Analytics: Zustellung, Öffnungen, Klicks und daraus resultierende Käufe. */
export const getNotificationAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db, role } = await requireRole(context, "viewer");
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();

    const [{ data: deliveries }, { data: campaigns }, { data: purchases }] = await Promise.all([
      db
        .from("notification_deliveries")
        .select("id, kind, channel, status, campaign_id, tg_user_id, opened_at, clicked_at, open_count, click_count, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1000),
      db.from("notification_campaigns").select("id, name").limit(200),
      db
        .from("purchases")
        .select("id, tg_user_id, amount_stars, created_at, status")
        .eq("status", "paid")
        .gte("created_at", since)
        .limit(1000),
    ]);

    const list = deliveries ?? [];
    const paid = purchases ?? [];
    const WINDOW = 72 * 3_600_000;

    const attributed = (rows: any[]) => {
      let count = 0;
      let stars = 0;
      for (const d of rows) {
        if (!d.clicked_at || !d.tg_user_id) continue;
        const t = new Date(d.clicked_at).getTime();
        const hit = paid.find(
          (p: any) =>
            p.tg_user_id === d.tg_user_id &&
            new Date(p.created_at).getTime() >= t &&
            new Date(p.created_at).getTime() <= t + WINDOW,
        );
        if (hit) {
          count += 1;
          stars += hit.amount_stars ?? 0;
        }
      }
      return { count, stars };
    };

    const summarize = (rows: any[]) => {
      const sent = rows.filter((d) => d.status === "sent").length;
      const opens = rows.filter((d) => d.opened_at).length;
      const clicks = rows.filter((d) => d.clicked_at).length;
      const rev = attributed(rows);
      return {
        total: rows.length,
        sent,
        opens,
        clicks,
        purchases: rev.count,
        stars: rev.stars,
        openRate: sent ? Math.round((opens / sent) * 100) : 0,
        clickRate: sent ? Math.round((clicks / sent) * 100) : 0,
        conversionRate: clicks ? Math.round((rev.count / clicks) * 100) : 0,
      };
    };

    const kinds = ["expiring", "expired", "unpaid", "blocked", "reactivated"];
    const campaignMap = new Map((campaigns ?? []).map((c: any) => [c.id, c.name]));

    return {
      role,
      overall: summarize(list),
      byKind: kinds.map((k) => ({ kind: k, ...summarize(list.filter((d: any) => d.kind === k)) })),
      byChannel: ["telegram", "slack", "email"].map((c) => ({
        channel: c,
        ...summarize(list.filter((d: any) => d.channel === c)),
      })),
      byCampaign: (campaigns ?? []).map((c: any) => ({
        id: c.id,
        name: campaignMap.get(c.id) ?? "—",
        ...summarize(list.filter((d: any) => d.campaign_id === c.id)),
      })),
    };
  });

/** Vorlagen, Kampagnen und Webhooks in einem Rutsch laden. */
export const listCampaignConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db, role } = await requireRole(context, "viewer");
    const { DEFAULT_TEMPLATES, NOTIFY_KINDS, NOTIFY_VARIABLES } = await import("@/lib/notify.server");
    const [{ data: templates }, { data: campaigns }, { data: webhooks }] = await Promise.all([
      db.from("notification_templates").select("*"),
      db.from("notification_campaigns").select("*").order("created_at", { ascending: false }).limit(100),
      db.from("notification_webhooks").select("*").order("created_at", { ascending: true }),
    ]);
    return {
      role,
      kinds: NOTIFY_KINDS,
      variables: NOTIFY_VARIABLES,
      defaults: DEFAULT_TEMPLATES,
      templates: (templates ?? []).map((t: any) => ({
        id: t.id,
        kind: t.kind,
        audience: t.audience,
        body: t.body,
        linkUrl: t.link_url,
        active: t.active,
      })),
      campaigns: (campaigns ?? []).map((c: any) => ({
        id: c.id,
        name: c.name,
        kind: c.kind,
        segment: c.segment,
        audience: c.audience,
        body: c.body,
        linkUrl: c.link_url,
        scheduledAt: c.scheduled_at,
        status: c.status,
        sentCount: c.sent_count,
        lastRunAt: c.last_run_at,
        lastError: c.last_error,
      })),
      webhooks: (webhooks ?? []).map((w: any) => ({
        id: w.id,
        label: w.label,
        url: w.url,
        events: w.events ?? [],
        active: w.active,
        lastStatus: w.last_status,
        lastCalledAt: w.last_called_at,
        hasSecret: Boolean(w.secret),
      })),
    };
  });

export const saveTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        kind: kindEnum,
        audience: audienceEnum,
        body: z.string().max(2000),
        linkUrl: z.string().max(300).default(""),
        active: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { db } = await requireRole(context, "admin");
    const { error } = await db
      .from("notification_templates")
      .upsert(
        {
          kind: data.kind,
          audience: data.audience,
          body: data.body,
          link_url: data.linkUrl,
          active: data.active,
        },
        { onConflict: "kind,audience" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const previewTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ body: z.string().max(2000), tokenId: z.string().uuid().nullable().optional() }).parse(d))
  .handler(async ({ context, data }) => {
    const { db } = await requireRole(context, "operator");
    const { buildVars, fillVars } = await import("@/lib/notify.server");
    const vars = await buildVars(db, { tokenId: data.tokenId ?? null, detail: "Beispieltext" });
    return { text: fillVars(data.body, vars), vars };
  });

export const saveCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().nullable().optional(),
        name: z.string().min(1).max(120),
        kind: kindEnum,
        segment: segmentEnum,
        audience: audienceEnum,
        body: z.string().min(1).max(2000),
        linkUrl: z.string().max(300).default(""),
        scheduledAt: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { db } = await requireRole(context, "admin");
    const row = {
      name: data.name,
      kind: data.kind,
      segment: data.segment,
      audience: data.audience,
      body: data.body,
      link_url: data.linkUrl,
      scheduled_at: data.scheduledAt || null,
      status: data.scheduledAt ? "scheduled" : "draft",
    };
    const res = data.id
      ? await db.from("notification_campaigns").update(row).eq("id", data.id)
      : await db.from("notification_campaigns").insert(row);
    if (res.error) throw new Error(res.error.message);
    return { ok: true };
  });

export const deleteCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { db } = await requireRole(context, "admin");
    await db.from("notification_campaigns").delete().eq("id", data.id);
    return { ok: true };
  });

export const runCampaignNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { db } = await requireRole(context, "admin");
    const { enforceRateLimit, auditLog } = await import("@/lib/security.server");
    await enforceRateLimit(db, "campaign_run", context.userId, 10, 600_000);
    const { runCampaign } = await import("@/lib/notify.server");
    const res = await runCampaign(db, data.id);
    await auditLog(db, {
      actorId: context.userId,
      actorEmail: context.claims?.email ?? null,
      action: "campaign_run",
      target: data.id,
      status: "ok",
      detail: JSON.stringify(res).slice(0, 300),
    });
    return res;
  });


export const saveWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().nullable().optional(),
        label: z.string().min(1).max(120),
        url: z.string().url().max(300),
        secret: z.string().max(200).default(""),
        events: z.array(z.string().max(40)).max(10).default([]),
        active: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { db } = await requireRole(context, "admin");
    const row: Record<string, unknown> = {
      label: data.label,
      url: data.url,
      events: data.events,
      active: data.active,
    };
    if (data.secret) row["secret"] = data.secret;
    const res = data.id
      ? await db.from("notification_webhooks").update(row).eq("id", data.id)
      : await db.from("notification_webhooks").insert({ ...row, secret: data.secret });
    if (res.error) throw new Error(res.error.message);
    return { ok: true };
  });

export const deleteWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { db } = await requireRole(context, "admin");
    await db.from("notification_webhooks").delete().eq("id", data.id);
    return { ok: true };
  });

export const testWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { db } = await requireRole(context, "admin");
    const { enforceRateLimit } = await import("@/lib/security.server");
    await enforceRateLimit(db, "webhook_test", context.userId, 20, 600_000);
    const { dispatchWebhooks } = await import("@/lib/notify.server");

    const { data: hook } = await db.from("notification_webhooks").select("*").eq("id", data.id).maybeSingle();
    if (!hook) throw new Error("Webhook nicht gefunden");
    await dispatchWebhooks(db, "test.ping", { webhookId: hook.id, label: hook.label });
    const { data: after } = await db.from("notification_webhooks").select("last_status").eq("id", data.id).maybeSingle();
    return { status: after?.last_status ?? "" };
  });
