import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, RefreshCw, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAttribution, exportAttributionCsv } from "@/lib/ops.functions";

function download(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Käufe eindeutig Benachrichtigung, Kampagne und Vorlage zuordnen. */
export function AttributionPanel({ enabled }: { enabled: boolean }) {
  const qc = useQueryClient();
  const attrFn = useServerFn(getAttribution);
  const csvFn = useServerFn(exportAttributionCsv);

  const { data } = useQuery({
    queryKey: ["attribution"],
    queryFn: () => attrFn({ data: { recompute: true } }),
    enabled,
  });
  const a = data as any;

  return (
    <div className="panel mt-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Target className="size-4 text-primary" /> Umsatz-Zuordnung
        </h2>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => qc.invalidateQueries({ queryKey: ["attribution"] })}>
            <RefreshCw className="mr-2 size-4" /> Neu berechnen
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              try {
                const res: any = await csvFn({ data: undefined as never });
                download(res.filename, res.csv);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Export fehlgeschlagen");
              }
            }}
          >
            <Download className="mr-2 size-4" /> CSV
          </Button>
        </div>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Letzte Interaktion (Klick vor Öffnung) innerhalb von 72 Stunden vor dem Kauf.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground">Zugeordnete Käufe</p>
          <p className="text-xl font-semibold">{a?.totals?.purchases ?? 0}</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground">Stars</p>
          <p className="text-xl font-semibold">{a?.totals?.stars ?? 0}</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground">Quellen</p>
          <p className="text-xl font-semibold">{(a?.bySource ?? []).length}</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground">Kanäle</p>
          <p className="text-xl font-semibold">{(a?.byChannel ?? []).length}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {[
          ["Nach Quelle (Kampagne/Vorlage)", a?.bySource],
          ["Nach Alarmtyp", a?.byKind],
        ].map(([title, rows]: any) => (
          <div key={title} className="rounded-lg border border-border p-4">
            <p className="text-sm font-medium">{title}</p>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {(rows ?? []).length ? (
                rows.map((r: any) => (
                  <li key={r.key} className="flex justify-between gap-2">
                    <span className="truncate">{r.key}</span>
                    <span>
                      {r.purchases} Käufe · {r.stars} ⭐
                    </span>
                  </li>
                ))
              ) : (
                <li>Noch keine Zuordnung.</li>
              )}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-4 divide-y divide-border/60">
        {(a?.list ?? []).slice(0, 25).map((r: any) => (
          <div key={r.purchaseId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span className="font-medium">{r.title}</span>
            <span className="text-xs text-muted-foreground">
              {r.source} · {r.channel} · {r.touch === "click" ? "Klick" : "Öffnung"} vor {r.minutes} Min
            </span>
            <span className="text-xs text-muted-foreground">{r.stars} ⭐</span>
            <span className="text-xs text-muted-foreground">
              {r.purchasedAt ? new Date(r.purchasedAt).toLocaleString("de-DE") : "—"}
            </span>
          </div>
        ))}
        {!(a?.list ?? []).length ? (
          <p className="py-3 text-sm text-muted-foreground">Noch keine Käufe konnten einer Nachricht zugeordnet werden.</p>
        ) : null}
      </div>
    </div>
  );
}
