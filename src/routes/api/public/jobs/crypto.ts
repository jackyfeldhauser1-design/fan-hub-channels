import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "node:crypto";

export const Route = createFileRoute("/api/public/jobs/crypto")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-cron-token");
        if (!token) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const { data: settings, error } = await db
          .from("bot_settings")
          .select("*")
          .eq("id", true)
          .maybeSingle();
        if (error) return Response.json({ ok: false }, { status: 503 });

        const tokenSettings = settings as (typeof settings & { cart_recovery_token_hash?: string });
        const expected = Buffer.from(tokenSettings?.cart_recovery_token_hash ?? "", "hex");
        const actual = createHash("sha256").update(token).digest();
        if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { verifyPendingCrypto } = await import("@/lib/crypto-verification.server");
        const result = await verifyPendingCrypto(db, settings);
        const ok = result.failed === 0;
        await db.from("job_runs").insert({
          job: "crypto",
          ok,
          processed: result.checked,
          sent: result.delivered,
          failed: result.failed,
          detail: `${result.matched} matched`,
        });
        return Response.json({ ok, ...result }, { status: ok ? 200 : 502 });
      },
    },
  },
});
