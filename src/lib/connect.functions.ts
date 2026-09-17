import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Verbindungszustand aller Plattformen für den Assistenten. */
export const getPlatformOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { roleOfUser } = await import("@/lib/auth-context.server");
    const role = await roleOfUser(context.supabase, context.userId);
    if (!role) throw new Error("Forbidden");
    const { data: telegramStatus, error: telegramError } = await context.supabase.functions.invoke("telegram-admin", { body: { action: "verify" } });
    if (telegramError) throw new Error(telegramError.message);
    const { readPlatformOverview } = await import("@/lib/connect.server");
    return { role, platforms: await readPlatformOverview(context.supabase, telegramStatus) };
  });

/** Slack-Kanal verbinden: Test senden und als Empfänger speichern. */
export const connectSlack = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        url: z.string().url().startsWith("https://hooks.slack.com/"),
        label: z.string().min(1).max(80).default("Slack"),
        sendTest: z.boolean().default(true),
      })
      .parse(d ?? {}),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data }) => {
    const { requireCallerRole } = await import("@/lib/auth-context.server");
    const { db } = await requireCallerRole("admin");
    const { enforceRateLimit } = await import("@/lib/security.server");
    await enforceRateLimit(db, "connect_slack", "admin", 20, 600_000);
    const { connectSlackWebhook } = await import("@/lib/connect.server");
    return connectSlackWebhook(db, data.url, data.label, data.sendTest);
  });
