/**
 * Wiederkehrende Verkaufs-Automatik:
 * Abo-Erinnerungen und Ablauf, Willkommens-Sequenz, Reaktivierung,
 * Warenkorb-Rettung für unbezahlte Rechnungen.
 */
import { tgSafe } from "@/lib/telegram.server";

const DAY = 86_400_000;

async function send(chatId: number | string, text: string, buttons?: { text: string; callback_data: string }[][]) {
  return tgSafe("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
  });
}

type Result = { processed: number; sent: number; failed: number; detail: string };

/** Erinnert vor Ablauf und entzieht abgelaufene Abos. */
export async function runSubscriptions(db: any, settings: any): Promise<Result> {
  const reminderDays = Math.max(0, Number(settings?.vip_reminder_days ?? 3));
  let sent = 0;
  let processed = 0;
  let failed = 0;

  const { data: subs } = await db
    .from("subscriptions")
    .select("*, tg_users!inner(telegram_id, first_name, blocked)")
    .eq("status", "active")
    .not("expires_at", "is", null)
    .limit(500);

  for (const sub of subs ?? []) {
    processed++;
    const fan = (sub as any).tg_users;
    const expires = new Date(sub.expires_at).getTime();
    if (expires <= Date.now()) {
      await db.from("subscriptions").update({ status: "expired" }).eq("id", sub.id);
      await db.from("order_events").insert({
        tg_user_id: sub.tg_user_id,
        kind: "vip_expired",
        detail: "Laufzeit abgelaufen",
      });
      if (!fan?.blocked) {
        const ok = await send(
          fan.telegram_id,
          "⏳ <b>Dein VIP-Zugang ist abgelaufen.</b>\nVerlängere jetzt und bleib bei allen Drops dabei.",
          [[{ text: "⭐ VIP verlängern", callback_data: "vip" }]],
        );
        ok ? sent++ : failed++;
      }
      continue;
    }
    const daysLeft = Math.ceil((expires - Date.now()) / DAY);
    const remindedRecently =
      sub.last_reminder_at && Date.now() - new Date(sub.last_reminder_at).getTime() < 2 * DAY;
    if (reminderDays > 0 && daysLeft <= reminderDays && !remindedRecently && !fan?.blocked) {
      const ok = await send(
        fan.telegram_id,
        `⏰ Dein VIP-Zugang läuft in <b>${daysLeft} Tag(en)</b> ab.\nJetzt verlängern und nichts verpassen.`,
        [[{ text: "⭐ Jetzt verlängern", callback_data: "vip" }]],
      );
      await db.from("subscriptions").update({ last_reminder_at: new Date().toISOString() }).eq("id", sub.id);
      ok ? sent++ : failed++;
    }
  }
  return { processed, sent, failed, detail: "" };
}

const WELCOME_STEPS = [
  {
    afterMs: 0,
    text: "👋 Schön, dass du da bist!\nSchau dich im Shop um – die beliebtesten Inhalte findest du dort zuerst.",
    buttons: [[{ text: "🛍 Shop öffnen", callback_data: "shop" }]],
  },
  {
    afterMs: DAY,
    text: "🎁 Kleiner Tipp: In der Gratis-Gruppe gibt es regelmäßig Previews und Aktionen.",
    buttons: [[{ text: "🎁 Gratis-Gruppe", callback_data: "join_free" }]],
  },
  {
    afterMs: 3 * DAY,
    text: "⭐ Bereit für alles? Mit VIP bekommst du jeden Drop sofort und ohne Extra-Kauf.",
    buttons: [[{ text: "⭐ VIP ansehen", callback_data: "vip" }]],
  },
] as const;

/** Sendet die nächste fällige Nachricht der Willkommens-Sequenz. */
export async function runSequences(db: any, settings: any): Promise<Result> {
  if (settings?.sequence_enabled === false) return { processed: 0, sent: 0, failed: 0, detail: "deaktiviert" };
  let sent = 0;
  let failed = 0;
  let processed = 0;

  const { data: rows } = await db
    .from("fan_sequences")
    .select("*, tg_users!inner(telegram_id, blocked)")
    .eq("done", false)
    .eq("kind", "welcome")
    .lte("next_at", new Date().toISOString())
    .limit(200);

  for (const row of rows ?? []) {
    processed++;
    const fan = (row as any).tg_users;
    const step = WELCOME_STEPS[row.step];
    if (!step || fan?.blocked) {
      await db.from("fan_sequences").update({ done: true }).eq("id", row.id);
      continue;
    }
    const ok = await send(fan.telegram_id, step.text, step.buttons as any);
    ok ? sent++ : failed++;
    const nextIndex = row.step + 1;
    const next = WELCOME_STEPS[nextIndex];
    await db
      .from("fan_sequences")
      .update({
        step: nextIndex,
        done: !next,
        next_at: next ? new Date(Date.now() + (next.afterMs - step.afterMs)).toISOString() : row.next_at,
      })
      .eq("id", row.id);
  }
  return { processed, sent, failed, detail: "" };
}

