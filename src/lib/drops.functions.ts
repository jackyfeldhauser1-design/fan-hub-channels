import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Alle verkaufbaren Einheiten inkl. Aktionspreis, Restmenge und Channel-Status. */
export const listDrops = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { requireCallerRole } = await import("@/lib/auth-context.server");
    const { db } = await requireCallerRole("viewer");
    const { readDrops } = await import("@/lib/drops.server");
    return readDrops(db);
  });

/** Aktionspreis, Aktionsende und Stückzahl-Limit speichern. */
export const saveDropPricing = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        kind: z.enum(["product", "folder"]),
        salePriceStars: z.number().int().min(0).max(1_000_000).default(0),
        saleUntil: z.string().datetime().nullable().default(null),
        stockLimit: z.number().int().min(0).max(1_000_000).default(0),
      })
      .parse(d),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data }) => {
    const { requireCallerRole } = await import("@/lib/auth-context.server");
    const { db } = await requireCallerRole("admin");
    const { writeDropPricing } = await import("@/lib/drops.server");
    return writeDropPricing(db, data);
  });

/** Drop in Ankündigungs- und/oder Trailer-Channel veröffentlichen. */
export const publishDrop = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        kind: z.enum(["product", "folder"]),
        targets: z.array(z.enum(["announce", "preview"])).min(1).default(["announce"]),
      })
      .parse(d),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { requireCallerRole } = await import("@/lib/auth-context.server");
    const { db } = await requireCallerRole("admin");
    const { enforceRateLimit } = await import("@/lib/security.server");
    await enforceRateLimit(db, "drop_publish", context.userId, 20, 3_600_000);
    const { publishDropPost } = await import("@/lib/drops.server");
    return publishDropPost(db, data, { id: context.userId, email: context.claims?.email ?? null });
  });

/** Betriebs-Gesundheit: Cron-Läufe, Fehler und Channel-Abdeckung. */
export const getHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { requireCallerRole } = await import("@/lib/auth-context.server");
    const { db } = await requireCallerRole("viewer");
    const { readHealth } = await import("@/lib/health.server");
    return readHealth(db);
  });
