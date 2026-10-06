import { createFileRoute, Link } from "@tanstack/react-router";
import { useAdmin } from "@/lib/useAdmin";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Star, Gem, Users, Handshake, CheckCircle2, Circle, AlertTriangle } from "lucide-react";
import { DashLayout } from "@/components/DashLayout";
import { getOverview } from "@/lib/admin.functions";
import { resolvePublicBaseUrl } from "@/lib/base-url";

export const Route = createFileRoute("/")({
  head: () => {
    const base = resolvePublicBaseUrl();
    return ({
    meta: [
      { title: "Übersicht – Telegram Fan Funnel Studio" },
      {
        name: "description",
        content: "Umsatz in Stars und TON, Fans, Verkäufe und Affiliate-Provisionen deiner Telegram-Bot-Kette auf einen Blick.",
      },
      { property: "og:title", content: "Übersicht – Telegram Fan Funnel Studio" },
      { property: "og:description", content: "Alle Kennzahlen deines Telegram-Verkaufsfunnels in einem Dashboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      ...(base ? [{ property: "og:url", content: `${base}/` }] : []),
    ],
    links: base ? [{ rel: "canonical", href: `${base}/` }] : [],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Telegram Fan Funnel Studio",
          url: base || "/",
        }),
      },
    ],
    });
  },
  component: Overview,
});

