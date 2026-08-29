import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Loader2, Download, ShieldCheck, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  listChatTemplates,
  saveChatTemplate,
  testChatTemplate,
  rotateBotToken,
  verifySetupStatus,
  exportSetupAudit,
} from "@/lib/setup.functions";

type Tpl = { target: string; label: string; hint: string; welcomeBody: string; pinMessage: boolean; isDefault: boolean };

function download(filename: string, mime: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function TemplateCard({ tpl, onSaved }: { tpl: Tpl; onSaved: () => void }) {
  const saveFn = useServerFn(saveChatTemplate);
  const testFn = useServerFn(testChatTemplate);
  const [body, setBody] = useState(tpl.welcomeBody);
  const [pin, setPin] = useState(tpl.pinMessage);

  useEffect(() => {
    setBody(tpl.welcomeBody);
    setPin(tpl.pinMessage);
  }, [tpl.welcomeBody, tpl.pinMessage]);

  const save = useMutation({
    mutationFn: () => saveFn({ data: { target: tpl.target as never, body, pin } }),
    onSuccess: () => {
      toast.success(`${tpl.label}: Vorlage gespeichert`);
      onSaved();
    },
    onError: (e: any) => toast.error(e?.message ?? "Speichern fehlgeschlagen"),
  });

  const test = useMutation({
    mutationFn: () => testFn({ data: { target: tpl.target as never, body } }),
    onSuccess: () => toast.success(`${tpl.label}: Testnachricht gesendet`),
    onError: (e: any) => toast.error(e?.message ?? "Test fehlgeschlagen"),
  });

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold">{tpl.label}</h4>
          <p className="text-xs text-muted-foreground">{tpl.hint}</p>
        </div>
        {tpl.isDefault ? <span className="text-xs text-muted-foreground">Standardtext</span> : null}
      </div>
      <div className="mt-3 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={`tpl-${tpl.target}`}>Willkommens-/Pin-Nachricht (HTML erlaubt)</Label>
          <Textarea id={`tpl-${tpl.target}`} rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch id={`pin-${tpl.target}`} checked={pin} onCheckedChange={setPin} />
            <Label htmlFor={`pin-${tpl.target}`} className="text-sm font-normal">
              Nachricht anpinnen
            </Label>
          </div>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="secondary" disabled={test.isPending} onClick={() => test.mutate()} className="gap-2">
              {test.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Test senden
            </Button>
            <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : "Speichern"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SetupToolsPanel() {
  const templatesFn = useServerFn(listChatTemplates);
  const verifyFn = useServerFn(verifySetupStatus);
  const rotateFn = useServerFn(rotateBotToken);
  const exportFn = useServerFn(exportSetupAudit);

  const [newToken, setNewToken] = useState("");

  const templates = useQuery({
    queryKey: ["chatTemplates"],
    queryFn: () => templatesFn({ data: undefined as never }),
    retry: false,
  });

  const verify = useMutation({
    mutationFn: () => verifyFn({ data: undefined as never }),
    onError: (e: any) => toast.error(e?.message ?? "Prüfung fehlgeschlagen"),
  });

  const rotate = useMutation({
    mutationFn: () =>
      rotateFn({
        data: { token: newToken.trim(), baseUrl: typeof window !== "undefined" ? window.location.origin : undefined },
      }),
    onSuccess: (r: any) => {
      setNewToken("");
      toast.success(`Token gewechselt – Bot @${r.username}${r.webhookUrl ? ", Webhook neu gesetzt" : ""}`);
      if (r.webhookError) toast.message(r.webhookError);
      verify.mutate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Token-Wechsel fehlgeschlagen"),
  });

  const doExport = useMutation({
    mutationFn: (format: "csv" | "json") => exportFn({ data: { format, limit: 1000, days: 90 } }),
    onSuccess: (r: any) => {
      download(r.filename, r.mime, r.content);
      toast.success(`${r.count} Audit-Einträge exportiert`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Export fehlgeschlagen"),
  });

  const v = verify.data as any;

  return (
    <div className="space-y-6">
      <section className="panel space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Setup verifizieren</h2>
            <p className="text-sm text-muted-foreground">
              Prüft Token, Webhook-Status und Rechte in allen Ziel-Chats – mit konkreten Fehlermeldungen.
            </p>
          </div>
          <Button onClick={() => verify.mutate()} disabled={verify.isPending} className="gap-2">
            {verify.isPending ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
            Jetzt prüfen
          </Button>
        </div>
        {v ? (
          <ul className="divide-y divide-border">
            {[...v.checks, ...v.chats.map((c: any) => ({ key: c.target, label: `${c.label} (${c.chatId || "keine Chat-ID"})`, ok: c.ok, detail: c.detail }))].map(
              (row: any) => (
                <li key={row.key} className="flex items-start gap-2 py-2">
                  {row.ok ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                  ) : (
                    <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{row.label}</p>
                    <p className="break-all text-xs text-muted-foreground">{row.detail}</p>
                  </div>
                </li>
              ),
            )}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Noch keine Prüfung ausgeführt.</p>
        )}
      </section>

      <section className="panel space-y-4 p-6">
        <div>
          <h2 className="text-lg font-semibold">Nachrichten-Vorlagen</h2>
          <p className="text-sm text-muted-foreground">
            Willkommens- und Pin-Nachricht je Ziel anpassen und sofort testen.
          </p>
        </div>
        {templates.isLoading ? (
          <p className="text-sm text-muted-foreground">Wird geladen…</p>
        ) : (
          <div className="space-y-3">
            {((templates.data?.items ?? []) as Tpl[]).map((t) => (
              <TemplateCard key={t.target} tpl={t} onSaved={() => templates.refetch()} />
            ))}
          </div>
        )}
      </section>

      <section className="panel space-y-4 p-6">
        <div>
          <h2 className="text-lg font-semibold">Token wechseln</h2>
          <p className="text-sm text-muted-foreground">
            Neuer Token wird geprüft, gespeichert und der Webhook sofort neu gesetzt. Der alte Schlüssel bleibt 10
            Minuten gültig, damit keine Nachricht verloren geht.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="rotate-token">Neuer Bot-Token</Label>
            <Input
              id="rotate-token"
              type="password"
              autoComplete="off"
              placeholder="123456789:AA..."
              value={newToken}
              onChange={(e) => setNewToken(e.target.value)}
            />
          </div>
          <Button disabled={!newToken.trim() || rotate.isPending} onClick={() => rotate.mutate()} className="gap-2">
            {rotate.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Token rotieren
          </Button>
        </div>
      </section>

      <section className="panel space-y-4 p-6">
        <div>
          <h2 className="text-lg font-semibold">Audit exportieren</h2>
          <p className="text-sm text-muted-foreground">
            Zuordnungen, Testposts, Prüfungen und Token-Wechsel der letzten 90 Tage herunterladen.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" className="gap-2" disabled={doExport.isPending} onClick={() => doExport.mutate("csv")}>
            <Download className="size-4" />
            CSV
          </Button>
          <Button variant="secondary" className="gap-2" disabled={doExport.isPending} onClick={() => doExport.mutate("json")}>
            <Download className="size-4" />
            JSON
          </Button>
        </div>
      </section>
    </div>
  );
}
