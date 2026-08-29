import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { DashLayout } from "@/components/DashLayout";
import { useAdmin } from "@/lib/useAdmin";
import {
  getNotificationAnalytics,
  listCampaignConfig,
  saveTemplate,
  previewTemplate,
  saveCampaign,
  deleteCampaign,
  runCampaignNow,
  saveWebhook,
  deleteWebhook,
  testWebhook,
} from "@/lib/campaigns.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/kampagnen")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "Kampagnen & Analytics – Telegram Fan Funnel Studio" },
      {
        name: "description",
        content: "Öffnungen, Klicks und Käufe pro Benachrichtigung auswerten, Vorlagen anpassen und Kampagnen planen.",
      },
      { property: "og:title", content: "Kampagnen & Analytics – Telegram Fan Funnel Studio" },
      { property: "og:description", content: "Benachrichtigungs-Analytics, Vorlagen-Editor, Kampagnenplanung und Webhooks." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CampaignsPage,
});

const SEGMENTS = [
  { value: "all", label: "Alle Zugänge" },
  { value: "expiring", label: "Läuft in 72 h ab" },
  { value: "expired", label: "Bereits abgelaufen" },
  { value: "unused", label: "Nie geöffnet" },
  { value: "revoked", label: "Gesperrt" },
];

const WEBHOOK_EVENTS = ["delivery.sent", "delivery.failed", "test.ping"];

