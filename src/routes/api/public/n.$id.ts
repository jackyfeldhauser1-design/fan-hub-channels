import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "crypto";

/** Öffnungs-/Klick-Tracking für Benachrichtigungen und Weiterleitung zum Zielinhalt. */
export const Route = createFileRoute("/api/public/n/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const id = params.id;
        if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as any;

        const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
        const { rateLimit, hashSubject } = await import("@/lib/security.server");
        const gate = await rateLimit(db, "track_click", hashSubject(clientIp), 120, 600_000);
        if (!gate.allowed) return new Response("Too many requests", { status: 429, headers: { "Retry-After": String(gate.retryAfterSec) } });

        const { data: row } = await db
          .from("notification_deliveries")
          .select("id, campaign_id, open_count, click_count, opened_at")
          .eq("id", id)
          .maybeSingle();
        if (!row) return new Response("Not found", { status: 404 });

        const now = new Date().toISOString();
        await db
          .from("notification_deliveries")
          .update({
            opened_at: row.opened_at ?? now,
            clicked_at: now,
            open_count: (row.open_count ?? 0) + (row.opened_at ? 0 : 1),
            click_count: (row.click_count ?? 0) + 1,
          })
          .eq("id", id);

        const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
        await db.from("notification_events").insert({
          delivery_id: id,
          campaign_id: row.campaign_id,
          event: "click",
          detail: (request.headers.get("user-agent") ?? "").slice(0, 200),
          ip_hash: ip ? createHash("sha256").update(ip).digest("hex").slice(0, 32) : "",
        });

        const to = new URL(request.url).searchParams.get("to");
        if (to && /^https:\/\//i.test(to)) return Response.redirect(to, 302);

        const { data: settings } = await db.from("bot_settings").select("app_base_url").eq("id", true).maybeSingle();
        const base = String(settings?.app_base_url ?? "").replace(/\/$/, "");
        if (base) return Response.redirect(base, 302);
        return new Response("OK");
      },
    },
  },
});
