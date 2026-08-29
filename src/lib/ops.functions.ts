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

const GATEWAY = "https://connector-gateway.lovable.dev/telegram";

async function tg(method: string, body: Record<string, unknown>) {
  const res = await fetch(`${GATEWAY}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}`,
      "X-Connection-Api-Key": `${process.env["TELEGRAM_API_KEY"]}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Telegram ${method} [${res.status}]: ${text.slice(0, 300)}`);
  return JSON.parse(text) as { ok: boolean; result?: any; description?: string };
}

/** Erwartete Hintergrundjobs samt Takt (Minuten) für die Statusanzeige. */
const JOBS = [
  { job: "notifications-retry", label: "Wiederholungen", everyMin: 5 },
  { job: "notifications-campaigns", label: "Kampagnen", everyMin: 15 },
] as const;

/** Betriebsstatus: Cron-Läufe, Webhook-Bestätigung und Zustellzahlen. */
export const getOpsStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db, role } = await requireRole(context, "viewer");
    const since = new Date(Date.now() - 24 * 3_600_000).toISOString();

    const [{ data: runs }, { data: settings }, deliveries, campaigns] = await Promise.all([
      db.from("job_runs").select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(500),
      db.from("bot_settings").select("app_base_url, admin_chat_id, free_chat_id, vip_chat_id").eq("id", true).maybeSingle(),
      db.from("notification_deliveries").select("status").gte("created_at", since).limit(2000),
      db.from("notification_campaigns").select("id, status, scheduled_at").limit(200),
    ]);

    const list = runs ?? [];
    const jobs = JOBS.map((j) => {
      const mine = list.filter((r: any) => r.job === j.job);
      const last = mine[0] ?? null;
      const lastAt = last ? new Date(last.created_at).getTime() : 0;
      const fresh = lastAt > Date.now() - j.everyMin * 3 * 60_000;
      return {
        job: j.job,
        label: j.label,
        everyMin: j.everyMin,
        running: fresh,
        runs24h: mine.length,
        processed24h: mine.reduce((a: number, r: any) => a + (r.processed ?? 0), 0),
        sent24h: mine.reduce((a: number, r: any) => a + (r.sent ?? 0), 0),
        failed24h: mine.reduce((a: number, r: any) => a + (r.failed ?? 0), 0),
        lastAt: last?.created_at ?? null,
        lastOk: last?.ok ?? null,
        lastDetail: last?.detail ?? "",
      };
    });

    let webhook: {
      url: string;
      expected: string;
      confirmed: boolean;
      pending: number;
      lastError: string;
      lastErrorAt: string | null;
    } | null = null;
    try {
      const info = await tg("getWebhookInfo", {});
      const url = info.result?.url ?? "";
      const base = String(settings?.app_base_url ?? "").replace(/\/$/, "");
      const expected = base ? `${base}/api/public/telegram/webhook` : "";
      webhook = {
        url,
        expected,
        confirmed: Boolean(url) && (!expected || url === expected),
        pending: info.result?.pending_update_count ?? 0,
        lastError: info.result?.last_error_message ?? "",
        lastErrorAt: info.result?.last_error_date
          ? new Date(info.result.last_error_date * 1000).toISOString()
          : null,
      };
    } catch {
      webhook = null;
    }

    const d = deliveries.data ?? [];
    const count = (s: string) => d.filter((x: any) => x.status === s).length;

    return {
      role,
      jobs,
      webhook,
      settings: {
        appBaseUrl: settings?.app_base_url ?? "",
        adminChatId: settings?.admin_chat_id ?? "",
        freeChatId: settings?.free_chat_id ?? "",
        vipChatId: settings?.vip_chat_id ?? "",
      },
      deliveries24h: {
        total: d.length,
        sent: count("sent"),
        retrying: count("retrying"),
        dead: count("dead"),
        queued: count("queued"),
      },
      campaigns: {
        total: (campaigns.data ?? []).length,
        scheduled: (campaigns.data ?? []).filter((c: any) => c.status === "scheduled").length,
        sent: (campaigns.data ?? []).filter((c: any) => c.status === "sent").length,
      },
    };
  });

