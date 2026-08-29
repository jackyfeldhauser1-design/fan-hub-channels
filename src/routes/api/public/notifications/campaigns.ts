import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/notifications/campaigns")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { processDueCampaigns } = await import("@/lib/notify.server");
        const result = await processDueCampaigns(supabaseAdmin as any);
        return Response.json({ ok: true, ...result });
      },
    },
  },
});
