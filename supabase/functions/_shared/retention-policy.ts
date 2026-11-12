/** Shared rules for scheduled customer contact. No messages are sent here. */
export function promoWindowOpen(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23",
  }).format(now));
  return hour >= 8 && hour < 22;
}

export function hasContactConsent(state: any, blocked = false) {
  return !blocked && state?.ageVerified === true && state?.consent === true && !state?.optedOut;
}

export async function loadContactPermission(db: any, userId: string) {
  const [user, log] = await Promise.all([
    db.from("tg_users").select("blocked").eq("id", userId).maybeSingle(),
    db.from("action_log").select("meta").eq("tg_user_id", userId)
      .eq("action", "telegram_onboarding").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (user.error) throw user.error;
  if (log.error) throw log.error;
  if (!user.data) return false;
  let state;
  try { state = JSON.parse(String(log.data?.meta || "{}")); } catch { return false; }
  return hasContactConsent(state, Boolean(user.data.blocked));
}

/** Wait the configured hours after the latest open, then keep the offer relevant for seven days. */
export function crossSellDue(openedAt: string | null | undefined, hours: number, now = Date.now()) {
  const opened = new Date(openedAt || "").getTime();
  const delay = Math.max(6, Number(hours) || 24) * 3_600_000;
  const age = now - opened;
  return Number.isFinite(opened) && age >= delay && age < delay + 7 * 86_400_000;
}