/** Prüft die konfigurierten Chat-IDs direkt bei Telegram. */
export const checkChatIds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db } = await requireRole(context, "admin");
    const { data: s } = await db
      .from("bot_settings")
      .select("free_chat_id, vip_chat_id, admin_chat_id")
      .eq("id", true)
      .maybeSingle();

    const targets = [
      { key: "free", label: "Gratis-Gruppe", chatId: s?.free_chat_id ?? "" },
      { key: "vip", label: "VIP-Gruppe", chatId: s?.vip_chat_id ?? "" },
      { key: "admin", label: "Admin-Chat", chatId: s?.admin_chat_id ?? "" },
    ];

    const results = [];
    for (const t of targets) {
      if (!t.chatId) {
        results.push({ ...t, ok: false, title: "", type: "", canPost: false, error: "Chat-ID fehlt" });
        continue;
      }
      try {
        const chat = await tg("getChat", { chat_id: t.chatId });
        let canPost = true;
        try {
          const me = await tg("getMe", {});
          const member = await tg("getChatMember", { chat_id: t.chatId, user_id: me.result?.id });
          const st = member.result?.status;
          canPost = st === "administrator" || st === "creator" || st === "member";
        } catch {
          canPost = false;
        }
        results.push({
          ...t,
          ok: true,
          title: chat.result?.title ?? chat.result?.username ?? "",
          type: chat.result?.type ?? "",
          canPost,
          error: "",
        });
      } catch (e) {
        results.push({
          ...t,
          ok: false,
          title: "",
          type: "",
          canPost: false,
          error: e instanceof Error ? e.message.slice(0, 200) : "Fehler",
        });
      }
    }
    return { results };
  });

/**
 * Simulierter Testkauf: legt Testfan, bezahlten Kauf, Zugangslink und
 * Protokolleinträge an und benachrichtigt den Admin-Chat.
 */
export const runTestPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db } = await requireRole(context, "admin");
    const { data: settings } = await db.from("bot_settings").select("*").eq("id", true).maybeSingle();
    const { createAccessToken, contentUrl, logOrderEvent } = await import("@/lib/fulfillment.server");

    const telegramId = 900_000_000_000 + Math.floor(Math.random() * 1_000_000);
    const { data: fan, error: fanErr } = await db
      .from("tg_users")
      .insert({
        telegram_id: telegramId,
        username: "testkauf",
        first_name: "Testfan",
        referral_code: `test${Math.random().toString(36).slice(2, 8)}`,
      })
      .select("id")
      .single();
    if (fanErr) throw new Error(fanErr.message);

    const { data: product } = await db
      .from("products")
      .select("id, title, price_stars")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();

    const { data: purchase, error: pErr } = await db
      .from("purchases")
      .insert({
        tg_user_id: fan.id,
        product_id: product?.id ?? null,
        title_snapshot: product?.title ? `TEST · ${product.title}` : "TEST · Probekauf",
        currency: "stars",
        amount_stars: product?.price_stars ?? 1,
        status: "paid",
        delivery_status: "delivered",
        delivered_at: new Date().toISOString(),
        delivery_note: "Testdurchlauf aus dem Dashboard",
      })
      .select("id")
      .single();
    if (pErr) throw new Error(pErr.message);

    await logOrderEvent(db, purchase.id, fan.id, "paid", "Testkauf simuliert");
    const { token, ttl, maxViews } = await createAccessToken(db, {
      purchaseId: purchase.id,
      productId: product?.id ?? null,
      tgUserId: fan.id,
      settings,
    });
    await logOrderEvent(db, purchase.id, fan.id, "delivered", "Zugangslink erstellt (Test)");

    let notified = false;
    let notifyError = "";
    try {
      const { notifyAccessIssue } = await import("@/lib/notify.server");
      const { data: tokenRow } = await db.from("access_tokens").select("id").eq("token", token).maybeSingle();
      await notifyAccessIssue(db, "reactivated", {
        tgUserId: fan.id,
        tokenId: tokenRow?.id ?? null,
        detail: "Testdurchlauf: Kauf & Auslieferung erfolgreich",
        notifyUser: false,
      });
      notified = true;
    } catch (e) {
      notifyError = e instanceof Error ? e.message.slice(0, 200) : "Fehler";
    }

    return {
      purchaseId: purchase.id,
      fanId: fan.id,
      product: product?.title ?? "kein Produkt vorhanden",
      url: contentUrl(settings, token),
      ttl,
      maxViews,
      notified,
      notifyError,
    };
  });

/** Entfernt alle Testkäufe und Testfans wieder. */
export const cleanupTestPurchases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db } = await requireRole(context, "admin");
    const { data: fans } = await db.from("tg_users").select("id").eq("username", "testkauf").limit(200);
    const ids = (fans ?? []).map((f: any) => f.id);
    if (!ids.length) return { removed: 0 };
    await db.from("access_tokens").delete().in("tg_user_id", ids);
    await db.from("order_events").delete().in("tg_user_id", ids);
    await db.from("action_log").delete().in("tg_user_id", ids);
    await db.from("notification_deliveries").delete().in("tg_user_id", ids);
    await db.from("purchases").delete().in("tg_user_id", ids);
    await db.from("tg_users").delete().in("id", ids);
    return { removed: ids.length };
  });

