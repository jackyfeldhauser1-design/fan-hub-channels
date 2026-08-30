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

/** Übersicht: Abos, Rabattcodes, offene Rechnungen und Umsatz der letzten 30 Tage. */
export const getSalesOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db, role } = await requireRole(context, "viewer");
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();

    const [{ data: subs }, { data: codes }, { data: intents }, { data: purchases }] = await Promise.all([
      db
        .from("subscriptions")
        .select("id, plan, status, expires_at, renewals, started_at, tg_users(username, first_name, telegram_id)")
        .order("expires_at", { ascending: true })
        .limit(200),
      db.from("discount_codes").select("*").order("created_at", { ascending: false }).limit(100),
      db
        .from("invoice_intents")
        .select("id, title, amount_stars, paid, reminded_at, created_at")
        .eq("paid", false)
        .order("created_at", { ascending: false })
        .limit(100),
      db
        .from("purchases")
        .select("amount_stars, created_at, title_snapshot")
        .eq("status", "paid")
        .gte("created_at", since)
        .limit(1000),
    ]);

    const paid = purchases ?? [];
    const byDay: Record<string, number> = {};
    for (const p of paid) {
      const day = String(p.created_at).slice(0, 10);
      byDay[day] = (byDay[day] ?? 0) + Number(p.amount_stars ?? 0);
    }
    const active = (subs ?? []).filter(
      (s: any) => s.status === "active" && (!s.expires_at || new Date(s.expires_at).getTime() > Date.now()),
    );

    return {
      role,
      subscriptions: subs ?? [],
      activeSubs: active.length,
      codes: codes ?? [],
      openInvoices: intents ?? [],
      revenue30: paid.reduce((a: number, p: any) => a + Number(p.amount_stars ?? 0), 0),
      sales30: paid.length,
      byDay: Object.entries(byDay)
        .sort()
        .map(([day, stars]) => ({ day, stars })),
    };
  });

const codeSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(3).max(24),
  label: z.string().max(80).default(""),
  percent_off: z.number().int().min(0).max(100).default(0),
  stars_off: z.number().int().min(0).max(100000).default(0),
  max_uses: z.number().int().min(0).max(100000).default(0),
  once_per_fan: z.boolean().default(true),
  active: z.boolean().default(true),
  expires_at: z.string().nullable().default(null),
});

/** Rabattcode anlegen oder aktualisieren. */
export const saveDiscountCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => codeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { db } = await requireRole(context, "admin");
    const row = { ...data, code: data.code.trim().toUpperCase(), updated_at: new Date().toISOString() };
    if (data.id) {
      const { id, ...rest } = row;
      const { error } = await db.from("discount_codes").update(rest).eq("id", id);
      if (error) throw new Error(error.message);
      return { ok: true, id };
    }
    const { data: created, error } = await db.from("discount_codes").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, id: created.id };
  });

/** Rabattcode löschen. */
export const deleteDiscountCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { db } = await requireRole(context, "admin");
    const { error } = await db.from("discount_codes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Abo manuell verlängern oder beenden. */
export const updateSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), action: z.enum(["extend", "cancel"]), days: z.number().int().min(1).max(365).default(30) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { db } = await requireRole(context, "admin");
    if (data.action === "cancel") {
      await db.from("subscriptions").update({ status: "cancelled" }).eq("id", data.id);
      return { ok: true };
    }
    const { data: sub } = await db.from("subscriptions").select("expires_at").eq("id", data.id).maybeSingle();
    const base = sub?.expires_at && new Date(sub.expires_at).getTime() > Date.now()
      ? new Date(sub.expires_at).getTime()
      : Date.now();
    await db
      .from("subscriptions")
      .update({ status: "active", expires_at: new Date(base + data.days * 86_400_000).toISOString() })
      .eq("id", data.id);
    return { ok: true };
  });
