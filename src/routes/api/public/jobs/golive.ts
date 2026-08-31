import { createFileRoute } from "@tanstack/react-router";
import { authorizeCronRequest } from "@/lib/cron-token.server";

/** Täglicher Selbsttest: Bot, Webhook, Chats, Katalog und Medien – mit Alarm im Kontrollraum. */
export const Route = createFileRoute("/api/public/jobs/golive")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authorizeCronRequest(request);
        if (unauthorized) return unauthorized;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as any;
        const { buildGoLiveReport, repairWebhook } = await import("@/lib/setup.server");

        try {
          let report = await buildGoLiveReport(db);
          let repaired: string | null = null;

          const webhookBroken = report.failed.some((c: any) => /webhook/i.test(c.label));
          if (webhookBroken) {
            const fix = await repairWebhook(db);
            repaired = fix.detail;
            if (fix.ok) report = await buildGoLiveReport(db);
          }

          if (!report.ok) {
            const { data: settings } = await db
              .from("bot_settings")
              .select("control_chat_id")
              .eq("id", true)
              .maybeSingle();
            const control = String(settings?.control_chat_id ?? "").trim();
            if (control) {
              const { tgApi } = await import("@/lib/telegram.server");
              const lines = report.failed
                .slice(0, 10)
                .map((c: any) => `• <b>${c.label}</b> — ${String(c.detail).slice(0, 120)}`)
                .join("\n");
              await tgApi("sendMessage", {
                chat_id: control,
                text: `⚠️ <b>Tages-Check</b>\n${report.passed}/${report.total} Prüfungen bestanden${repaired ? `\nWebhook: ${repaired}` : ""}\n\n${lines}`,
                parse_mode: "HTML",
              }).catch(() => undefined);
            }
          }

          await db.from("job_runs").insert({
            job: "golive",
            ok: report.ok,
            processed: report.total,
            sent: report.passed,
            failed: report.total - report.passed,
            detail: (repaired ? `${repaired} · ` : "") + report.failed.map((c: any) => c.label).join(", ").slice(0, 400),
          });

          return Response.json({
            ok: report.ok,
            passed: report.passed,
            total: report.total,
            repaired,
            failed: report.failed.map((c: any) => ({ label: c.label, detail: c.detail })),
          });
        } catch (e) {
          const detail = (e instanceof Error ? e.message : String(e)).slice(0, 300);
          await db.from("job_runs").insert({ job: "golive", ok: false, detail });
          return Response.json({ ok: false, error: detail }, { status: 500 });
        }
      },
    },
  },
});
