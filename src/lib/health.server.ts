/** Betriebsüberblick: Cron-Läufe, Zustellfehler und Channel-Abdeckung. */

export type HealthCheck = { key: string; label: string; ok: boolean; detail: string };

export async function readHealth(db: any) {
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();

  const [{ data: settings }, { data: runs }, { data: failed }, { count: queued }] = await Promise.all([
    db
      .from("bot_settings")
      .select("community_chat_id, shop_chat_id, control_chat_id, app_base_url")
      .eq("id", true)
      .maybeSingle(),
    db.from("job_runs").select("job, ok, processed, sent, failed, created_at").order("created_at", { ascending: false }).limit(50),
    db
      .from("notification_deliveries")
      .select("id, recipient_label, kind, channel, target, status, error, updated_at")
      .in("status", ["dead", "retrying"])
      .order("updated_at", { ascending: false })
      .limit(25),
    db.from("notification_deliveries").select("id", { count: "exact", head: true }).eq("status", "queued"),
  ]);

  const jobs = ["notifications_retry", "campaigns"].map((job) => {
    const last = ((runs ?? []) as any[]).find((r) => String(r.job).includes(job.split("_")[0]!));
    return {
      job,
      lastRunAt: last?.created_at ?? null,
      ok: Boolean(last?.ok),
      fresh: last ? new Date(last.created_at).toISOString() > dayAgo : false,
      processed: Number(last?.processed ?? 0),
    };
  });

  const chatKeys = ["community_chat_id", "shop_chat_id", "control_chat_id"];
  const chatsSet = chatKeys.filter((k) => settings?.[k]).length;

  const checks: HealthCheck[] = [
    {
      key: "chats",
      label: "Telegram-Ziele",
      ok: chatsSet >= 3,
      detail: `${chatsSet}/3 Ziele gesetzt (Community, Shop, Kontrollraum)`,
    },
    {
      key: "cron",
      label: "Geplante Jobs",
      ok: jobs.every((j) => j.fresh),
      detail: jobs.map((j) => `${j.job}: ${j.lastRunAt ? new Date(j.lastRunAt).toLocaleString("de-DE") : "kein Lauf"}`).join(" · "),
    },
    {
      key: "deliveries",
      label: "Zustellungen",
      ok: (failed ?? []).length === 0,
      detail: `${(failed ?? []).length} fehlerhaft, ${queued ?? 0} in Warteschlange`,
    },
    {
      key: "baseurl",
      label: "App-Adresse",
      ok: Boolean(settings?.app_base_url),
      detail: settings?.app_base_url || "nicht gesetzt",
    },
  ];

  return { checks, jobs, failures: (failed ?? []) as any[], score: checks.filter((c) => c.ok).length };
}
