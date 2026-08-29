import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Send, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { sendBulkTest } from "@/lib/ops.functions";

type Kind = "expiring" | "expired" | "unpaid" | "blocked" | "reactivated";
const CHANNELS = ["telegram", "slack", "email"] as const;

/** Bulk-Testversand pro Alarmtyp und Kanal an mehrere Empfänger. */
export function BulkTestPanel({
  kinds,
  recipients,
  canSend,
}: {
  kinds: { kind: string; label: string }[];
  recipients: { id: string; label: string; channel: string; active: boolean }[];
  canSend: boolean;
}) {
  const qc = useQueryClient();
  const bulkFn = useServerFn(sendBulkTest);
  const [kind, setKind] = useState<Kind>("expiring");
  const [channels, setChannels] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [adminChat, setAdminChat] = useState(true);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);

  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <div className="panel mt-6 p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Send className="size-4 text-primary" /> Bulk-Testversand
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Sendet eine Testnachricht pro Empfänger. Jeder Versand erscheint sofort im Zustellprotokoll.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Alarmtyp</Label>
          <select
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
          >
            {kinds.map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label>Kanäle</Label>
          <div className="flex flex-wrap gap-2">
            {CHANNELS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setChannels(toggle(channels, c))}
                className={`rounded-full border px-3 py-1.5 text-xs ${
                  channels.includes(c) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Nichts gewählt = alle Kanäle</p>
        </div>

        <div className="space-y-1.5">
          <Label>Empfänger</Label>
          <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-border p-2">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                className="size-4 accent-[hsl(var(--primary))]"
                checked={adminChat}
                onChange={(e) => setAdminChat(e.target.checked)}
              />
              Admin-Chat
            </label>
            {recipients.map((r) => (
              <label key={r.id} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  className="size-4 accent-[hsl(var(--primary))]"
                  checked={selected.includes(r.id)}
                  onChange={() => setSelected(toggle(selected, r.id))}
                />
                {r.label} · {r.channel}
                {r.active ? "" : " (inaktiv)"}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Nichts gewählt = alle aktiven Empfänger</p>
        </div>
      </div>

      <Button
        className="mt-4"
        disabled={!canSend || busy}
        onClick={async () => {
          setBusy(true);
          try {
            const res: any = await bulkFn({
              data: { kind, recipientIds: selected, channels: channels as any, includeAdminChat: adminChat },
            });
            setResults(res.results);
            toast.success(`${res.sent}/${res.total} Testnachrichten gesendet`);
            qc.invalidateQueries({ queryKey: ["notification-center"] });
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Versand fehlgeschlagen");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Sende…" : "Testnachrichten senden"}
      </Button>

      {results ? (
        <ul className="mt-4 space-y-2 text-xs">
          {results.map((r, i) => (
            <li key={i} className="flex items-start gap-2">
              {r.ok ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
              ) : (
                <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
              )}
              <span>
                <span className="font-medium text-foreground">{r.label}</span> · {r.channel} · {r.target}
                {r.ok ? "" : ` — ${r.error}`}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
