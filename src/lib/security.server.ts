import { createHash } from "crypto";

/**
 * Serverseitige Schutzmechanismen: Rate-Limits, Admin-Audit-Log und
 * Replay-Schutz für eingehende Telegram-Updates.
 * Läuft ausschließlich mit dem privilegierten Service-Client.
 */

export type RateResult = { allowed: boolean; used: number; max: number; retryAfterSec: number };

/** Zählt Aktionen pro Schlüssel im Zeitfenster und blockt bei Überschreitung. */
export async function rateLimit(
  db: any,
  bucket: string,
  subject: string,
  max: number,
  windowMs: number,
): Promise<RateResult> {
  const since = new Date(Date.now() - windowMs).toISOString();
  const key = String(subject || "anonymous").slice(0, 200);

  const { count } = await db
    .from("rate_limits")
    .select("id", { count: "exact", head: true })
    .eq("bucket", bucket)
    .eq("subject", key)
    .gte("created_at", since);

  const used = count ?? 0;
  if (used >= max) {
    return { allowed: false, used, max, retryAfterSec: Math.ceil(windowMs / 1000) };
  }

  await db.from("rate_limits").insert({ bucket, subject: key });
  // Alte Einträge gelegentlich aufräumen.
  if (Math.random() < 0.05) {
    await db.from("rate_limits").delete().lt("created_at", new Date(Date.now() - 86_400_000).toISOString());
  }
  return { allowed: true, used: used + 1, max, retryAfterSec: 0 };
}

/** Wie rateLimit, wirft aber direkt eine verständliche Fehlermeldung. */
export async function enforceRateLimit(
  db: any,
  bucket: string,
  subject: string,
  max: number,
  windowMs: number,
) {
  const res = await rateLimit(db, bucket, subject, max, windowMs);
  if (!res.allowed) {
    throw new Error(
      `Zu viele Anfragen (${bucket}). Bitte in ${Math.ceil(res.retryAfterSec / 60)} Minute(n) erneut versuchen.`,
    );
  }
  return res;
}

export type AuditEntry = {
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  target?: string | null;
  chatId?: string | null;
  status?: "ok" | "warn" | "error";
  detail?: string | null;
  meta?: Record<string, unknown>;
};

/** Schreibt einen Eintrag ins Admin-Audit-Log (Prüfungen, Testposts, Statusänderungen). */
export async function auditLog(db: any, entry: AuditEntry) {
  await db.from("admin_audit").insert({
    actor_id: entry.actorId ?? null,
    actor_email: entry.actorEmail ?? null,
    action: entry.action,
    target: entry.target ?? null,
    chat_id: entry.chatId ? String(entry.chatId).slice(0, 64) : null,
    status: entry.status ?? "ok",
    detail: (entry.detail ?? "").slice(0, 500),
    meta: entry.meta ?? {},
  });
}

/**
 * Vergleicht den aktuellen Mitgliedschafts-/Postingstatus eines Chats mit dem
 * zuletzt protokollierten Stand und schreibt bei Abweichung einen Audit-Eintrag.
 */
export async function auditMembershipChange(
  db: any,
  actor: { id?: string | null; email?: string | null },
  chat: { chatId: string; label: string; reachable: boolean; canPost: boolean },
) {
  if (!chat.chatId) return false;
  const { data: last } = await db
    .from("admin_audit")
    .select("meta")
    .eq("action", "chat_membership")
    .eq("chat_id", chat.chatId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const prev = (last?.meta ?? {}) as { reachable?: boolean; canPost?: boolean };
  const changed = prev.reachable !== chat.reachable || prev.canPost !== chat.canPost;
  if (!changed) return false;

  await auditLog(db, {
    actorId: actor.id ?? null,
    actorEmail: actor.email ?? null,
    action: "chat_membership",
    target: chat.label,
    chatId: chat.chatId,
    status: chat.reachable && chat.canPost ? "ok" : "warn",
    detail:
      last
        ? `Status geändert: erreichbar ${prev.reachable ? "ja" : "nein"} → ${chat.reachable ? "ja" : "nein"}, posten ${prev.canPost ? "ja" : "nein"} → ${chat.canPost ? "ja" : "nein"}`
        : `Erster Status: erreichbar ${chat.reachable ? "ja" : "nein"}, posten ${chat.canPost ? "ja" : "nein"}`,
    meta: { reachable: chat.reachable, canPost: chat.canPost },
  });
  return true;
}

/**
 * Replay-Schutz für Telegram-Webhooks: verwirft doppelte update_id und zu alte
 * Updates. Gibt true zurück, wenn das Update verarbeitet werden darf.
 */
export async function acceptTelegramUpdate(
  db: any,
  update: any,
  maxAgeSec = 900,
): Promise<{ accept: boolean; reason: string }> {
  const updateId = update?.update_id;
  if (typeof updateId !== "number") return { accept: false, reason: "missing update_id" };

  const eventDate: number | undefined =
    update.message?.date ?? update.edited_message?.date ?? update.callback_query?.message?.date;
  if (typeof eventDate === "number") {
    const ageSec = Math.floor(Date.now() / 1000) - eventDate;
    if (ageSec > maxAgeSec) return { accept: false, reason: `stale update (${ageSec}s)` };
  }

  const { data: existing } = await db
    .from("telegram_updates")
    .select("update_id")
    .eq("update_id", updateId)
    .maybeSingle();
  if (existing) return { accept: false, reason: "duplicate update_id" };

  return { accept: true, reason: "" };
}

export function hashSubject(value: string) {
  return createHash("sha256").update(`subj:${value}`).digest("hex").slice(0, 32);
}
