import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Circle, ShieldCheck, Bot, Users2, ArrowRight, RefreshCw } from "lucide-react";
import { DashLayout } from "@/components/DashLayout";
import { OpsPanel } from "@/components/OpsPanel";
import { ChatHealthPanel } from "@/components/ChatHealthPanel";
import { AuditLogPanel } from "@/components/AuditLogPanel";

import { Button } from "@/components/ui/button";
import { getAdminStatus, setupWebhook } from "@/lib/admin.functions";
import { useAdmin } from "@/lib/useAdmin";

export const Route = createFileRoute("/status")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "Status – Telegram Fan Funnel Studio" },
      {
        name: "description",
        content: "Aktueller Admin-Status, Bot-Verbindung und die nächsten Schritte für deinen Telegram-Verkaufsfunnel.",
      },
      { property: "og:title", content: "Status – Telegram Fan Funnel Studio" },
      { property: "og:description", content: "Admin-Status und nächste Schritte deiner Telegram-Bot-Kette." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StatusPage,
});

type Task = { label: string; done: boolean; hint: string; to: string };

function StatusCard({ icon: Icon, label, ok, detail }: { icon: any; label: string; ok: boolean | null; detail: string }) {
  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className="size-4 text-primary" />
      </div>
      <p className={`mt-3 font-display text-xl font-bold ${ok ? "" : "text-muted-foreground"}`}>
        {ok ? "Aktiv" : ok === false ? "Offen" : "Unbekannt"}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function StatusPage() {
  const { isAdmin } = useAdmin();
  const statusFn = useServerFn(getAdminStatus);
  const setupFn = useServerFn(setupWebhook);
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["admin-status"],
    queryFn: () => statusFn({ data: undefined as never }),
    enabled: isAdmin,
  });

  const setupHook = useMutation({
    mutationFn: () =>
      setupFn({
        data: { baseUrl: data?.settings?.app_base_url || window.location.origin },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-status"] }),
  });

  if (!isAdmin) {
    return (
      <DashLayout title="Status" subtitle="Dein Admin-Status auf einen Blick.">
        <div className="panel p-6">
          <h2 className="text-lg font-semibold">Kein Admin</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Dieses Konto hat keine Adminrechte. Sobald du Adminrechte übernimmst, erscheinen hier Status und nächste Schritte.
          </p>
        </div>
      </DashLayout>
    );
  }

  const s = data as any;
  const settings = s?.settings ?? {};
  const webhookActive = Boolean(s?.bot?.webhook);
  const groupsSet = Boolean(settings.free_group_url || settings.free_chat_id) && Boolean(settings.vip_group_url || settings.vip_chat_id);
  const tonSet = Boolean(settings.ton_wallet);
  const welcomeSet = Boolean(settings.welcome_message && settings.welcome_message.trim());

  const tasks: Task[] = [
    {
      label: "Bot verbinden & Webhook einrichten",
      done: webhookActive,
      hint: webhookActive ? `Webhook aktiv: ${s.bot.webhook}` : "Richte den Telegram-Webhook unter Bot-Setup ein.",
      to: "/einstellungen",
    },
    {
      label: "Gratis- und VIP-Gruppe hinterlegen",
      done: groupsSet,
      hint: groupsSet ? "Gruppen-Links und Chat-IDs sind gesetzt." : "Trage Free-/VIP-Gruppe (URL + Chat-ID) ein, damit der Bot weiterleiten kann.",
      to: "/einstellungen",
    },
    {
      label: "Ersten digitalen Inhalt anlegen",
      done: (s?.counts.products ?? 0) > 0,
      hint: (s?.counts.products ?? 0) > 0 ? `${s.counts.products} Inhalte vorhanden.` : "Ohne Inhalte gibt es nichts zu verkaufen.",
      to: "/produkte",
    },
    {
      label: "TON-Wallet hinterlegen (optional)",
      done: tonSet,
      hint: tonSet ? "TON-Zahlungen möglich." : "Optional: Wallet für TON-Zahlungen eintragen.",
      to: "/einstellungen",
    },
    {
      label: "Willkommensnachricht prüfen",
      done: welcomeSet,
      hint: welcomeSet ? "Nachricht gesetzt." : "Setze eine Begrüßung für neue Fans.",
      to: "/einstellungen",
    },
    {
      label: "Funnel testen – erster Verkauf",
      done: (s?.counts.purchases ?? 0) > 0,
      hint: (s?.counts.purchases ?? 0) > 0 ? `${s.counts.purchases} Käufe verbucht.` : "Sobald der erste Kauf da ist, siehst du ihn unter Bestellungen.",
      to: "/bestellungen",
    },
  ];

  return (
    <DashLayout title="Status" subtitle="Admin-Status, Bot-Verbindung und die nächsten Schritte.">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatusCard
          icon={ShieldCheck}
          label="Admin"
          ok={Boolean(s?.admin?.isAdmin)}
          detail={s ? `${s.account.email}${s.admin.since ? ` · seit ${new Date(s.admin.since).toLocaleDateString("de-DE")}` : ""}` : "Lädt…"}
        />
        <StatusCard
          icon={Bot}
          label="Telegram-Bot"
          ok={Boolean(s?.bot?.username)}
          detail={s?.bot?.username ? `@${s.bot.username}${webhookActive ? " · Webhook aktiv" : " · Webhook fehlt"}` : "Nicht verbunden"}
        />
        <StatusCard
          icon={Users2}
          label="Funnel-Gruppen"
          ok={groupsSet}
          detail={groupsSet ? "Free- und VIP-Gruppe konfiguriert" : "Gruppen noch nicht eingetragen"}
        />
        <StatusCard
          icon={Users2}
          label="Fans im Bot"
          ok={(s?.counts.fans ?? 0) > 0}
          detail={`${s?.counts.fans ?? 0} Fans · ${s?.counts.purchases ?? 0} Käufe · ${s?.counts.leads ?? 0} Leads`}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="panel p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Nächste Schritte</h2>
            <button
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => qc.invalidateQueries({ queryKey: ["admin-status"] })}
            >
              <RefreshCw className="size-3" /> Aktualisieren
            </button>
          </div>
          <ul className="mt-4 divide-y divide-border">
            {tasks.map((t) => (
              <li key={t.label} className="flex items-center gap-3 py-3">
                {t.done ? (
                  <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />
                ) : (
                  <Circle className="size-5 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${t.done ? "text-muted-foreground line-through" : ""}`}>{t.label}</p>
                  <p className="truncate text-xs text-muted-foreground">{t.hint}</p>
                </div>
                {!t.done ? (
                  <Link to={t.to} className="flex shrink-0 items-center gap-1 text-sm text-primary hover:underline">
                    Erledigen <ArrowRight className="size-3.5" />
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </div>

        <div className="panel p-6">
          <h2 className="text-lg font-semibold">Schnellaktion</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Verbinde den Bot mit der aktuellen App-Adresse. Danach können Fans den Funnel direkt in Telegram starten.
          </p>
          <Button
            className="mt-4"
            disabled={setupHook.isPending}
            onClick={() => setupHook.mutate()}
          >
            {setupHook.isPending ? "Wird eingerichtet…" : "Webhook einrichten"}
          </Button>
          {webhookActive ? (
            <p className="mt-3 break-all text-xs text-muted-foreground">Aktuell: {s.bot.webhook}</p>
          ) : null}
        </div>
      </div>

      <ChatHealthPanel enabled={isAdmin} />
      <OpsPanel enabled={isAdmin} />
      <AuditLogPanel enabled={isAdmin} />
    </DashLayout>

  );
}
