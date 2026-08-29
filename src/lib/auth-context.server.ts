/**
 * Einheitliche Auth-Auswertung für Server-Funktionen.
 *
 * Ziel: Ein Aufruf ohne Authorization-Header darf niemals einen Blank Screen
 * verursachen. Statt eines geworfenen 401 liefert `resolveCaller()` einen
 * klaren, reproduzierbaren Status. Wer wirklich Schutz braucht, ruft
 * `requireCallerRole()` – dort wird bewusst geworfen.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getRequestHeader } from "@tanstack/react-start/server";

export type TeamRole = "admin" | "operator" | "viewer";
export const ROLE_RANK: Record<TeamRole, number> = { viewer: 1, operator: 2, admin: 3 };

export type Caller =
  | { authenticated: false; userId: null; role: null; supabase: null }
  | { authenticated: true; userId: string; role: TeamRole | null; supabase: SupabaseClient };

/** Liest den Bearer-Token der Anfrage und ermittelt Nutzer + höchste Rolle. */
export async function resolveCaller(): Promise<Caller> {
  const anon: Caller = { authenticated: false, userId: null, role: null, supabase: null };
  let auth: string | undefined;
  try {
    auth = getRequestHeader("authorization") ?? undefined;
  } catch {
    return anon;
  }
  if (!auth?.startsWith("Bearer ")) return anon;

  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return anon;

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: auth } },
  });

  const { data, error } = await supabase.auth.getUser();
  const userId = error ? null : data.user?.id ?? null;
  if (!userId) return anon;

  return { authenticated: true, userId, role: await roleOfUser(supabase, userId), supabase };
}

/** Höchste Rolle des Nutzers (RLS erlaubt nur eigene Rollen zu lesen). */
export async function roleOfUser(supabase: SupabaseClient, userId: string): Promise<TeamRole | null> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = ((data ?? []) as { role: string }[])
    .map((r) => r.role)
    .filter((r): r is TeamRole => r in ROLE_RANK);
  if (!roles.length) return null;
  return roles.sort((a, b) => ROLE_RANK[b] - ROLE_RANK[a])[0]!;
}

/** Wirft bei fehlender Anmeldung bzw. zu niedriger Rolle; liefert sonst den Admin-Client. */
export async function requireCallerRole(min: TeamRole) {
  const caller = await resolveCaller();
  if (!caller.authenticated) throw new Error("Unauthorized");
  if (!caller.role || ROLE_RANK[caller.role] < ROLE_RANK[min]) throw new Error("Forbidden");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { db: supabaseAdmin as never, role: caller.role, userId: caller.userId, supabase: caller.supabase };
}