function Kpi({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="panel p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function CampaignsPage() {
  const qc = useQueryClient();
  const { isAdmin, canOperate } = useAdmin();
  const analyticsFn = useServerFn(getNotificationAnalytics);
  const configFn = useServerFn(listCampaignConfig);
  const saveTemplateFn = useServerFn(saveTemplate);
  const previewFn = useServerFn(previewTemplate);
  const saveCampaignFn = useServerFn(saveCampaign);
  const deleteCampaignFn = useServerFn(deleteCampaign);
  const runCampaignFn = useServerFn(runCampaignNow);
  const saveWebhookFn = useServerFn(saveWebhook);
  const deleteWebhookFn = useServerFn(deleteWebhook);
  const testWebhookFn = useServerFn(testWebhook);

  const analytics = useQuery({
    queryKey: ["notify-analytics"],
    queryFn: () => analyticsFn({ data: undefined as never }),
    enabled: isAdmin,
  });
  const config = useQuery({
    queryKey: ["campaign-config"],
    queryFn: () => configFn({ data: undefined as never }),
    enabled: isAdmin,
  });

  const [tplKind, setTplKind] = useState("expiring");
  const [tplAudience, setTplAudience] = useState<"admin" | "user">("admin");
  const [tplBody, setTplBody] = useState("");
  const [tplLink, setTplLink] = useState("");
  const [preview, setPreview] = useState("");

  const [campaign, setCampaign] = useState<{
    id: string | null;
    name: string;
    kind: string;
    segment: string;
    audience: "admin" | "user";
    body: string;
    linkUrl: string;
    scheduledAt: string;
  }>({ id: null, name: "", kind: "expiring", segment: "expiring", audience: "user", body: "", linkUrl: "", scheduledAt: "" });

  const [hook, setHook] = useState<{ id: string | null; label: string; url: string; secret: string; events: string[] }>({
    id: null,
    label: "",
    url: "",
    secret: "",
    events: ["delivery.sent", "delivery.failed"],
  });

  const cfg = config.data as any;
  const stats = (analytics.data as any)?.overall;

  const loadTemplate = (kind: string, audience: "admin" | "user") => {
    setTplKind(kind);
    setTplAudience(audience);
    const existing = (cfg?.templates ?? []).find((t: any) => t.kind === kind && t.audience === audience);
    const fallback = cfg?.defaults?.[kind]?.[audience] ?? "";
    setTplBody(existing?.body ?? fallback ?? "");
    setTplLink(existing?.linkUrl ?? "");
    setPreview("");
  };

  if (!isAdmin) {
    return (
      <DashLayout title="Kampagnen" subtitle="Analytics, Vorlagen, Kampagnen und Webhooks">
        <p className="panel p-6 text-sm text-muted-foreground">Für diesen Bereich benötigst du Adminrechte.</p>
      </DashLayout>
    );
  }

  return (
    <DashLayout title="Kampagnen & Analytics" subtitle="Öffnungen, Klicks, Käufe – plus Vorlagen, Planung und Webhooks.">
      <Tabs defaultValue="analytics" className="space-y-4">
        <TabsList className="flex w-full flex-wrap">
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="templates">Vorlagen</TabsTrigger>
          <TabsTrigger value="campaigns">Kampagnen</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
        </TabsList>

        <TabsContent value="analytics" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Zugestellt" value={stats?.sent ?? 0} hint={`${stats?.total ?? 0} Sendungen (30 Tage)`} />
            <Kpi label="Öffnungen" value={stats?.opens ?? 0} hint={`${stats?.openRate ?? 0} % Öffnungsrate`} />
            <Kpi label="Klicks" value={stats?.clicks ?? 0} hint={`${stats?.clickRate ?? 0} % Klickrate`} />
            <Kpi label="Käufe" value={stats?.purchases ?? 0} hint={`⭐ ${stats?.stars ?? 0} Umsatz`} />
          </div>

          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-4 py-3">Alarmtyp</th>
                  <th className="px-4 py-3">Zugestellt</th>
                  <th className="px-4 py-3">Öffnungen</th>
                  <th className="px-4 py-3">Klicks</th>
                  <th className="px-4 py-3">Käufe</th>
                  <th className="px-4 py-3">Umsatz</th>
                </tr>
              </thead>
              <tbody>
                {((analytics.data as any)?.byKind ?? []).map((r: any) => (
                  <tr key={r.kind} className="border-b border-border/60">
                    <td className="px-4 py-3">{r.kind}</td>
                    <td className="px-4 py-3">{r.sent}</td>
                    <td className="px-4 py-3">
                      {r.opens} <span className="text-xs text-muted-foreground">({r.openRate} %)</span>
                    </td>
                    <td className="px-4 py-3">
                      {r.clicks} <span className="text-xs text-muted-foreground">({r.clickRate} %)</span>
                    </td>
                    <td className="px-4 py-3">{r.purchases}</td>
                    <td className="px-4 py-3 text-primary">⭐ {r.stars}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-4 py-3">Kanal</th>
                  <th className="px-4 py-3">Zugestellt</th>
                  <th className="px-4 py-3">Klicks</th>
                  <th className="px-4 py-3">Käufe</th>
                </tr>
              </thead>
              <tbody>
                {((analytics.data as any)?.byChannel ?? []).map((r: any) => (
                  <tr key={r.channel} className="border-b border-border/60">
                    <td className="px-4 py-3">{r.channel}</td>
                    <td className="px-4 py-3">{r.sent}</td>
                    <td className="px-4 py-3">{r.clicks}</td>
                    <td className="px-4 py-3">{r.purchases}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="templates" className="space-y-4">
          <div className="panel space-y-3 p-4">
            <div className="flex flex-wrap gap-2">
              {(cfg?.kinds ?? []).map((k: any) => (
                <Button
                  key={k.kind}
                  size="sm"
                  variant={tplKind === k.kind ? "default" : "outline"}
                  onClick={() => loadTemplate(k.kind, tplAudience)}
                >
                  {k.label}
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              {(["admin", "user"] as const).map((a) => (
                <Button
                  key={a}
                  size="sm"
                  variant={tplAudience === a ? "default" : "outline"}
                  onClick={() => loadTemplate(tplKind, a)}
                >
                  {a === "admin" ? "Team-Nachricht" : "Fan-Nachricht"}
                </Button>
              ))}
            </div>
            <Textarea rows={7} value={tplBody} onChange={(e) => setTplBody(e.target.value)} placeholder="Nachrichtentext mit {fan}, {inhalt}, {ticket}, {ablauf}, {grund}" />
            <Input value={tplLink} onChange={(e) => setTplLink(e.target.value)} placeholder="Ziel-Link für den Klick-Tracker (optional, https://…)" inputMode="url" />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={async () => {
                  const res: any = await previewFn({ data: { body: tplBody } });
                  setPreview(res.text);
                }}
              >
                Vorschau
              </Button>
              <Button
                onClick={async () => {
                  try {
                    await saveTemplateFn({
                      data: { kind: tplKind as any, audience: tplAudience, body: tplBody, linkUrl: tplLink, active: true },
                    });
                    toast.success("Vorlage gespeichert");
                    qc.invalidateQueries({ queryKey: ["campaign-config"] });
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Fehlgeschlagen");
                  }
                }}
              >
                Vorlage speichern
              </Button>
            </div>
            {preview ? <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">{preview}</pre> : null}
            <div className="text-xs text-muted-foreground">
              {(cfg?.variables ?? []).map((v: any) => (
                <p key={v.key}>
                  <span className="font-mono">{v.label}</span> – {v.source}
                </p>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="campaigns" className="space-y-4">
          <div className="panel grid gap-3 p-4 sm:grid-cols-2">
            <Input placeholder="Name der Kampagne" value={campaign.name} onChange={(e) => setCampaign({ ...campaign, name: e.target.value })} />
            <select
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
              value={campaign.segment}
              onChange={(e) => setCampaign({ ...campaign, segment: e.target.value })}
            >
              {SEGMENTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
              value={campaign.kind}
              onChange={(e) => setCampaign({ ...campaign, kind: e.target.value })}
            >
              {(cfg?.kinds ?? []).map((k: any) => (
                <option key={k.kind} value={k.kind}>
                  {k.label}
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
              value={campaign.audience}
              onChange={(e) => setCampaign({ ...campaign, audience: e.target.value as "admin" | "user" })}
            >
              <option value="user">An Fans</option>
              <option value="admin">An Admin-Chat</option>
            </select>
            <Textarea
              className="sm:col-span-2"
              rows={5}
              placeholder="Nachrichtentext mit Platzhaltern"
              value={campaign.body}
              onChange={(e) => setCampaign({ ...campaign, body: e.target.value })}
            />
            <Input placeholder="Ziel-Link (optional)" value={campaign.linkUrl} onChange={(e) => setCampaign({ ...campaign, linkUrl: e.target.value })} />
            <Input
              type="datetime-local"
              value={campaign.scheduledAt}
              onChange={(e) => setCampaign({ ...campaign, scheduledAt: e.target.value })}
            />
            <div className="flex gap-2 sm:col-span-2">
              <Button
                onClick={async () => {
                  try {
                    await saveCampaignFn({
                      data: {
                        id: campaign.id,
                        name: campaign.name,
                        kind: campaign.kind as any,
                        segment: campaign.segment as any,
                        audience: campaign.audience,
                        body: campaign.body,
                        linkUrl: campaign.linkUrl,
                        scheduledAt: campaign.scheduledAt ? new Date(campaign.scheduledAt).toISOString() : null,
                      },
                    });
                    toast.success(campaign.scheduledAt ? "Kampagne geplant" : "Entwurf gespeichert");
                    setCampaign({ ...campaign, id: null, name: "", body: "", linkUrl: "", scheduledAt: "" });
                    qc.invalidateQueries({ queryKey: ["campaign-config"] });
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Fehlgeschlagen");
                  }
                }}
              >
                Speichern
              </Button>
            </div>
          </div>

          <div className="grid gap-3">
            {(cfg?.campaigns ?? []).map((c: any) => (
              <div key={c.id} className="panel p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="font-medium">{c.name}</h2>
                    <p className="text-xs text-muted-foreground">
                      {c.segment} · {c.audience === "user" ? "Fans" : "Admin"} ·{" "}
                      {c.scheduledAt ? new Date(c.scheduledAt).toLocaleString("de-DE") : "ohne Termin"} · {c.sentCount ?? 0} gesendet
                    </p>
                  </div>
                  <Badge variant={c.status === "sent" ? "default" : "secondary"}>{c.status}</Badge>
                </div>
                {c.lastError ? <p className="mt-2 text-xs text-destructive">{c.lastError}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setCampaign({
                        id: c.id,
                        name: c.name,
                        kind: c.kind,
                        segment: c.segment,
                        audience: c.audience,
                        body: c.body ?? "",
                        linkUrl: c.linkUrl ?? "",
                        scheduledAt: c.scheduledAt ? new Date(c.scheduledAt).toISOString().slice(0, 16) : "",
                      })
                    }
                  >
                    Bearbeiten
                  </Button>
                  <Button
                    size="sm"
                    disabled={!canOperate}
                    onClick={async () => {
                      try {
                        const res: any = await runCampaignFn({ data: { id: c.id } });
                        toast.success(`${res.sent} von ${res.total} Nachrichten versendet`);
                        qc.invalidateQueries({ queryKey: ["campaign-config"] });
                        qc.invalidateQueries({ queryKey: ["notify-analytics"] });
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Fehlgeschlagen");
                      }
                    }}
                  >
                    Jetzt senden
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await deleteCampaignFn({ data: { id: c.id } });
                      qc.invalidateQueries({ queryKey: ["campaign-config"] });
                    }}
                  >
                    Löschen
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="webhooks" className="space-y-4">
          <div className="panel grid gap-3 p-4 sm:grid-cols-2">
            <Input placeholder="Bezeichnung" value={hook.label} onChange={(e) => setHook({ ...hook, label: e.target.value })} />
            <Input placeholder="https://dein-system.example/hook" value={hook.url} onChange={(e) => setHook({ ...hook, url: e.target.value })} inputMode="url" />
            <Input placeholder="Signatur-Secret (optional)" value={hook.secret} onChange={(e) => setHook({ ...hook, secret: e.target.value })} />
            <div className="flex flex-wrap items-center gap-4">
              {WEBHOOK_EVENTS.map((ev) => (
                <div key={ev} className="flex items-center gap-2">
                  <Switch
                    checked={hook.events.includes(ev)}
                    onCheckedChange={(v) =>
                      setHook({ ...hook, events: v ? [...hook.events, ev] : hook.events.filter((x) => x !== ev) })
                    }
                  />
                  <Label className="text-xs">{ev}</Label>
                </div>
              ))}
            </div>
            <div className="sm:col-span-2">
              <Button
                onClick={async () => {
                  try {
                    await saveWebhookFn({
                      data: { id: hook.id, label: hook.label, url: hook.url, secret: hook.secret, events: hook.events, active: true },
                    });
                    toast.success("Webhook gespeichert");
                    setHook({ id: null, label: "", url: "", secret: "", events: ["delivery.sent", "delivery.failed"] });
                    qc.invalidateQueries({ queryKey: ["campaign-config"] });
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Fehlgeschlagen");
                  }
                }}
              >
                Speichern
              </Button>
            </div>
          </div>

          <div className="grid gap-3">
            {(cfg?.webhooks ?? []).map((w: any) => (
              <div key={w.id} className="panel p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="font-medium">{w.label}</h2>
                    <p className="break-all text-xs text-muted-foreground">{w.url}</p>
                    <p className="text-xs text-muted-foreground">
                      {(w.events ?? []).join(", ") || "alle Ereignisse"} ·{" "}
                      {w.lastCalledAt ? `zuletzt ${new Date(w.lastCalledAt).toLocaleString("de-DE")}` : "noch nie aufgerufen"}
                    </p>
                  </div>
                  <Badge variant={w.lastStatus?.startsWith("2") ? "default" : "secondary"}>{w.lastStatus || "—"}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const res: any = await testWebhookFn({ data: { id: w.id } });
                      toast.success(`Testaufruf: ${res.status || "—"}`);
                      qc.invalidateQueries({ queryKey: ["campaign-config"] });
                    }}
                  >
                    Test senden
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await deleteWebhookFn({ data: { id: w.id } });
                      qc.invalidateQueries({ queryKey: ["campaign-config"] });
                    }}
                  >
                    Löschen
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <AttributionPanel enabled={canRead} />
    </DashLayout>

  );
}
