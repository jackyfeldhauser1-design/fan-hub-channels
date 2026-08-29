import { createFileRoute } from "@tanstack/react-router";
import { authorizeCronRequest } from "@/lib/cron-token.server";

export const Route = createFileRoute("/api/public/notifications/campaigns")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authorizeCronRequest(request);
        if (unauthorized) return unauthorized;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as any;
        const { processDueCampaigns } = await import("@/lib/notify.server");
        const { processDueAds } = await import("@/lib/ads.server");
        try {
          const result = await processDueCampaigns(db);
          const ads = await processDueAds(db);
          await db.from("job_runs").insert({
            job: "notifications-campaigns",
            ok: true,
            processed: result.campaigns + ads.posts,
            sent: result.sent + ads.sent,
            failed: ads.failed,
          });
          return Response.json({ ok: true, ...result, ads });

        } catch (e) {
          const detail = (e instanceof Error ? e.message : String(e)).slice(0, 300);
          await db.from("job_runs").insert({ job: "notifications-campaigns", ok: false, detail });
          return Response.json({ ok: false, error: detail }, { status: 500 });
        }

      },
    },
  },
});
