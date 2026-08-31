import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Lock, Star, Crown, Download, RefreshCw, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAccountOverview, reissueAccountAccess } from "@/lib/account.functions";

export const Route = createFileRoute("/konto")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "Mein Konto – Käufe, Zugänge & VIP" },
      {
        name: "description",
        content: "Persönliche Übersicht über gekaufte Medien, ausgegebene Stars, aktive Zugänge und dein VIP-Abo.",
      },
      { property: "og:title", content: "Mein Konto – Käufe, Zugänge & VIP" },
      { property: "og:description", content: "Deine Käufe, Zugänge und dein VIP-Abo auf einen Blick." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({ t: String(search["t"] ?? "") }),
  component: AccountPage,
});

const dt = (v: string) => new Date(v).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });

function AccountPage() {
  const { t } = Route.useSearch();
  const overviewFn = useServerFn(getAccountOverview);
  const reissueFn = useServerFn(reissueAccountAccess);
  const [message, setMessage] = useState<string>("");

  const { data, isPending, refetch } = useQuery({
    queryKey: ["account", t],
    queryFn: () => overviewFn({ data: { ticket: t } }),
    enabled: t.length > 20,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const reissue = useMutation({
    mutationFn: (accessId: string) => reissueFn({ data: { ticket: t, accessId } }),
    onSuccess: (r: any) => {
      setMessage(r.url ? `Neuer Zugang erstellt – ${r.maxViews}× / ${r.ttl} Stunden gültig.` : "Neuer Zugang erstellt.");
      refetch();
    },
    onError: (e: any) => setMessage(e?.message ?? "Zugang konnte nicht erneuert werden."),
  });

  if (t.length <= 20 || (data && data.status !== "ok")) {
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <div className="panel max-w-md p-8 text-center">
          <Lock className="mx-auto size-8 text-muted-foreground" />
          <h1 className="mt-4 text-xl font-semibold">Kein Zugriff</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Dieser Konto-Link ist ungültig oder abgelaufen. Öffne im Telegram-Bot „Mein Konto“, um einen neuen Link zu
            erhalten.
          </p>
        </div>
      </main>
    );
  }

  if (isPending || !data?.account) {
    return <main className="grid min-h-screen place-items-center text-muted-foreground">Konto wird geladen…</main>;
  }

  const a = data.account;

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-10">
      <header>
        <p className="text-sm text-muted-foreground">Kundenkonto</p>
        <h1 className="font-display text-2xl font-bold">Hallo {a.fan.name}</h1>
      </header>

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="panel p-5">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            Ausgegebene Stars <Star className="size-4 text-primary" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold">⭐ {a.totals.stars}</p>
          <p className="text-xs text-muted-foreground">{a.totals.purchases} bezahlte Bestellungen</p>
        </div>
        <div className="panel p-5">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            VIP-Abo <Crown className="size-4 text-primary" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold">{a.subscription ? "Aktiv" : "Kein Abo"}</p>
          <p className="text-xs text-muted-foreground">
            {a.subscription?.expiresAt ? `Läuft bis ${dt(a.subscription.expiresAt)}` : "Im Bot buchbar"}
          </p>
        </div>
        <div className="panel p-5">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            Aktive Zugänge <Download className="size-4 text-primary" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold">{a.access.filter((x) => x.active).length}</p>
          <p className="text-xs text-muted-foreground">{a.access.length} Zugänge insgesamt</p>
        </div>
      </section>

      {message ? <p className="mt-4 text-sm text-primary">{message}</p> : null}

      <section className="panel mt-6 p-6">
        <h2 className="text-lg font-semibold">Meine Zugänge</h2>
        {a.access.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Noch keine Zugänge – kaufe im Bot deinen ersten Inhalt.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {a.access.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{x.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {x.state} · {x.views}/{x.maxViews} Aufrufe · bis {dt(x.expiresAt)}
                  </p>
                </div>
                {x.active && x.url ? (
                  <a
                    href={x.url}
                    className="flex items-center gap-1 text-sm text-primary hover:underline"
                    rel="noopener"
                  >
                    Öffnen <ExternalLink className="size-3.5" />
                  </a>
                ) : x.revoked ? null : (
                  <Button size="sm" variant="secondary" disabled={reissue.isPending} onClick={() => reissue.mutate(x.id)}>
                    {reissue.isPending ? (
                      <Loader2 className="mr-1 size-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-1 size-3.5" />
                    )}
                    Neu anfordern
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel mt-6 p-6">
        <h2 className="text-lg font-semibold">Bestellverlauf</h2>
        {a.purchases.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Noch keine Bestellungen.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {a.purchases.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{p.title}</span>
                <span className="text-muted-foreground">
                  {p.currency === "ton" ? `💎 ${p.amountTon}` : `⭐ ${p.amountStars}`}
                </span>
                <span className="w-24 text-right text-xs text-muted-foreground">{p.status}</span>
                <span className="hidden w-40 text-right text-xs text-muted-foreground sm:block">{dt(p.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel mt-6 p-6">
        <h2 className="text-lg font-semibold">Downloadereignisse</h2>
        {a.downloads.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Noch keine Downloads protokolliert.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {a.downloads.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-2 text-sm">
                <span className={d.allowed ? "text-emerald-500" : "text-destructive"}>{d.allowed ? "erlaubt" : "blockiert"}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{d.reason}</span>
                <span className="text-xs text-muted-foreground">{dt(d.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
