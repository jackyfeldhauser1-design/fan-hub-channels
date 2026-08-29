import { createFileRoute } from "@tanstack/react-router";
import { authorizeCronRequest } from "@/lib/cron-token.server";

export const Route = createFileRoute("/api/public/notifications/campaigns")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authorizeCronRequest(request);
        if (unauthorized) return unauthorized;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { processDueCampaigns } = await import("@/lib/notify.server");
        const result = await processDueCampaigns(supabaseAdmin as any);
        return Response.json({ ok: true, ...result });
      },
    },
  },
});
