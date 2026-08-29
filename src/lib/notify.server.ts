const GATEWAY = "https://connector-gateway.lovable.dev/telegram";

async function send(chatId: string | number, text: string) {
  if (!chatId) return;
  try {
    await fetch(`${GATEWAY}/sendMessage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}`,
        "X-Connection-Api-Key": `${process.env["TELEGRAM_API_KEY"]}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
  } catch {
    /* Benachrichtigungen dürfen den Zugriffsfluss nie blockieren */
  }
}

export type NotifyKind = "blocked" | "unpaid" | "expired" | "reactivated";

const copy: Record<NotifyKind, { admin: (fan: string, detail: string) => string; user: string | null }> = {
  blocked: {
    admin: (fan, d) => `🚫 <b>Zugriff blockiert</b>\nFan: ${fan}\nGrund: gesperrtes Konto\n${d}`,
    user: "🚫 Dein Zugang ist derzeit gesperrt. Bitte melde dich beim Support, damit wir das prüfen.",
  },
  unpaid: {
    admin: (fan, d) => `💳 <b>Zugriff ohne bestätigte Zahlung</b>\nFan: ${fan}\n${d}`,
    user: "💳 Deine Zahlung ist noch nicht bestätigt. Sobald sie eingeht, wird der Inhalt automatisch freigeschaltet.",
  },
  expired: {
    admin: (fan, d) => `⏳ <b>Einmal-Zugang abgelaufen</b>\nFan: ${fan}\n${d}\nIm Dashboard unter „Zugriffe“ neu aktivieren.`,
    user: "⏳ Dein Zugangslink ist abgelaufen. Wir haben das Team informiert – du bekommst gleich einen neuen Link.",
  },
  reactivated: {
    admin: (fan, d) => `✅ <b>Zugang neu aktiviert</b>\nFan: ${fan}\n${d}`,
    user: "✅ Dein Zugang wurde neu aktiviert. Öffne den Link erneut, um den Inhalt zu sehen.",
  },
};

/** Informiert Admin-Chat und (falls sinnvoll) den Fan über Zugriffsprobleme. */
export async function notifyAccessIssue(
  db: any,
  kind: NotifyKind,
  opts: { tgUserId?: string | null; detail?: string; notifyUser?: boolean },
) {
  const { data: settings } = await db.from("bot_settings").select("*").eq("id", true).maybeSingle();
  if (!settings) return;
  const flag =
    kind === "blocked"
      ? settings.notify_blocked
      : kind === "unpaid"
        ? settings.notify_unpaid
        : kind === "expired"
          ? settings.notify_expired
          : true;
  if (!flag) return;

  let fanLabel = "unbekannt";
  let telegramId: number | null = null;
  if (opts.tgUserId) {
    const { data: fan } = await db
      .from("tg_users")
      .select("username, first_name, telegram_id")
      .eq("id", opts.tgUserId)
      .maybeSingle();
    if (fan) {
      fanLabel = fan.username ? `@${fan.username}` : (fan.first_name ?? "unbekannt");
      telegramId = fan.telegram_id;
    }
  }

  const text = copy[kind];
  await send(settings.admin_chat_id, text.admin(fanLabel, opts.detail ?? ""));
  if (opts.notifyUser !== false && telegramId && text.user) await send(telegramId, text.user);
}
