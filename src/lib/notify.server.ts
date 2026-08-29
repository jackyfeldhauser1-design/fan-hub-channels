const GATEWAY = "https://connector-gateway.lovable.dev/telegram";

export type SendResult = { messageId: string; response: string };

/** Sendet eine Telegram-Nachricht, wirft bei Fehlern (für Retry/Fallback). */
export async function sendTelegram(chatId: string | number, text: string): Promise<SendResult> {
  if (!chatId) throw new Error("Keine Chat-ID hinterlegt");
  const res = await fetch(`${GATEWAY}/sendMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}`,
      "X-Connection-Api-Key": `${process.env["TELEGRAM_API_KEY"]}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Telegram [${res.status}]: ${body.slice(0, 300)}`);
  const parsed = JSON.parse(body) as { ok: boolean; description?: string; result?: { message_id?: number } };
  if (!parsed.ok) throw new Error(parsed.description ?? "Telegram lehnte den Versand ab");
  return { messageId: String(parsed.result?.message_id ?? ""), response: body.slice(0, 500) };
}

/** Sendet eine Slack-Nachricht über eine Incoming-Webhook-URL. */
export async function sendSlack(webhookUrl: string, text: string): Promise<SendResult> {
  if (!webhookUrl.startsWith("https://")) throw new Error("Slack-Webhook-URL fehlt oder ist ungültig");
  const plain = text.replace(/<\/?b>/g, "*").replace(/<[^>]+>/g, "");
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: plain }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Slack [${res.status}]: ${body.slice(0, 300)}`);
  return { messageId: "", response: body.slice(0, 300) };
}


export type NotifyKind = "expiring" | "expired" | "unpaid" | "blocked" | "reactivated";

export const NOTIFY_KINDS: { kind: NotifyKind; label: string }[] = [
  { kind: "expiring", label: "Zugang läuft bald ab" },
  { kind: "expired", label: "Zugang abgelaufen" },
  { kind: "unpaid", label: "Zahlung nicht bestätigt" },
  { kind: "blocked", label: "Konto gesperrt" },
  { kind: "reactivated", label: "Zugang neu aktiviert" },
];

export type NotifyVars = {
  fan: string;
  inhalt: string;
  ticket: string;
  ablauf: string;
  grund: string;
};

export const NOTIFY_VARIABLES: { key: keyof NotifyVars; label: string; source: string }[] = [
  { key: "fan", label: "{fan}", source: "Telegram-Name des Fans (tg_users)" },
  { key: "inhalt", label: "{inhalt}", source: "Titel des Produkts oder Medien-Ordners" },
  { key: "ticket", label: "{ticket}", source: "Kurz-ID des Zugangs (access_tokens.id)" },
  { key: "ablauf", label: "{ablauf}", source: "Ablaufzeitpunkt des Zugangslinks" },
  { key: "grund", label: "{grund}", source: "Detailtext des auslösenden Ereignisses" },
];

const TEMPLATES: Record<NotifyKind, { admin: string; user: string | null }> = {
  expiring: {
    admin: "⏰ <b>Zugang läuft bald ab</b>\nFan: {fan}\nInhalt: {inhalt}\nTicket: {ticket}\nGültig bis: {ablauf}",
    user: "⏰ Dein Zugang läuft bald ab (gültig bis {ablauf}). Öffne den Inhalt rechtzeitig.",
  },
  expired: {
    admin:
      "⏳ <b>Einmal-Zugang abgelaufen</b>\nFan: {fan}\nInhalt: {inhalt}\nTicket: {ticket}\nAbgelaufen: {ablauf}\n{grund}\nIm Dashboard unter „Zugriffe“ neu aktivieren.",
    user: "⏳ Dein Zugangslink ist abgelaufen. Wir haben das Team informiert – du bekommst gleich einen neuen Link.",
  },
  unpaid: {
    admin: "💳 <b>Zugriff ohne bestätigte Zahlung</b>\nFan: {fan}\nInhalt: {inhalt}\nTicket: {ticket}\n{grund}",
    user: "💳 Deine Zahlung ist noch nicht bestätigt. Sobald sie eingeht, wird der Inhalt automatisch freigeschaltet.",
  },
  blocked: {
    admin: "🚫 <b>Zugriff blockiert</b>\nFan: {fan}\nInhalt: {inhalt}\nTicket: {ticket}\nGrund: gesperrtes Konto\n{grund}",
    user: "🚫 Dein Zugang ist derzeit gesperrt. Bitte melde dich beim Support, damit wir das prüfen.",
  },
  reactivated: {
    admin: "✅ <b>Zugang neu aktiviert</b>\nFan: {fan}\nInhalt: {inhalt}\nTicket: {ticket}\nGültig bis: {ablauf}\n{grund}",
    user: "✅ Dein Zugang wurde neu aktiviert. Öffne den Link erneut, um den Inhalt zu sehen.",
  },
};

export const DEFAULT_TEMPLATES = TEMPLATES;

export function fillVars(raw: string, vars: NotifyVars) {
  return raw.replace(/\{(fan|inhalt|ticket|ablauf|grund)\}/g, (_m, key: keyof NotifyVars) => vars[key] || "—");
}

export function renderTemplate(kind: NotifyKind, vars: NotifyVars, audience: "admin" | "user" = "admin") {
  const raw = audience === "user" ? TEMPLATES[kind].user : TEMPLATES[kind].admin;
  if (!raw) return null;
  return fillVars(raw, vars);
}

/** Lädt die (ggf. im Editor angepasste) Vorlage und füllt die Platzhalter. */
export async function renderStoredTemplate(
  db: any,
  kind: NotifyKind,
  vars: NotifyVars,
  audience: "admin" | "user" = "admin",
): Promise<{ body: string | null; linkUrl: string }> {
  const { data: tpl } = await db
    .from("notification_templates")
    .select("body, link_url, active")
    .eq("kind", kind)
    .eq("audience", audience)
    .maybeSingle();
  if (tpl?.active && tpl.body) return { body: fillVars(tpl.body, vars), linkUrl: tpl.link_url ?? "" };
  return { body: renderTemplate(kind, vars, audience), linkUrl: tpl?.link_url ?? "" };
}

/** Hängt einen messbaren Tracking-Link an die Nachricht. */
export function withTracking(base: string, deliveryId: string, body: string, linkUrl: string) {
  const root = String(base ?? "").replace(/\/$/, "");
  if (!root) return body;
  const target = linkUrl ? `?to=${encodeURIComponent(linkUrl)}` : "";
  return `${body}\n\n👉 ${root}/api/public/n/${deliveryId}${target}`;
}

/** Benachrichtigt externe Systeme über Zustellergebnisse. */
export async function dispatchWebhooks(db: any, event: string, payload: Record<string, unknown>) {
  const { data: hooks } = await db.from("notification_webhooks").select("*").eq("active", true);
  for (const hook of hooks ?? []) {
    if (Array.isArray(hook.events) && hook.events.length && !hook.events.includes(event)) continue;
    const bodyText = JSON.stringify({ event, sentAt: new Date().toISOString(), data: payload });
    let status = "";
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (hook.secret) {
        const key = await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(hook.secret),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"],
        );
        const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(bodyText));
        headers["X-Signature-256"] = Array.from(new Uint8Array(sig))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      }
      const res = await fetch(hook.url, { method: "POST", headers, body: bodyText });
      status = `${res.status}`;
    } catch (e) {
      status = `Fehler: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200);
    }
    await db
      .from("notification_webhooks")
      .update({ last_status: status, last_called_at: new Date().toISOString() })
      .eq("id", hook.id);
  }
}