const kindEnum = z.enum(["expiring", "expired", "unpaid", "blocked", "reactivated"]);

/** Bulk-Testversand: eine Testnachricht pro Empfänger, direkt im Zustellprotokoll. */
export const sendBulkTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        kind: kindEnum,
        recipientIds: z.array(z.string().uuid()).max(50).default([]),
        channels: z.array(z.enum(["telegram", "email", "slack"])).default([]),
        includeAdminChat: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { db } = await requireRole(context, "admin");
    const { buildVars, renderStoredTemplate, deliverOnce } = await import("@/lib/notify.server");

    const { data: settings } = await db.from("bot_settings").select("admin_chat_id").eq("id", true).maybeSingle();
    const vars = await buildVars(db, { tokenId: null, tgUserId: null, detail: "Bulk-Test aus dem Dashboard" });
    const tpl = await renderStoredTemplate(db, data.kind, vars, "admin");
    const body = `🧪 <b>Testversand</b>\n${tpl.body ?? ""}`;

    let recipients: any[] = [];
    if (data.recipientIds.length) {
      const { data: rows } = await db.from("notification_recipients").select("*").in("id", data.recipientIds);
      recipients = rows ?? [];
    } else {
      const { data: rows } = await db.from("notification_recipients").select("*").eq("active", true);
      recipients = rows ?? [];
    }
    if (data.channels.length) recipients = recipients.filter((r) => data.channels.includes(r.channel));

    const targets = recipients.map((r) => ({
      id: r.id as string | null,
      label: r.label as string,
      channel: r.channel as "telegram" | "email" | "slack",
      target: (r.channel === "email" ? r.email : r.chat_id) as string,
    }));

    if (data.includeAdminChat && settings?.admin_chat_id) {
      targets.unshift({
        id: null,
        label: "Admin-Chat",
        channel: "telegram",
        target: String(settings.admin_chat_id),
      });
    }

    const results: { label: string; channel: string; target: string; ok: boolean; error: string }[] = [];
    for (const t of targets) {
      if (!t.target) {
        results.push({ label: t.label, channel: t.channel, target: "—", ok: false, error: "Kein Ziel hinterlegt" });
        continue;
      }
      const { data: row } = await db
        .from("notification_deliveries")
        .insert({
          recipient_id: t.id,
          recipient_label: `${t.label} (Test)`,
          kind: data.kind,
          channel: t.channel,
          target: t.target,
          body,
          status: "queued",
        })
        .select("id")
        .single();
      if (!row) {
        results.push({ label: t.label, channel: t.channel, target: t.target, ok: false, error: "Protokolleintrag fehlgeschlagen" });
        continue;
      }
      const res = await deliverOnce(db, {
        id: row.id,
        channel: t.channel,
        target: t.target,
        body,
        attempt: 0,
        recipient_id: t.id,
      });
      results.push({
        label: t.label,
        channel: t.channel,
        target: t.target,
        ok: res.ok,
        error: res.ok ? "" : (res.error ?? "Versand fehlgeschlagen"),
      });
    }

    return { total: results.length, sent: results.filter((r) => r.ok).length, results };
  });

