import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Loader2, Slack, Webhook, Send } from "lucide-react";
import { DashLayout } from "@/components/DashLayout";
import { ConnectPanel } from "@/components/ConnectPanel";
import { GuidedSetupWizard } from "@/components/GuidedSetupWizard";
import { SetupToolsPanel } from "@/components/SetupToolsPanel";

import { useAdmin } from "@/lib/useAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getPlatformOverview, connectSlack } from "@/lib/connect.functions";

export const Route = createFileRoute("/verbinden")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "Plattformen verbinden – Telegram Fan Funnel Studio" },
      {
        name: "description",
        content:
          "Ein-Klick-Assistent: Telegram-Token prüfen, Webhook setzen, Chats automatisch zuordnen und weitere Kanäle wie Slack verbinden.",
      },
      { property: "og:title", content: "Plattformen verbinden – Telegram Fan Funnel Studio" },
      { property: "og:description", content: "Token, Webhook und Chat-Zuordnung in einem Schritt abschließen." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ConnectWizardPage,
});

function StatusRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-2 py-2">
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
      ) : (
        <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="break-all text-xs text-muted-foreground">{detail}</p>
      </div>
    </li>
  );
}

function ConnectWizardPage() {
  const { isAdmin } = useAdmin();
  const overviewFn = useServerFn(getPlatformOverview);
  const slackFn = useServerFn(connectSlack);
  const overview = useQuery({
    queryKey: ["platformOverview"],
    queryFn: () => overviewFn({ data: undefined as never }),
    enabled: isAdmin,
    retry: false,
  });

  const [slackUrl, setSlackUrl] = useState("");
  const [slackLabel, setSlackLabel] = useState("Slack Support");
  const slack = useMutation({
    mutationFn: () => slackFn({ data: { url: slackUrl, label: slackLabel, sendTest: true } }),
    onSuccess: () => {
      toast.success("Slack verbunden – Testnachricht gesendet");
      setSlackUrl("");
      overview.refetch();
    },
    onError: (e: any) => toast.error(e?.message ?? "Slack-Verbindung fehlgeschlagen"),
  });

  if (!isAdmin) {
    return (
      <DashLayout title="Plattformen verbinden">
        <p className="text-sm text-muted-foreground">Nur Administratoren können Verbindungen einrichten.</p>
      </DashLayout>
    );
  }

  const platforms = overview.data?.platforms ?? [];
  const telegram = platforms.find((p) => p.id === "telegram");
  const done = platforms.filter((p) => p.connected).length;

  return (
    <DashLayout
      title="Plattformen verbinden"
      subtitle="Token, Webhook und Chat-Zuordnung möglichst automatisch abschließen."
    >
      <div className="space-y-4">
        <div className="panel p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Fortschritt</h2>
              <p className="text-sm text-muted-foreground">
                {done} von {platforms.length || 3} Plattformen einsatzbereit
              </p>
            </div>
            <Button variant="secondary" onClick={() => overview.refetch()} disabled={overview.isFetching}>
              {overview.isFetching ? <Loader2 className="size-4 animate-spin" /> : "Neu prüfen"}
            </Button>
          </div>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${(done / Math.max(platforms.length, 1)) * 100}%` }}
            />
          </div>
        </div>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Schritt 1 · Telegram
          </h2>
          <GuidedSetupWizard />
          <SetupToolsPanel />
          <ConnectPanel
            defaultBaseUrl={typeof window !== "undefined" ? window.location.origin : ""}
            onConnected={() => overview.refetch()}
          />

          {telegram ? (
            <div className="panel p-6">
              <ul className="divide-y divide-border">
                {telegram.items.map((i, idx) => (
                  <StatusRow key={`${i.label}-${idx}`} ok={i.ok} label={i.label} detail={i.detail} />
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Schritt 2 · Slack</h2>
          <div className="panel space-y-4 p-6">
            <div className="flex items-center gap-2">
              <Slack className="size-4 text-primary" />
              <h3 className="text-lg font-semibold">Slack-Kanal für Alarme</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Incoming-Webhook-URL einfügen – wir senden sofort eine Testnachricht und legen den Kanal als Empfänger an.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Bezeichnung</Label>
                <Input value={slackLabel} onChange={(e) => setSlackLabel(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Webhook-URL</Label>
                <Input
                  value={slackUrl}
                  onChange={(e) => setSlackUrl(e.target.value)}
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="https://hooks.slack.com/services/…"
                />
              </div>
            </div>
            <Button
              className="gap-2"
              disabled={!slackUrl || slack.isPending}
              onClick={() => slack.mutate()}
            >
              {slack.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Verbinden & testen
            </Button>
            <ul className="divide-y divide-border">
              {(platforms.find((p) => p.id === "slack")?.items ?? []).map((i, idx) => (
                <StatusRow key={`slack-${idx}`} ok={i.ok} label={i.label} detail={i.detail} />
              ))}
            </ul>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Schritt 3 · Externe Systeme
          </h2>
          <div className="panel space-y-3 p-6">
            <div className="flex items-center gap-2">
              <Webhook className="size-4 text-primary" />
              <h3 className="text-lg font-semibold">Ausgehende Webhooks</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Ziele für Zustell- und Fehlerereignisse verwaltest du unter „Kampagnen“. Aktueller Stand:
            </p>
            <ul className="divide-y divide-border">
              {(platforms.find((p) => p.id === "webhook")?.items ?? []).map((i, idx) => (
                <StatusRow key={`hook-${idx}`} ok={i.ok} label={i.label} detail={i.detail} />
              ))}
            </ul>
          </div>
        </section>
      </div>
    </DashLayout>
  );
}