/** Baut die Platzhalterwerte für einen Zugang (oder Beispielwerte). */
export async function buildVars(
  db: any,
  opts: { tokenId?: string | null; tgUserId?: string | null; detail?: string },
): Promise<NotifyVars> {
  let fan = "unbekannt";
  let inhalt = "—";
  let ablauf = "—";
  let ticket = opts.tokenId ? opts.tokenId.slice(0, 8) : "—";
  let tgUserId = opts.tgUserId ?? null;

  if (opts.tokenId) {
    const { data: token } = await db
      .from("access_tokens")
      .select("id, expires_at, tg_user_id, products(title), media_folders(title)")
      .eq("id", opts.tokenId)
      .maybeSingle();
    if (token) {
      ticket = String(token.id).slice(0, 8);
      ablauf = token.expires_at ? new Date(token.expires_at).toLocaleString("de-DE") : "—";
      inhalt = token.products?.title ?? token.media_folders?.title ?? "—";
      tgUserId = tgUserId ?? token.tg_user_id;
    }
  }

  if (tgUserId) {
    const { data: user } = await db
      .from("tg_users")
      .select("username, first_name")
      .eq("id", tgUserId)
      .maybeSingle();
    if (user) fan = user.username ? `@${user.username}` : (user.first_name ?? "unbekannt");
  }

  return { fan, inhalt, ticket, ablauf, grund: opts.detail ?? "" };
}

