import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Rocket, Loader2, PackagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runGoLiveCheck, seedStarterCatalog } from "@/lib/setup.functions";

type Check = { key: string; label: string; ok: boolean; detail: string };
type Group = { key: string; label: string; checks: Check[] };

/** „Alles prüfen“: ein Knopf, der den kompletten Livegang-Status zeigt. */
export function GoLivePanel({ enabled }: { enabled: boolean }) {
  const checkFn = useServerFn(runGoLiveCheck);
  const seedFn = useServerFn(seedStarterCatalog);
  const run = useMutation({
    mutationFn: () => checkFn({ data: undefined as never }),
    onSuccess: (r: any) => (r.ok ? toast.success("Alles bereit für den Livegang") : toast.warning(`${r.passed}/${r.total} Prüfungen bestanden`)),
    onError: (e: any) => toast.error(e?.message ?? "Prüfung fehlgeschlagen"),
  });
  const seed = useMutation({
    mutationFn: () => seedFn({ data: undefined as never }),
    onSuccess: (r: any) => {
      toast.success(r.created?.length ? `Angelegt: ${r.created.join(", ")}` : "Startpaket war bereits vorhanden");
      run.mutate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Startpaket fehlgeschlagen"),
  });

  if (!enabled) return null;
  const result = run.data as any;

  return (
    <section className="panel mt-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Livegang-Prüfung</h2>
          <p className="text-sm text-muted-foreground">
            Prüft Bot, Webhook, alle drei Chats, geplante Jobs, Zustellungen, Katalog und Medien in einem Durchlauf.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => seed.mutate()} disabled={seed.isPending}>
            {seed.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <PackagePlus className="mr-2 size-4" />}
            Startpaket anlegen
          </Button>
          <Button onClick={() => run.mutate()} disabled={run.isPending}>
            {run.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Rocket className="mr-2 size-4" />}
            Alles prüfen
          </Button>
        </div>
      </div>


      {result ? (
        <>
          <p className="mt-4 text-sm">
            <span className={result.ok ? "text-emerald-500" : "text-amber-500"}>
              {result.passed}/{result.total} Prüfungen bestanden
            </span>{" "}
            · {new Date(result.checkedAt).toLocaleString("de-DE")}
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {(result.groups as Group[]).map((g) => (
              <div key={g.key} className="rounded-xl border border-border p-4">
                <h3 className="text-sm font-semibold">{g.label}</h3>
                <ul className="mt-2 space-y-2">
                  {g.checks.map((c) => (
                    <li key={`${g.key}-${c.key}`} className="flex gap-2 text-sm">
                      {c.ok ? (
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                      ) : (
                        <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                      )}
                      <span className="min-w-0">
                        <span className="font-medium">{c.label}</span>
                        <span className="block break-words text-xs text-muted-foreground">{c.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