/** Ordnet bezahlte Käufe der letzten 90 Tage der jeweils letzten Interaktion zu. */
async function computeAttribution(db: any) {
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const WINDOW = 72 * 3_600_000;

  const [{ data: purchases }, { data: deliveries }, { data: campaigns }] = await Promise.all([
    db
      .from("purchases")
      .select("id, tg_user_id, amount_stars, created_at")
      .eq("status", "paid")
      .gte("created_at", since)
      .limit(2000),
    db
      .from("notification_deliveries")
      .select("id, kind, channel, campaign_id, tg_user_id, recipient_label, opened_at, clicked_at, created_at")
      .gte("created_at", new Date(Date.now() - 93 * 86_400_000).toISOString())
      .limit(5000),
    db.from("notification_campaigns").select("id, name").limit(500),
  ]);

  const campaignName = new Map((campaigns ?? []).map((c: any) => [c.id, c.name]));
  const rows: any[] = [];

  for (const p of purchases ?? []) {
    if (!p.tg_user_id) continue;
    const bought = new Date(p.created_at).getTime();
    let best: { d: any; touch: "click" | "open"; at: number } | null = null;

    for (const d of deliveries ?? []) {
      if (d.tg_user_id !== p.tg_user_id) continue;
      for (const [touch, iso] of [
        ["click", d.clicked_at],
        ["open", d.opened_at],
      ] as const) {
        if (!iso) continue;
        const at = new Date(iso).getTime();
        if (at > bought || bought - at > WINDOW) continue;
        // Klick schlägt Öffnung, danach zählt die jüngste Interaktion.
        const better =
          !best ||
          (touch === "click" && best.touch === "open") ||
          (touch === best.touch && at > best.at);
        if (better) best = { d, touch, at };
      }
    }
    if (!best) continue;

    rows.push({
      purchase_id: p.id,
      delivery_id: best.d.id,
      campaign_id: best.d.campaign_id ?? null,
      kind: best.d.kind,
      channel: best.d.channel,
      audience: String(best.d.recipient_label ?? "").toLowerCase().includes("fan") ? "user" : "admin",
      template_source: best.d.campaign_id
        ? `Kampagne: ${campaignName.get(best.d.campaign_id) ?? "—"}`
        : `Vorlage: ${best.d.kind}`,
      touch: best.touch,
      touched_at: new Date(best.at).toISOString(),
      minutes_to_purchase: Math.round((bought - best.at) / 60_000),
      amount_stars: p.amount_stars ?? 0,
    });
  }

  if (rows.length) {
    const { error } = await db.from("purchase_attributions").upsert(rows, { onConflict: "purchase_id" });
    if (error) throw new Error(error.message);
  }
  return rows.length;
}

export const getAttribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ recompute: z.boolean().default(true) }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { db, role } = await requireRole(context, "viewer");
    if (data.recompute && RANK[role as TeamRole] >= RANK.operator) await computeAttribution(db);

    const { data: rows } = await db
      .from("purchase_attributions")
      .select("*, purchases(title_snapshot, created_at, currency), notification_deliveries(recipient_label, target)")
      .order("created_at", { ascending: false })
      .limit(500);

    const list = (rows ?? []).map((r: any) => ({
      purchaseId: r.purchase_id,
      title: r.purchases?.title_snapshot ?? "—",
      purchasedAt: r.purchases?.created_at ?? null,
      deliveryId: r.delivery_id,
      recipient: r.notification_deliveries?.recipient_label ?? "—",
      campaignId: r.campaign_id,
      source: r.template_source,
      kind: r.kind,
      channel: r.channel,
      audience: r.audience,
      touch: r.touch,
      touchedAt: r.touched_at,
      minutes: r.minutes_to_purchase,
      stars: r.amount_stars,
    }));

    const group = (key: (x: any) => string) => {
      const map = new Map<string, { key: string; purchases: number; stars: number }>();
      for (const x of list) {
        const k = key(x) || "—";
        const cur = map.get(k) ?? { key: k, purchases: 0, stars: 0 };
        cur.purchases += 1;
        cur.stars += x.stars;
        map.set(k, cur);
      }
      return [...map.values()].sort((a, b) => b.stars - a.stars);
    };

    return {
      role,
      list,
      totals: { purchases: list.length, stars: list.reduce((a: number, x: any) => a + x.stars, 0) },
      bySource: group((x) => x.source),
      byKind: group((x) => x.kind),
      byChannel: group((x) => x.channel),
    };
  });

function csv(rows: (string | number)[][]) {
  return rows
    .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

export const exportAttributionCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db } = await requireRole(context, "viewer");
    const { data: rows } = await db
      .from("purchase_attributions")
      .select("*, purchases(title_snapshot, created_at)")
      .order("created_at", { ascending: false })
      .limit(5000);

    const out: (string | number)[][] = [
      [
        "Kauf-ID",
        "Titel",
        "Gekauft am",
        "Stars",
        "Quelle",
        "Kampagne-ID",
        "Alarmtyp",
        "Kanal",
        "Zielgruppe",
        "Interaktion",
        "Interaktion am",
        "Minuten bis Kauf",
        "Zustellung-ID",
      ],
      ...(rows ?? []).map((r: any) => [
        r.purchase_id,
        r.purchases?.title_snapshot ?? "",
        r.purchases?.created_at ?? "",
        r.amount_stars ?? 0,
        r.template_source ?? "",
        r.campaign_id ?? "",
        r.kind ?? "",
        r.channel ?? "",
        r.audience ?? "",
        r.touch ?? "",
        r.touched_at ?? "",
        r.minutes_to_purchase ?? 0,
        r.delivery_id ?? "",
      ]),
    ];
    return { filename: `attribution-${new Date().toISOString().slice(0, 10)}.csv`, csv: csv(out) };
  });
