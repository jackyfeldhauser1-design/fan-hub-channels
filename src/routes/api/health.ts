import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const checks: Record<string, unknown> = {
          app: "ok",
          timestamp: new Date().toISOString(),
          database: "unknown",
          telegram: "unknown",
        };
        let healthy = true;

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await (supabaseAdmin as any).from("bot_settings").select("id").eq("id", true).maybeSingle();
          checks.database = error ? "error" : "ok";
          if (error) healthy = false;
        } catch {
          checks.database = "error";
          healthy = false;
        }

        try {
          const { getBotToken } = await import("@/lib/telegram.server");
          const { token } = await getBotToken();
          checks.telegram = token || process.env["TELEGRAM_BOT_TOKEN"] ? "configured" : "missing";
          if (checks.telegram === "missing") healthy = false;
        } catch {
          checks.telegram = "error";
          healthy = false;
        }

        return Response.json(checks, {
          status: healthy ? 200 : 503,
          headers: { "Cache-Control": "no-store" },
        });
      },
    },
  },
});
