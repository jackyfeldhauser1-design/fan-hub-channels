import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BellRing, Download, Plus, RefreshCw, Send, Trash2 } from "lucide-react";
import { DashLayout } from "@/components/DashLayout";
import { useAdmin } from "@/lib/useAdmin";
import {
  listNotificationCenter,
  saveRecipient,
  deleteRecipient,
  setRecipientPref,
  previewNotification,
  sendTestNotification,
  retryDelivery,
  exportDeliveriesCsv,
} from "@/lib/notifications.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/benachrichtigungen")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "Benachrichtigungen – Telegram Fan Funnel Studio" },
      {
        name: "description",
        content:
          "Empfänger verwalten, Alarme pro Empfänger an- und abschalten, Nachrichten vorab prüfen und Zustellstatus mit automatischer Wiederholung überwachen.",
      },
      { property: "og:title", content: "Benachrichtigungen – Telegram Fan Funnel Studio" },
      { property: "og:description", content: "Empfänger, Opt-in/Opt-out, Vorschau und Zustellprotokoll." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NotificationsPage,
});

const statusLabel: Record<string, string> = {
  queued: "in Warteschlange",
  sent: "gesendet",
  retrying: "Wiederholung",
  dead: "endgültig fehlgeschlagen",
  skipped_optout: "abgemeldet",
};

const statusTone: Record<string, string> = {
  sent: "bg-primary/15 text-primary",
  retrying: "bg-muted text-muted-foreground",
  dead: "bg-destructive/15 text-destructive",
  skipped_optout: "bg-muted text-muted-foreground",
  queued: "bg-muted text-muted-foreground",
};

const emptyForm = {
  id: undefined as string | undefined,
  label: "",
  channel: "telegram" as "telegram" | "email",
  chatId: "",
  email: "",
  fallbackChannel: null as "telegram" | "email" | null,
  fallbackTarget: "",
  active: true,
  isDefault: true,
};

