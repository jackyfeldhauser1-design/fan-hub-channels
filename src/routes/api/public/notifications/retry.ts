import { createFileRoute } from "@tanstack/react-router";
import { authorizeCronRequest } from "@/lib/cron-token.server";

export const Route = createFileRoute("/api/public/notifications/retry")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authorizeCronRequest(request);
        if (unauthorized) return unauthorized;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as any;
        const { processRetryQueue } = await import("@/lib/notify.server");
        try {
          const result = await processRetryQueue(db, 50);
          await db.from("job_runs").insert({
            job: "notifications-retry",
            ok: true,
            processed: result.processed,
            sent: result.sent,
            failed: result.failed,
          });
          return Response.json({ ok: true, ...result });
        } catch (e) {
          const detail = (e instanceof Error ? e.message : String(e)).slice(0, 300);
          await db.from("job_runs").insert({ job: "notifications-retry", ok: false, detail });
          return Response.json({ ok: false, error: detail }, { status: 500 });
        }

      },
    },
  },
});