function Stat({ icon: Icon, label, value, hint }: { icon: any; label: string; value: string; hint?: string }) {
  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className="size-4 text-primary" />
      </div>
      <p className="mt-3 font-display text-3xl font-bold">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

type Step = { label: string; done: boolean; hint: string; to: string };

function Overview() {
  const fn = useServerFn(getOverview);
  const { isAdmin } = useAdmin();
  const { data } = useQuery({ queryKey: ["overview"], queryFn: () => fn({ data: undefined as never }), enabled: isAdmin });

  const s = (data as any)?.setup ?? {};
  const steps: Step[] = [
    {
      label: "Bot verbunden",
      done: Boolean(s.botConnected),
      hint: s.botConnected ? `@${s.botUsername}` : "Bot-Token hinterlegen und Webhook setzen.",
      to: "/verbinden",
    },
    {
      label: "Community, Shop & Kontrollraum",
      done: (s.chatsSet ?? 0) >= 3,
      hint: `${s.chatsSet ?? 0}/3 Chats zugeordnet`,
      to: "/verbinden",
    },
    {
      label: "Preise gesetzt",
      done: (s.vipPrice ?? 0) > 0,
      hint: (s.vipPrice ?? 0) > 0 ? `VIP: ⭐ ${s.vipPrice}` : "VIP-Preis und Stars-Einstellungen festlegen.",
      to: "/stars",
    },
    {
      label: "Produkte angelegt",
      done: (s.products ?? 0) > 0,
      hint: `${s.products ?? 0} aktive Produkte`,
      to: "/content",
    },
    {
      label: "Medien hochgeladen",
      done: (s.folders ?? 0) > 0 && (s.files ?? 0) > 0,
      hint: `${s.folders ?? 0} Ordner · ${s.files ?? 0} Dateien`,
      to: "/medien",
    },
    {
      label: "Erster Verkauf",
      done: (data?.sales ?? 0) > 0,
      hint: (data?.sales ?? 0) > 0 ? `${data?.sales} Käufe verbucht` : "Testkauf mit 1 Star empfohlen.",
      to: "/bestellungen",
    },
  ];
  const doneCount = steps.filter((x) => x.done).length;

  return (
    <DashLayout title="Übersicht" subtitle="Deine Telegram-Kette: Community → Shop → Kontrollraum.">
      <section className="hero-panel p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Command Center</p>
            <h2 className="mt-2 text-2xl font-bold sm:text-3xl">Heute Umsatz bewegen</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Drops, Verkäufe und Wachstum sind direkt erreichbar – optimiert für schnelle Bedienung am Handy.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Link to="/content" className="rounded-xl px-4 py-3 text-center text-sm font-semibold gold-surface">Neuen Content verkaufen</Link>
            <Link to="/drops" className="rounded-xl border border-border bg-background/30 px-4 py-3 text-center text-sm font-semibold">Drop starten</Link>
            <Link to="/verkaeufe" className="rounded-xl border border-border bg-background/30 px-4 py-3 text-center text-sm font-semibold">Verkäufe prüfen</Link>
            <Link to="/umsatz" className="rounded-xl border border-border bg-background/30 px-4 py-3 text-center text-sm font-semibold">Umsatz öffnen</Link>
          </div>
        </div>
      </section>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          icon={Star}
          label="Heute (Stars)"
          value={`⭐ ${data?.todayStars ?? 0}`}
          hint={`${data?.todaySales ?? 0} Verkäufe heute`}
        />
        <Stat icon={Star} label="Umsatz gesamt (Stars)" value={`⭐ ${data?.stars ?? 0}`} hint={`${data?.weekStars ?? 0} in 7 Tagen`} />
        <Stat icon={Gem} label="Krypto-Umsatz" value={`${(data?.ton ?? 0).toFixed(2)} TON`} hint={`${(data?.trx ?? 0).toFixed(2)} TRX · ${data?.pendingCrypto ?? 0} offen`} />
        <Stat icon={Users} label="Fans im Bot" value={`${data?.fans ?? 0}`} hint={`⭐ ${data?.commissions ?? 0} Provisionen`} />
      </div>



      <div className="panel mt-6 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Funnel</h2>
          <span className="text-xs text-muted-foreground">Start → Checkout → bezahlt → ausgeliefert → geöffnet</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-5">
          {([
            ["Bot-Start", data?.funnel?.started ?? 0],
            ["Checkout", data?.funnel?.checkout ?? 0],
            ["Bezahlt", data?.funnel?.paid ?? 0],
            ["Ausgeliefert", data?.funnel?.delivered ?? 0],
            ["Geöffnet", data?.funnel?.opened ?? 0],
          ] as const).map(([label, value]) => (
            <div key={label} className="rounded-xl border border-border p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-2xl font-bold">{value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="panel p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Setup-Fortschritt</h2>
            <span className="text-sm text-muted-foreground">{doneCount}/{steps.length}</span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
          </div>
          <ul className="mt-4 space-y-3">
            {steps.map((st) => (
              <li key={st.label} className="flex items-start gap-2 text-sm">
                {st.done ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                ) : (
                  <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1">
                  <span className={st.done ? "text-muted-foreground line-through" : "font-medium"}>{st.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{st.hint}</span>
                </span>
                {!st.done ? (
                  <Link to={st.to} className="shrink-0 text-xs text-primary hover:underline">
                    Erledigen
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
          {(s.failedDeliveries ?? 0) > 0 ? (
            <Link to="/benachrichtigungen" className="mt-4 flex items-center gap-2 text-sm text-destructive hover:underline">
              <AlertTriangle className="size-4" /> {s.failedDeliveries} fehlerhafte Zustellungen prüfen
            </Link>
          ) : null}
        </div>

        <div className="panel p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold">Letzte Verkäufe</h2>
          <div className="mt-4 divide-y divide-border">
            {(data?.recent ?? []).length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">Noch keine Verkäufe. Lege Inhalte an und verbinde den Bot.</p>
            ) : (
              data!.recent.map((r: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-3 text-sm">
                  <span>{r.title_snapshot}</span>
                  <span className="font-medium text-primary">
                    {r.currency === "ton" ? `${r.amount_ton} TON` : `⭐ ${r.amount_stars}`}
                  </span>
                </div>
              ))
            )}
          </div>

          <h2 className="mt-6 text-lg font-semibold">Schnellzugriff</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/content" className="rounded-lg px-4 py-2 text-sm font-medium gold-surface">Content verkaufen</Link>
            <Link to="/medien" className="rounded-lg border border-border px-4 py-2 text-sm">Medien hochladen</Link>
            <Link to="/verkaeufe" className="rounded-lg border border-border px-4 py-2 text-sm">Verkäufe prüfen</Link>
            <Link to="/status" className="rounded-lg border border-border px-4 py-2 text-sm">Live-Status</Link>
          </div>
        </div>
      </div>
    </DashLayout>
  );
}