/** Erinnert an unbezahlte Rechnungen (Warenkorb-Rettung). */
export async function runCartRecovery(db: any, settings: any): Promise<Result> {
  const minutes = Math.max(0, Number(settings?.cart_recovery_minutes ?? 30));
  if (minutes === 0) return { processed: 0, sent: 0, failed: 0, detail: "deaktiviert" };
  const cutoff = new Date(Date.now() - minutes * 60_000).toISOString();
  const promo = String(settings?.cart_recovery_code ?? "").trim().toUpperCase();

  const { data: rows } = await db
    .from("invoice_intents")
    .select("*")
    .eq("paid", false)
    .is("reminded_at", null)
    .lte("created_at", cutoff)
    .limit(200);

  let sent = 0;
  let failed = 0;
  for (const row of rows ?? []) {
    const ok = await send(
      row.chat_id,
      `🛒 Du hast <b>${row.title || "einen Inhalt"}</b> noch nicht abgeschlossen.` +
        (promo ? `\n\nMit dem Code <code>${promo}</code> bekommst du ihn günstiger:\n<code>/code ${promo}</code>` : ""),
      [[{ text: "🛍 Weiter zum Shop", callback_data: "shop" }]],
    );
    ok ? sent++ : failed++;
    await db.from("invoice_intents").update({ reminded_at: new Date().toISOString() }).eq("id", row.id);
  }
  return { processed: rows?.length ?? 0, sent, failed, detail: "" };
}

/** Warnt vor dem Ablauf zeitlich begrenzter Content-Zugriffe und markiert abgelaufene Rechte. */
export async function runContentExpiry(db: any, settings: any): Promise<Result> {
  const reminderHours = Math.max(0, Number(settings?.content_expiry_reminder_hours ?? 6));
  let sent = 0, failed = 0, processed = 0;
  const { data: rows } = await db
    .from("content_access")
    .select("id,tg_user_id,content_set_id,expires_at,expiry_reminded_at,tg_users!inner(telegram_id,blocked),content_sets!inner(title)")
    .eq("status", "active")
    .not("expires_at", "is", null)
    .limit(500);

  for (const row of rows ?? []) {
    processed++;
    const expires = new Date(row.expires_at).getTime();
    const fan = (row as any).tg_users;
    const title = (row as any).content_sets?.title ?? "dein Inhalt";
    if (expires <= Date.now()) {
      await db.from("content_access").update({ status: "expired" }).eq("id", row.id);
      continue;
    }
    const hoursLeft = Math.ceil((expires - Date.now()) / 3_600_000);
    if (reminderHours > 0 && hoursLeft <= reminderHours && !row.expiry_reminded_at && !fan?.blocked) {
      const ok = await send(
        fan.telegram_id,
        `⏳ Dein Zugriff auf <b>${title}</b> läuft in etwa <b>${hoursLeft} Stunde(n)</b> ab.`,
        [[{ text: "🔓 Meine Inhalte", callback_data: "my_content" }, { text: "🛍 Shop", callback_data: "shop" }]],
      );
      await db.from("content_access").update({ expiry_reminded_at: new Date().toISOString() }).eq("id", row.id);
      ok ? sent++ : failed++;
    }
  }
  return { processed, sent, failed, detail: "" };
}

/** Spricht Fans ohne Kauf seit X Tagen erneut an. */
export async function runReactivation(db: any, settings: any): Promise<Result> {
  const days = Math.max(0, Number(settings?.reactivate_after_days ?? 14));
  if (days === 0) return { processed: 0, sent: 0, failed: 0, detail: "deaktiviert" };
  const cutoff = new Date(Date.now() - days * DAY).toISOString();

  const { data: fans } = await db
    .from("tg_users")
    .select("id, telegram_id")
    .eq("blocked", false)
    .lte("last_seen_at", cutoff)
    .limit(100);

  let sent = 0;
  let failed = 0;
  let processed = 0;
  for (const fan of fans ?? []) {
    const { data: seq } = await db
      .from("fan_sequences")
      .select("id, updated_at")
      .eq("tg_user_id", fan.id)
      .eq("kind", "reactivation")
      .maybeSingle();
    if (seq && Date.now() - new Date(seq.updated_at).getTime() < 30 * DAY) continue;
    processed++;
    const ok = await send(
      fan.telegram_id,
      "👀 Lange nicht gesehen! Es gibt neue Inhalte im Shop – schau rein, bevor sie weg sind.",
      [[{ text: "🛍 Neues ansehen", callback_data: "shop" }]],
    );
    ok ? sent++ : failed++;
    if (seq) await db.from("fan_sequences").update({ step: 0, done: true }).eq("id", seq.id);
    else
      await db
        .from("fan_sequences")
        .insert({ tg_user_id: fan.id, kind: "reactivation", step: 1, done: true });
  }
  return { processed, sent, failed, detail: "" };
}

/** Führt alle Lebenszyklus-Jobs aus. */
export async function runLifecycle(db: any) {
  const settings = (await db.from("bot_settings").select("*").eq("id", true).maybeSingle()).data ?? {};
  const parts = {
    subscriptions: await runSubscriptions(db, settings),
    sequences: await runSequences(db, settings),
    cart: await runCartRecovery(db, settings),
    contentExpiry: await runContentExpiry(db, settings),
    reactivation: await runReactivation(db, settings),
  };
  const sum = (k: "processed" | "sent" | "failed") =>
    Object.values(parts).reduce((a, p) => a + p[k], 0);
  return { parts, processed: sum("processed"), sent: sum("sent"), failed: sum("failed") };
}
