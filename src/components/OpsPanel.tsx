import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Activity, CheckCircle2, PlayCircle, RefreshCw, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getOpsStatus, checkChatIds, runTestPurchase, cleanupTestPurchases } from "@/lib/ops.functions";

/** Betriebs-Ansicht: Cron-Jobs, Webhook-Bestätigung, Chat-IDs und Testkauf. */
export function OpsPanel({ enabled }: { enabled: boolean }) {
  const qc = useQueryClient();
  const opsFn = useServerFn(getOpsStatus);
  const chatFn = useServerFn(checkChatIds);
  const testFn = useServerFn(runTestPurchase);
  const cleanFn = useServerFn(cleanupTestPurchases);
  const [chats, setChats] = useState<any[] | null>(null);
  const [testResult, setTestResult] = useState<any | null>(null);
  const [busy, setBusy] = useState("");

  const { data } = useQuery({
    queryKey: ["ops-status"],
    queryFn: () => opsFn({ data: undefined as never }),
    enabled,
    refetchInterval: 60_000,
  });

  const ops = data as any;

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-3">
      <div className="panel p-6 lg:col-span-2">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Activity className="size-4 text-primary" /> Automatik & Betrieb
          </h2>
          <button
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => qc.invalidateQueries({ queryKey: ["ops-status"] })}
          >
            <RefreshCw className="size-3" /> Aktualisieren
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {(ops?.jobs ?? []).map((j: any) => (
            <div key={j.job} className="rounded-lg border border-border p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{j.label}</span>
                <Badge className={j.running ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}>
                  {j.running ? "läuft" : "kein Lauf"}
                </Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Takt: alle {j.everyMin} Min · {j.runs24h} Läufe / 24 h
              </p>
              <p className="text-xs text-muted-foreground">
                Verarbeitet: {j.processed24h} · Gesendet: {j.sent24h} · Fehler: {j.failed24h}
              </p>
              <p className="text-xs text-muted-foreground">
                Zuletzt: {j.lastAt ? new Date(j.lastAt).toLocaleString("de-DE") : "noch nie"}
              </p>
              {j.lastDetail ? <p className="mt-1 text-xs text-destructive">{j.lastDetail}</p> : null}
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-lg border border-border p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Telegram-Webhook</span>
            <Badge className={ops?.webhook?.confirmed ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}>
              {ops?.webhook?.confirmed ? "bestätigt" : "nicht bestätigt"}
            </Badge>
          </div>
          <p className="mt-2 break-all text-xs text-muted-foreground">Aktiv: {ops?.webhook?.url || "—"}</p>
          {ops?.webhook?.expected && ops.webhook.expected !== ops.webhook.url ? (
            <p className="break-all text-xs text-destructive">Erwartet: {ops.webhook.expected}</p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Offene Updates: {ops?.webhook?.pending ?? 0}
            {ops?.webhook?.lastError ? ` · Letzter Fehler: ${ops.webhook.lastError}` : ""}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Zustellungen 24 h", ops?.deliveries24h?.total ?? 0],
            ["Gesendet", ops?.deliveries24h?.sent ?? 0],
            ["Wiederholung", ops?.deliveries24h?.retrying ?? 0],
            ["Fehlgeschlagen", ops?.deliveries24h?.dead ?? 0],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-xl font-semibold">{value as number}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="panel space-y-4 p-6">
        <div>
          <h2 className="text-lg font-semibold">Chat-IDs prüfen</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Testet Gratis-, VIP- und Admin-Chat direkt bei Telegram.
          </p>
          <Button
            size="sm"
            variant="secondary"
            className="mt-3"
            disabled={busy === "chats"}
            onClick={async () => {
              setBusy("chats");
              try {
                const res: any = await chatFn({ data: undefined as never });
                setChats(res.results);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Prüfung fehlgeschlagen");
              } finally {
                setBusy("");
              }
            }}
          >
            {busy === "chats" ? "Prüfe…" : "Jetzt prüfen"}
          </Button>
          {chats ? (
            <ul className="mt-3 space-y-2 text-xs">
              {chats.map((c) => (
                <li key={c.key} className="flex items-start gap-2">
                  {c.ok ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                  ) : (
                    <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                  )}
                  <span>
                    <span className="font-medium text-foreground">{c.label}</span>{" "}
                    {c.ok ? `${c.title || c.chatId} (${c.type}${c.canPost ? "" : ", Bot kann nicht posten"})` : c.error}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="border-t border-border pt-4">
          <h2 className="text-lg font-semibold">Testkauf</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Legt einen Testfan mit bezahltem Kauf, Zugangslink und Protokolleinträgen an.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={busy === "test"}
              onClick={async () => {
                setBusy("test");
                try {
                  const res: any = await testFn({ data: undefined as never });
                  setTestResult(res);
                  toast.success("Testkauf ausgeführt");
                  qc.invalidateQueries({ queryKey: ["ops-status"] });
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Testkauf fehlgeschlagen");
                } finally {
                  setBusy("");
                }
              }}
            >
              <PlayCircle className="mr-2 size-4" /> {busy === "test" ? "Läuft…" : "Testkauf starten"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy === "clean"}
              onClick={async () => {
                setBusy("clean");
                try {
                  const res: any = await cleanFn({ data: undefined as never });
                  setTestResult(null);
                  toast.success(`${res.removed} Testfans entfernt`);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Aufräumen fehlgeschlagen");
                } finally {
                  setBusy("");
                }
              }}
            >
              <Trash2 className="mr-2 size-4" /> Testdaten löschen
            </Button>
          </div>
          {testResult ? (
            <div className="mt-3 space-y-1 text-xs text-muted-foreground">
              <p>Inhalt: {testResult.product}</p>
              <p className="break-all">Zugangslink: {testResult.url || "keine App-Adresse hinterlegt"}</p>
              <p>
                Gültig {testResult.ttl} h · {testResult.maxViews} Aufrufe ·{" "}
                {testResult.notified ? "Alarm im Protokoll" : `Alarm fehlgeschlagen: ${testResult.notifyError}`}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
