/**
 * Verkaufs- und Abo-Logik: Abo-Laufzeiten, Rabattcodes, offene Rechnungen.
 * Läuft ausschließlich serverseitig (Admin-Client oder Webhook).
 */

export type Discount = {
  id: string;
  code: string;
  percent_off: number;
  stars_off: number;
  once_per_fan: boolean;
};

/** Prüft einen Rabattcode und gibt ihn samt Ersparnis auf einen Betrag zurück. */
export async function checkDiscount(
  db: any,
  code: string,
  tgUserId: string | null,
  amount: number,
): Promise<{ ok: boolean; reason: string; discount: Discount | null; price: number; saved: number }> {
  const fail = (reason: string) => ({ ok: false, reason, discount: null, price: amount, saved: 0 });
  const clean = code.trim().toUpperCase();
  if (!clean) return fail("Kein Code angegeben.");

  const { data: row } = await db.from("discount_codes").select("*").eq("code", clean).maybeSingle();
  if (!row || !row.active) return fail("Dieser Code ist nicht gültig.");
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return fail("Dieser Code ist abgelaufen.");
  if (row.max_uses > 0 && row.used_count >= row.max_uses) return fail("Dieser Code ist bereits aufgebraucht.");

  if (row.once_per_fan && tgUserId) {
    const { data: used } = await db
      .from("code_redemptions")
      .select("id")
      .eq("code_id", row.id)
      .eq("tg_user_id", tgUserId)
      .limit(1);
    if (used?.length) return fail("Du hast diesen Code bereits eingelöst.");
  }

  const percentCut = Math.floor((amount * Math.max(0, Math.min(100, row.percent_off))) / 100);
  const price = Math.max(1, amount - percentCut - Math.max(0, row.stars_off));
  return { ok: true, reason: "", discount: row as Discount, price, saved: amount - price };
}

/** Bucht die Einlösung eines Rabattcodes nach erfolgreicher Zahlung. */
export async function redeemDiscount(
  db: any,
  codeId: string,
  tgUserId: string | null,
  purchaseId: string | null,
  saved: number,
) {
  await db.from("code_redemptions").insert({
    code_id: codeId,
    tg_user_id: tgUserId,
    purchase_id: purchaseId,
    amount_saved: saved,
  });
  const { data: row } = await db.from("discount_codes").select("used_count").eq("id", codeId).maybeSingle();
  await db
    .from("discount_codes")
    .update({ used_count: Number(row?.used_count ?? 0) + 1 })
    .eq("id", codeId);
}

/** Merkt sich eine gesendete Rechnung für die spätere Warenkorb-Rettung. */
export async function recordInvoiceIntent(
  db: any,
  tgUserId: string,
  chatId: number | string,
  payload: string,
  title: string,
  amountStars: number,
) {
  try {
    await db.from("invoice_intents").insert({
      tg_user_id: tgUserId,
      chat_id: Number(chatId),
      payload,
      title: String(title).slice(0, 120),
      amount_stars: amountStars,
    });
  } catch {
    /* Rechnung darf nie an der Protokollierung scheitern */
  }
}

/** Markiert offene Rechnungen eines Fans als bezahlt. */
export async function closeInvoiceIntents(db: any, tgUserId: string, payload: string) {
  await db
    .from("invoice_intents")
    .update({ paid: true })
    .eq("tg_user_id", tgUserId)
    .eq("payload", payload)
    .eq("paid", false);
}

/** Aktives Abo eines Fans (falls die Laufzeit noch gilt). */
export async function activeSubscription(db: any, tgUserId: string) {
  const { data } = await db
    .from("subscriptions")
    .select("*")
    .eq("tg_user_id", tgUserId)
    .eq("status", "active")
    .order("expires_at", { ascending: false })
    .limit(1);
  const sub = data?.[0];
  if (!sub) return null;
  if (sub.expires_at && new Date(sub.expires_at).getTime() < Date.now()) return null;
  return sub;
}

/** Legt ein VIP-Abo an oder verlängert es um die eingestellte Laufzeit. */
export async function startOrRenewSubscription(
  db: any,
  tgUserId: string,
  periodDays: number,
  purchaseId: string | null,
) {
  const now = Date.now();
  const existing = (
    await db.from("subscriptions").select("*").eq("tg_user_id", tgUserId).eq("plan", "vip").limit(1)
  ).data?.[0];

  const base = existing?.expires_at && new Date(existing.expires_at).getTime() > now
    ? new Date(existing.expires_at).getTime()
    : now;
  const expires = periodDays > 0 ? new Date(base + periodDays * 86_400_000).toISOString() : null;

  if (existing) {
    await db
      .from("subscriptions")
      .update({
        status: "active",
        expires_at: expires,
        renewals: Number(existing.renewals ?? 0) + 1,
        last_reminder_at: null,
        last_purchase_id: purchaseId,
      })
      .eq("id", existing.id);
    return { ...existing, expires_at: expires, renewed: true };
  }

  const { data } = await db
    .from("subscriptions")
    .insert({ tg_user_id: tgUserId, plan: "vip", expires_at: expires, last_purchase_id: purchaseId })
    .select("*")
    .single();
  return { ...data, renewed: false };
}

/** Provisionssatz inkl. Staffel für besonders aktive Empfehler. */
export async function commissionPercent(db: any, referrerId: string | null, settings: any) {
  const base = Number(settings?.affiliate_percent ?? 20);
  if (!referrerId) return base;
  const threshold = Number(settings?.referral_tier_threshold ?? 5);
  const boosted = Number(settings?.referral_tier_percent ?? base);
  if (threshold <= 0 || boosted <= base) return base;
  const { count } = await db
    .from("purchases")
    .select("id", { count: "exact", head: true })
    .eq("referrer_id", referrerId)
    .eq("status", "paid");
  return Number(count ?? 0) >= threshold ? boosted : base;
}
