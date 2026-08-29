/**
 * Werbeposts: einmalige und wiederkehrende Veröffentlichung in
 * Community- und Shop-Channel inkl. Terminplanung.
 */
import { tgApi } from "@/lib/telegram.server";

/** Chat-IDs für das Ziel einer Buchung. */
export function adTargets(post: any, settings: any): string[] {
  const out: string[] = [];
  if (post.target === "free" || post.target === "both") out.push(settings?.community_chat_id);
  if (post.target === "vip" || post.target === "both") out.push(settings?.shop_chat_id);
  return out.filter(Boolean).map(String);
}

/** Nächster Sendezeitpunkt bei aktivierter Wiederholung. */
export function nextRun(post: any, from = Date.now()): string | null {
  const hours = Number(post.repeat_hours ?? 0);
  if (!hours) return null;
  const next = from + hours * 3_600_000;
  if (post.repeat_until && new Date(post.repeat_until).getTime() < next) return null;
  return new Date(next).toISOString();
}

/** Veröffentlicht eine Buchung in allen Zielkanälen und plant ggf. die Wiederholung. */
export async function publishAd(db: any, post: any, settings: any) {
  const targets = adTargets(post, settings);
  if (!targets.length) throw new Error("Bitte zuerst die Chat-ID der Gruppe im Bot-Setup hinterlegen.");

  let sent = 0;
  let lastError = "";
  for (const chatId of targets) {
    try {
      await tgApi("sendMessage", {
        chat_id: chatId,
        text: `📣 <b>Anzeige</b> · ${post.advertiser}\n\n${post.content}`,
        parse_mode: "HTML",
        ...(post.link_url
          ? { reply_markup: { inline_keyboard: [[{ text: "Mehr erfahren", url: post.link_url }]] } }
          : {}),
      });
      sent += 1;
    } catch (e) {
      lastError = e instanceof Error ? e.message.slice(0, 300) : "Fehler";
    }
    await db.from("notification_deliveries").insert({
      recipient_label: `Werbepost: ${post.advertiser}`.slice(0, 120),
      kind: "reactivated",
      channel: "telegram",
      target: chatId,
      body: String(post.content ?? "").slice(0, 2000),
      status: lastError ? "dead" : "sent",
      attempt: 1,
      error: lastError,
    });
  }

  await db
    .from("sponsored_posts")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
      next_run_at: nextRun(post),
    })
    .eq("id", post.id);

  return { sent, targets: targets.length, error: lastError };
}

/** Cron: alle fälligen wiederkehrenden Werbeposts veröffentlichen. */
export async function processDueAds(db: any) {
  const { data: settings } = await db.from("bot_settings").select("*").eq("id", true).maybeSingle();
  const { data: due } = await db
    .from("sponsored_posts")
    .select("*")
    .eq("paused", false)
    .gt("repeat_hours", 0)
    .not("next_run_at", "is", null)
    .lte("next_run_at", new Date().toISOString())
    .in("status", ["paid", "approved", "published"])
    .limit(20);

  let posts = 0;
  let sent = 0;
  let failed = 0;
  for (const post of (due ?? []) as any[]) {
    if (post.repeat_until && new Date(post.repeat_until).getTime() < Date.now()) {
      await db.from("sponsored_posts").update({ next_run_at: null }).eq("id", post.id);
      continue;
    }
    posts += 1;
    try {
      const res = await publishAd(db, post, settings);
      sent += res.sent;
      if (res.error) failed += 1;
    } catch {
      failed += 1;
      await db.from("sponsored_posts").update({ next_run_at: nextRun(post) }).eq("id", post.id);
    }
  }
  return { posts, sent, failed };
}