function download(filename: string, content: string) {
  const blob = new Blob(["\ufeff" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function NotificationsPage() {
  const qc = useQueryClient();
  const { canRead, canOperate, isAdmin } = useAdmin();
  const listFn = useServerFn(listNotificationCenter);
  const saveFn = useServerFn(saveRecipient);
  const deleteFn = useServerFn(deleteRecipient);
  const prefFn = useServerFn(setRecipientPref);
  const previewFn = useServerFn(previewNotification);
  const testFn = useServerFn(sendTestNotification);
  const retryFn = useServerFn(retryDelivery);
  const exportFn = useServerFn(exportDeliveriesCsv);

  const [form, setForm] = useState(emptyForm);
  const [previewKind, setPreviewKind] = useState<string>("expired");
  const [previewRecipient, setPreviewRecipient] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("alle");

  const { data } = useQuery({
    queryKey: ["notification-center"],
    queryFn: () => listFn({ data: undefined as never }),
    enabled: canRead,
  });

  const recipients = data?.recipients ?? [];
  const kinds = data?.kinds ?? [];
  const prefs = data?.prefs ?? [];
  const stats = data?.stats;

  const preview = useQuery({
    queryKey: ["notification-preview", previewKind, previewRecipient],
    queryFn: () =>
      previewFn({
        data: {
          kind: previewKind as never,
          recipientId: previewRecipient || null,
          tokenId: null,
        },
      }),
    enabled: canRead,
  });

  const deliveries = useMemo(() => {
    const list = data?.deliveries ?? [];
    return statusFilter === "alle" ? list : list.filter((d: any) => d.status === statusFilter);
  }, [data, statusFilter]);

  const prefEnabled = (recipientId: string, kind: string) =>
    prefs.find((p: any) => p.recipientId === recipientId && p.kind === kind)?.enabled ?? true;

  async function save() {
    try {
      await saveFn({ data: form });
      toast.success("Empfänger gespeichert");
      setForm(emptyForm);
      qc.invalidateQueries({ queryKey: ["notification-center"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    }
  }

  async function togglePref(recipientId: string, kind: string, enabled: boolean) {
    try {
      await prefFn({ data: { recipientId, kind: kind as never, enabled } });
      qc.invalidateQueries({ queryKey: ["notification-center"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Änderung fehlgeschlagen");
    }
  }

  return (
    <DashLayout
      title="Benachrichtigungen"
      subtitle="Empfänger verwalten, Alarme pro Empfänger freigeben, Nachrichten vorab prüfen und jede Zustellung nachverfolgen."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Zustellungen", value: stats?.total ?? 0, hint: "letzte 300 Ereignisse" },
          { label: "Gesendet", value: stats?.sent ?? 0, hint: "erfolgreich zugestellt" },
          { label: "In Wiederholung", value: stats?.retrying ?? 0, hint: "automatischer Neuversuch läuft" },
          { label: "Fehlgeschlagen", value: stats?.dead ?? 0, hint: "nach 4 Versuchen aufgegeben" },
          { label: "Abgemeldet", value: stats?.skipped ?? 0, hint: "Empfänger hat Alarm deaktiviert" },
        ].map((k) => (
          <div key={k.label} className="panel p-5">
            <p className="text-sm text-muted-foreground">{k.label}</p>
            <p className="mt-1 text-3xl font-bold">{k.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{k.hint}</p>
          </div>
        ))}
      </div>

      <div className="panel mt-4 flex items-start gap-3 p-5 text-sm text-muted-foreground">
        <BellRing className="mt-0.5 size-5 shrink-0 text-primary" />
        Telegram ist der aktive Kanal. Schlägt ein Versand fehl, wird bis zu 4-mal wiederholt (nach 1, 5 und 15
        Minuten) und – falls hinterlegt – der Ersatzkanal genutzt. E-Mail lässt sich ergänzen, sobald eine eigene
        Absender-Domain eingerichtet ist.
      </div>

      {/* Empfänger */}
      <h2 className="mt-8 text-lg font-semibold">Empfänger</h2>
      <div className="panel mt-3 grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
        <div className="grid gap-1.5">
          <Label>Name</Label>
          <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="z. B. Support-Team" />
        </div>
        <div className="grid gap-1.5">
          <Label>Telegram-Chat-ID</Label>
          <Input
            value={form.chatId}
            onChange={(e) => setForm({ ...form, chatId: e.target.value })}
            placeholder="z. B. 123456789"
            inputMode="numeric"
          />
        </div>
        <div className="grid gap-1.5">
          <Label>E-Mail (optional, für später)</Label>
          <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="support@…" />
        </div>
        <div className="grid gap-1.5">
          <Label>Ersatz-Chat-ID (Fallback)</Label>
          <Input
            value={form.fallbackTarget}
            onChange={(e) =>
              setForm({ ...form, fallbackTarget: e.target.value, fallbackChannel: e.target.value ? "telegram" : null })
            }
            placeholder="zweite Telegram-ID"
            inputMode="numeric"
          />
        </div>
        <div className="flex items-center gap-3 pt-6">
          <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} id="active" />
          <Label htmlFor="active">aktiv</Label>
        </div>
        <div className="flex items-center gap-3 pt-6">
          <Switch checked={form.isDefault} onCheckedChange={(v) => setForm({ ...form, isDefault: v })} id="default" />
          <Label htmlFor="default">Standard-Empfänger</Label>
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <Button onClick={save} disabled={!isAdmin || !form.label}>
            <Plus className="mr-2 size-4" /> {form.id ? "Empfänger aktualisieren" : "Empfänger hinzufügen"}
          </Button>
          {form.id ? (
            <Button variant="ghost" className="ml-2" onClick={() => setForm(emptyForm)}>
              Abbrechen
            </Button>
          ) : null}
        </div>
      </div>

      {/* Opt-in/Opt-out Matrix */}
      <div className="panel mt-4 overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-4 py-3">Empfänger</th>
              {kinds.map((k: any) => (
                <th key={k.kind} className="px-4 py-3">
                  {k.label}
                </th>
              ))}
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {recipients.map((r: any) => (
              <tr key={r.id} className="border-b border-border/60">
                <td className="px-4 py-3">
                  <p className="font-medium">{r.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.channel === "email" ? r.email : r.chatId} {r.isDefault ? "· Standard" : ""}{" "}
                    {r.active ? "" : "· pausiert"}
                  </p>
                </td>
                {kinds.map((k: any) => (
                  <td key={k.kind} className="px-4 py-3">
                    <Switch
                      checked={prefEnabled(r.id, k.kind)}
                      disabled={!isAdmin}
                      onCheckedChange={(v) => togglePref(r.id, k.kind, v)}
                    />
                  </td>
                ))}
                <td className="px-4 py-3 text-right">
                  <Button size="sm" variant="ghost" onClick={() => setForm({ ...emptyForm, ...r, id: r.id })}>
                    Bearbeiten
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!isAdmin}
                    onClick={async () => {
                      await deleteFn({ data: { id: r.id } });
                      qc.invalidateQueries({ queryKey: ["notification-center"] });
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </td>
              </tr>
            ))}
            {recipients.length === 0 ? (
              <tr>
                <td colSpan={kinds.length + 2} className="px-4 py-8 text-center text-muted-foreground">
                  Noch keine Empfänger angelegt – Alarme gehen nur an den Admin-Chat aus dem Bot-Setup.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Vorschau */}
      <h2 className="mt-8 text-lg font-semibold">Vorschau &amp; Variablen</h2>
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <div className="panel space-y-3 p-5">
          <div className="grid gap-1.5">
            <Label>Empfänger</Label>
            <select
              className="h-11 rounded-lg border border-border bg-background px-3 text-sm"
              value={previewRecipient}
              onChange={(e) => setPreviewRecipient(e.target.value)}
            >
              <option value="">— nur Admin-Chat —</option>
              {recipients.map((r: any) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label>Alarmtyp</Label>
            <select
              className="h-11 rounded-lg border border-border bg-background px-3 text-sm"
              value={previewKind}
              onChange={(e) => setPreviewKind(e.target.value)}
            >
              {kinds.map((k: any) => (
                <option key={k.kind} value={k.kind}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
          {preview.data?.recipient?.optedOut ? (
            <p className="text-sm text-destructive">
              Dieser Empfänger hat den Alarmtyp abgemeldet – er würde übersprungen.
            </p>
          ) : null}
          <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm whitespace-pre-wrap">
            {(preview.data?.body ?? "").replace(/<\/?b>/g, "") || "—"}
          </div>
          {preview.data?.fanBody ? (
            <div className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground whitespace-pre-wrap">
              Fan-Nachricht: {preview.data.fanBody}
            </div>
          ) : null}
          <Button
            disabled={!isAdmin || !previewRecipient}
            onClick={async () => {
              try {
                const res = await testFn({ data: { recipientId: previewRecipient, kind: previewKind as never } });
                if (res.ok) toast.success("Testnachricht gesendet");
                else toast.error(res.error ?? "Versand fehlgeschlagen");
                qc.invalidateQueries({ queryKey: ["notification-center"] });
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Versand fehlgeschlagen");
              }
            }}
          >
            <Send className="mr-2 size-4" /> Testnachricht senden
          </Button>
        </div>

        <div className="panel p-5">
          <p className="text-sm font-medium">Variablenzuordnung</p>
          <div className="mt-3 divide-y divide-border/60 text-sm">
            {(preview.data?.variables ?? []).map((v: any) => (
              <div key={v.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <code className="text-primary">{v.label}</code>
                <span className="text-muted-foreground">{v.source}</span>
                <span className="font-medium">{v.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Zustellprotokoll */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Zustellprotokoll</h2>
        <div className="flex items-center gap-2">
          <select
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="alle">alle Status</option>
            {Object.entries(statusLabel).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            onClick={async () => {
              const res = await exportFn({ data: undefined as never });
              download(res.filename, res.content);
            }}
          >
            <Download className="mr-2 size-4" /> CSV
          </Button>
        </div>
      </div>

      <div className="panel mt-3 divide-y divide-border/60">
        {deliveries.map((d: any) => (
          <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
            <span className="font-medium">{d.recipient}</span>
            <span className="text-muted-foreground">
              {kinds.find((k: any) => k.kind === d.kind)?.label ?? d.kind} · {d.channel}
              {d.usedFallback ? " (Ersatzkanal)" : ""}
            </span>
            <Badge className={statusTone[d.status] ?? "bg-muted text-muted-foreground"}>
              {statusLabel[d.status] ?? d.status}
            </Badge>
            <span className="text-xs text-muted-foreground">Versuch {d.attempt}</span>
            {d.error ? <span className="w-full text-xs text-destructive md:w-auto">{d.error}</span> : null}
            <span className="text-xs text-muted-foreground">{new Date(d.createdAt).toLocaleString("de-DE")}</span>
            {d.status === "dead" || d.status === "retrying" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={!canOperate}
                onClick={async () => {
                  const res = await retryFn({ data: { id: d.id } });
                  if (res.ok) toast.success("Erneut gesendet");
                  else toast.error(res.error ?? "Erneut fehlgeschlagen");
                  qc.invalidateQueries({ queryKey: ["notification-center"] });
                }}
              >
                <RefreshCw className="mr-1 size-3.5" /> Erneut senden
              </Button>
            ) : null}
          </div>
        ))}
        {deliveries.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Noch keine Zustellungen protokolliert.</p>
        ) : null}
      </div>
    </DashLayout>
  );
}