export type NotifyChannel = "telegram" | "email" | "slack";

type Recipient = {
  id: string | null;
  label: string;
  channel: NotifyChannel;
  target: string;
  fallback_channel: NotifyChannel | null;
  fallback_target: string;
};

const RETRY_DELAYS_MIN = [1, 5, 15];
export const MAX_ATTEMPTS = RETRY_DELAYS_MIN.length + 1;

function nextRetryAt(attempt: number) {
  const minutes = RETRY_DELAYS_MIN[attempt - 1];
  if (minutes === undefined) return null;
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

/** Ein einzelner Zustellversuch inkl. Kanal-Fallback. */
export async function deliverOnce(
  db: any,
  delivery: {
    id: string;
    channel: NotifyChannel;
    target: string;
    body: string;
    attempt: number;
    recipient_id: string | null;
  },
) {
  const attempt = (delivery.attempt ?? 0) + 1;
  let usedFallback = false;
  let error = "";
  let result: SendResult = { messageId: "", response: "" };

  const tryChannel = async (channel: NotifyChannel, target: string) => {
    if (channel === "email") throw new Error("E-Mail-Versand ist noch nicht eingerichtet (keine Absender-Domain)");
    if (channel === "slack") return sendSlack(target, delivery.body);
    return sendTelegram(target, delivery.body);
  };

  try {
    result = await tryChannel(delivery.channel, delivery.target);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    // Ersatzkanal versuchen
    let fb: { channel: NotifyChannel; target: string } | null = null;
    if (delivery.recipient_id) {
      const { data: rec } = await db
        .from("notification_recipients")
        .select("fallback_channel, fallback_target")
        .eq("id", delivery.recipient_id)
        .maybeSingle();
      if (rec?.fallback_channel && rec.fallback_target) {
        fb = { channel: rec.fallback_channel, target: rec.fallback_target };
      }
    }
    if (fb) {
      try {
        result = await tryChannel(fb.channel, fb.target);
        usedFallback = true;
        error = "";
      } catch (e2) {
        error = `${error} · Ersatzkanal: ${e2 instanceof Error ? e2.message : String(e2)}`;
      }
    }
  }

  if (!error) {
    await db
      .from("notification_deliveries")
      .update({
        status: "sent",
        attempt,
        error: "",
        used_fallback: usedFallback,
        next_retry_at: null,
        provider_message_id: result.messageId,
        provider_response: result.response,
      })
      .eq("id", delivery.id);
    await db.from("notification_events").insert({ delivery_id: delivery.id, event: "sent", detail: result.response });
    await dispatchWebhooks(db, "delivery.sent", {
      deliveryId: delivery.id,
      channel: delivery.channel,
      target: delivery.target,
      usedFallback,
      providerMessageId: result.messageId,
    });
    return { ok: true, usedFallback };
  }

  const retryAt = attempt < MAX_ATTEMPTS ? nextRetryAt(attempt) : null;
  await db
    .from("notification_deliveries")
    .update({
      status: retryAt ? "retrying" : "dead",
      attempt,
      error: error.slice(0, 500),
      next_retry_at: retryAt,
    })
    .eq("id", delivery.id);
  await db
    .from("notification_events")
    .insert({ delivery_id: delivery.id, event: retryAt ? "retry" : "failed", detail: error.slice(0, 300) });
  await dispatchWebhooks(db, "delivery.failed", {
    deliveryId: delivery.id,
    channel: delivery.channel,
    target: delivery.target,
    attempt,
    willRetry: Boolean(retryAt),
    error: error.slice(0, 300),
  });
  return { ok: false, error };
}


/** Ermittelt alle aktiven Empfänger für einen Alarm (Admin-Chat + Standard + Zugangs-Zuordnung). */
async function resolveRecipients(db: any, tokenId: string | null | undefined, adminChatId: string) {
  const [{ data: defaults }, { data: linked }] = await Promise.all([
    db.from("notification_recipients").select("*").eq("active", true).eq("is_default", true),
    tokenId
      ? db
          .from("access_token_recipients")
          .select("notification_recipients(*)")
          .eq("token_id", tokenId)
      : Promise.resolve({ data: [] }),
  ]);

  const rows: any[] = [
    ...(defaults ?? []),
    ...((linked ?? []).map((r: any) => r.notification_recipients).filter(Boolean) as any[]),
  ].filter((r) => r.active);

  const list: Recipient[] = [];
  if (adminChatId) {
    list.push({
      id: null,
      label: "Admin-Chat",
      channel: "telegram",
      target: adminChatId,
      fallback_channel: null,
      fallback_target: "",
    });
  }
  for (const r of rows) {
    list.push({
      id: r.id,
      label: r.label || "Empfänger",
      channel: r.channel,
      target: r.channel === "email" ? r.email : r.chat_id,
      fallback_channel: r.fallback_channel ?? null,
      fallback_target: r.fallback_target ?? "",
    });
  }

  const seen = new Set<string>();
  return list.filter((r) => {
    const key = `${r.id ?? "admin"}:${r.channel}:${r.target}`;
    if (!r.target || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Informiert alle berechtigten Empfänger und (falls sinnvoll) den Fan. */
export async function notifyAccessIssue(
  db: any,
  kind: NotifyKind,
  opts: { tgUserId?: string | null; tokenId?: string | null; detail?: string; notifyUser?: boolean },
) {
  const { data: settings } = await db.from("bot_settings").select("*").eq("id", true).maybeSingle();
  if (!settings) return;

  // Globaler Hauptschalter aus dem Bot-Setup
  const master =
    kind === "blocked"
      ? settings.notify_blocked
      : kind === "unpaid"
        ? settings.notify_unpaid
        : kind === "expired" || kind === "expiring"
          ? settings.notify_expired
          : true;
  if (!master) return;

  const vars = await buildVars(db, {
    tokenId: opts.tokenId ?? null,
    tgUserId: opts.tgUserId ?? null,
    detail: opts.detail ?? "",
  });
  const tpl = await renderStoredTemplate(db, kind, vars, "admin");
  const body = tpl.body ?? "";
  const base = String(settings.app_base_url ?? "");
  const recipients = await resolveRecipients(db, opts.tokenId, settings.admin_chat_id ?? "");

  // Opt-in/Opt-out je Empfänger
  const ids = recipients.map((r) => r.id).filter(Boolean) as string[];
  const prefs = ids.length
    ? ((await db.from("notification_prefs").select("recipient_id, kind, enabled").in("recipient_id", ids)).data ?? [])
    : [];
  const optedOut = new Set(
    prefs.filter((p: any) => p.kind === kind && p.enabled === false).map((p: any) => p.recipient_id),
  );

  for (const r of recipients) {
    const skipped = r.id ? optedOut.has(r.id) : false;
    const { data: row } = await db
      .from("notification_deliveries")
      .insert({
        recipient_id: r.id,
        recipient_label: r.label,
        kind,
        channel: r.channel,
        target: r.target,
        token_id: opts.tokenId ?? null,
        tg_user_id: opts.tgUserId ?? null,
        body,
        status: skipped ? "skipped_optout" : "queued",
      })
      .select("id")
      .single();
    if (skipped || !row) continue;
    const trackedBody = withTracking(base, row.id, body, tpl.linkUrl);
    if (trackedBody !== body) await db.from("notification_deliveries").update({ body: trackedBody }).eq("id", row.id);
    await deliverOnce(db, {
      id: row.id,
      channel: r.channel,
      target: r.target,
      body: trackedBody,
      attempt: 0,
      recipient_id: r.id,
    });
  }

  // Fan-Nachricht bleibt wie bisher optional und unabhängig vom Protokoll.
  const userTpl = await renderStoredTemplate(db, kind, vars, "user");
  const userText = userTpl.body;
  if (opts.notifyUser !== false && userText && opts.tgUserId) {
    const { data: fan } = await db.from("tg_users").select("telegram_id").eq("id", opts.tgUserId).maybeSingle();
    if (fan?.telegram_id) {
      const { data: row } = await db
        .from("notification_deliveries")
        .insert({
          recipient_id: null,
          recipient_label: "Fan",
          kind,
          channel: "telegram",
          target: String(fan.telegram_id),
          token_id: opts.tokenId ?? null,
          tg_user_id: opts.tgUserId ?? null,
          body: userText,
          status: "queued",
        })
        .select("id")
        .single();
      const tracked = row ? withTracking(base, row.id, userText, userTpl.linkUrl) : userText;
      try {
        if (row) {
          await db.from("notification_deliveries").update({ body: tracked }).eq("id", row.id);
          await deliverOnce(db, {
            id: row.id,
            channel: "telegram",
            target: String(fan.telegram_id),
            body: tracked,
            attempt: 0,
            recipient_id: null,
          });
        } else {
          await sendTelegram(fan.telegram_id, userText);
        }
      } catch {
        /* Fan-Benachrichtigung darf den Zugriffsfluss nie blockieren */
      }
    }
  }
}

/** Startet eine geplante Kampagne: segmentiert Empfänger und verschickt die Nachricht. */
export async function runCampaign(db: any, campaignId: string) {
  const { data: c } = await db.from("notification_campaigns").select("*").eq("id", campaignId).maybeSingle();
  if (!c) throw new Error("Kampagne nicht gefunden");
  const { data: settings } = await db.from("bot_settings").select("app_base_url, admin_chat_id").eq("id", true).maybeSingle();
  const base = String(settings?.app_base_url ?? "");
  const nowIso = new Date().toISOString();

  let q = db.from("access_tokens").select("id, tg_user_id, expires_at, revoked, views, max_views").limit(500);
  if (c.segment === "expiring")
    q = q.eq("revoked", false).gt("expires_at", nowIso).lt("expires_at", new Date(Date.now() + 72 * 3_600_000).toISOString());
  else if (c.segment === "expired") q = q.lt("expires_at", nowIso);
  else if (c.segment === "unused") q = q.eq("views", 0).gt("expires_at", nowIso);
  else if (c.segment === "revoked") q = q.eq("revoked", true);

  const { data: tokens } = await q;
  let sent = 0;
  let lastError = "";

  for (const t of tokens ?? []) {
    if (!t.tg_user_id) continue;
    const vars = await buildVars(db, { tokenId: t.id, tgUserId: t.tg_user_id, detail: c.name });
    const body = fillVars(c.body || "", vars);
    const { data: fan } = await db.from("tg_users").select("telegram_id, blocked").eq("id", t.tg_user_id).maybeSingle();
    const target =
      c.audience === "user" ? String(fan?.telegram_id ?? "") : String(settings?.admin_chat_id ?? "");
    if (!target || (c.audience === "user" && fan?.blocked)) continue;
    const { data: row } = await db
      .from("notification_deliveries")
      .insert({
        recipient_id: null,
        recipient_label: c.audience === "user" ? "Fan (Kampagne)" : "Admin-Chat (Kampagne)",
        kind: c.kind,
        channel: "telegram",
        target,
        token_id: t.id,
        tg_user_id: t.tg_user_id,
        campaign_id: c.id,
        body,
        status: "queued",
      })
      .select("id")
      .single();
    if (!row) continue;
    const tracked = withTracking(base, row.id, body, c.link_url ?? "");
    await db.from("notification_deliveries").update({ body: tracked }).eq("id", row.id);
    const res = await deliverOnce(db, {
      id: row.id,
      channel: "telegram",
      target,
      body: tracked,
      attempt: 0,
      recipient_id: null,
    });
    if (res.ok) sent += 1;
    else lastError = res.error ?? "";
  }

  await db
    .from("notification_campaigns")
    .update({
      status: "sent",
      sent_count: (c.sent_count ?? 0) + sent,
      last_run_at: new Date().toISOString(),
      last_error: lastError.slice(0, 300),
    })
    .eq("id", c.id);
  return { sent, total: (tokens ?? []).length };
}

/** Verarbeitet alle fälligen geplanten Kampagnen (Cron). */
export async function processDueCampaigns(db: any) {
  const { data: due } = await db
    .from("notification_campaigns")
    .select("id")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString())
    .limit(10);
  let total = 0;
  for (const c of due ?? []) {
    try {
      const r = await runCampaign(db, c.id);
      total += r.sent;
    } catch (e) {
      await db
        .from("notification_campaigns")
        .update({ status: "failed", last_error: (e instanceof Error ? e.message : String(e)).slice(0, 300) })
        .eq("id", c.id);
    }
  }
  return { campaigns: (due ?? []).length, sent: total };
}


/** Arbeitet fällige Wiederholungen ab (vom Cron-Endpunkt aufgerufen). */
export async function processRetryQueue(db: any, limit = 50) {
  const { data: due } = await db
    .from("notification_deliveries")
    .select("id, channel, target, body, attempt, recipient_id")
    .eq("status", "retrying")
    .lte("next_retry_at", new Date().toISOString())
    .order("next_retry_at", { ascending: true })
    .limit(limit);

  let sent = 0;
  let failed = 0;
  for (const d of due ?? []) {
    const res = await deliverOnce(db, d);
    if (res.ok) sent += 1;
    else failed += 1;
  }
  return { processed: (due ?? []).length, sent, failed };
}
