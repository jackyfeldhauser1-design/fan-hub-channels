import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/useAuth";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Star, Gem, Users, TrendingUp, Handshake, Clock } from "lucide-react";
import { DashLayout } from "@/components/DashLayout";
import { getOverview } from "@/lib/admin.functions";

export const Route = createFileRoute("/")({
  head: () => ({
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
    ],
  }),
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

function Overview() {
  const fn = useServerFn(getOverview);
  const { session } = useAuth();
  const { data } = useQuery({ queryKey: ["overview"], queryFn: () => fn({ data: undefined as never }), enabled: Boolean(session) });

  return (
    <DashLayout title="Übersicht" subtitle="Deine Telegram-Kette von der Gratis-Gruppe bis zum VIP-Kauf.">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Star} label="Umsatz (Stars)" value={`⭐ ${data?.stars ?? 0}`} hint={`${data?.weekStars ?? 0} in 7 Tagen`} />
        <Stat icon={Gem} label="Umsatz (TON)" value={`${(data?.ton ?? 0).toFixed(2)}`} hint={`${data?.pendingTon ?? 0} offene Zahlungen`} />
        <Stat icon={Users} label="Fans im Bot" value={`${data?.fans ?? 0}`} />
        <Stat icon={Handshake} label="Provisionen" value={`⭐ ${data?.commissions ?? 0}`} hint="an Affiliates ausgeschüttet" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
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
        </div>

        <div className="panel p-6">
          <h2 className="text-lg font-semibold">Nächste Schritte</h2>
          <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
            <li className="flex gap-2"><TrendingUp className="mt-0.5 size-4 text-accent" /> Gruppenlinks & TON-Wallet im Bot-Setup hinterlegen</li>
            <li className="flex gap-2"><Star className="mt-0.5 size-4 text-accent" /> Inhalte, Bundles und Pay-per-View anlegen</li>
            <li className="flex gap-2"><Clock className="mt-0.5 size-4 text-accent" /> Webhook aktivieren, damit der Bot antwortet</li>
          </ul>
          <Link to="/einstellungen" className="mt-5 inline-flex rounded-lg px-4 py-2 text-sm font-medium gold-surface">
            Zum Bot-Setup
          </Link>
        </div>
      </div>
    </DashLayout>
  );
}
