import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/notifications/retry")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { processRetryQueue } = await import("@/lib/notify.server");
        const result = await processRetryQueue(supabaseAdmin as any, 50);
        return Response.json({ ok: true, ...result });
      },
    },
  },
});
