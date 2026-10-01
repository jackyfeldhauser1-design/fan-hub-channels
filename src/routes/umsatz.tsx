import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { TrendingUp, Ticket, Repeat, ShoppingCart, Users, MousePointerClick, Gift, RefreshCw } from "lucide-react";
import { DashLayout } from "@/components/DashLayout";
import { useAdmin } from "@/lib/useAdmin";
import {
  getSalesOverview,
  saveDiscountCode,
  deleteDiscountCode,
  updateSubscription,
} from "@/lib/sales.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/umsatz")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "Umsatz & Abos – Telegram Fan Funnel Studio" },
      {
        name: "description",
        content: "Abos, Rabattcodes, offene Rechnungen und Stars-Umsatz der letzten 30 Tage verwalten.",
      },
      { property: "og:title", content: "Umsatz & Abos – Telegram Fan Funnel Studio" },
      { property: "og:description", content: "Wiederkehrender Umsatz, Codes und Warenkorb-Rettung." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SalesPage,
});

const emptyCode = {
  code: "",
  label: "",
  percent_off: 10,
  stars_off: 0,
  max_uses: 0,
  once_per_fan: true,
  active: true,
  expires_at: null as string | null,
};

function SalesPage() {
  const { isAdmin } = useAdmin();
  const overviewFn = useServerFn(getSalesOverview);
  const saveFn = useServerFn(saveDiscountCode);
  const deleteFn = useServerFn(deleteDiscountCode);
  const subFn = useServerFn(updateSubscription);
  const [form, setForm] = useState(emptyCode);
  const [busy, setBusy] = useState(false);

  const { data, refetch } = useQuery({
    queryKey: ["sales-overview"],
    queryFn: () => overviewFn({ data: undefined as never }),
    enabled: isAdmin,
  });

  if (!isAdmin) return <DashLayout title="Umsatz">Nur für Admins.</DashLayout>;

  async function save() {
    setBusy(true);
    try {
      await saveFn({ data: form });
      toast.success("Rabattcode gespeichert");
      setForm(emptyCode);
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fehler beim Speichern");
    } finally {
      setBusy(false);
    }
  }

  const kpis = [
    { icon: TrendingUp, label: "Umsatz 30 Tage", value: `⭐ ${data?.revenue30 ?? 0} · 💎 ${data?.revenueTon30 ?? 0}` },
    { icon: ShoppingCart, label: "Verkäufe 30 Tage", value: data?.sales30 ?? 0 },
    { icon: Users, label: "Käufer 30 Tage", value: data?.uniqueBuyers30 ?? 0 },
    { icon: Repeat, label: "Aktive Abos", value: data?.activeSubs ?? 0 },
    { icon: Ticket, label: "Offene Rechnungen", value: data?.openInvoices?.length ?? 0 },
    { icon: MousePointerClick, label: "Teaser → Kauf", value: `${data?.growth?.teaserToPurchasePercent ?? 0}%` },
  ];

  return (
    <DashLayout title="Umsatz & Abos">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-border bg-card p-4">
            <k.icon className="mb-2 h-4 w-4 text-muted-foreground" />
            <div className="text-xl font-semibold">{k.value}</div>
            <div className="text-xs text-muted-foreground">{k.label}</div>
          </div>
        ))}
      </div>

      <section className="mt-6 rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Growth-Funnel · letzte 30 Tage</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Free-Teaser-Klicks", data?.growth?.teaserClicks ?? 0, MousePointerClick],
            ["Checkout gestartet", data?.growth?.checkoutStarts ?? 0, ShoppingCart],
            ["Upsells gezeigt", data?.growth?.upsellImpressions ?? 0, TrendingUp],
            ["Recovery-Klicks", data?.growth?.recoveryClicks ?? 0, RefreshCw],
            ["Reaktivierungen", data?.growth?.reactivations ?? 0, Repeat],
            ["Referral-Anmeldungen", data?.growth?.referralJoins ?? 0, Users],
            ["Referral-Boni", data?.growth?.referralRewards ?? 0, Gift],
            ["Kauf-Events", data?.growth?.paidEvents ?? 0, Ticket],
          ].map(([label, value, Icon]: any) => (
            <div key={label} className="rounded-lg border border-border p-3">
              <Icon className="mb-2 h-4 w-4 text-muted-foreground" />
              <div className="text-lg font-semibold">{value}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Kundensegmente</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-lg border border-border p-3"><div className="text-xl font-semibold">{data?.segmentCounts?.prospect ?? 0}</div><div className="text-xs text-muted-foreground">Noch kein Kauf</div></div>
          <div className="rounded-lg border border-border p-3"><div className="text-xl font-semibold">{data?.segmentCounts?.buyer ?? 0}</div><div className="text-xs text-muted-foreground">1 Kauf</div></div>
          <div className="rounded-lg border border-border p-3"><div className="text-xl font-semibold">{data?.segmentCounts?.repeat ?? 0}</div><div className="text-xs text-muted-foreground">Wiederkäufer</div></div>
          <div className="rounded-lg border border-border p-3"><div className="text-xl font-semibold">{data?.segmentCounts?.vip ?? 0}</div><div className="text-xs text-muted-foreground">VIP</div></div>
        </div>
        {!!data?.topCustomers?.length && (
          <div className="mt-4">
            <div className="mb-2 text-xs font-medium text-muted-foreground">Stärkste Käufer nach Stars</div>
            <ul className="divide-y divide-border">
              {data.topCustomers.map((fan: any) => (
                <li key={fan.tg_user_id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span>{fan.username ? `@${fan.username}` : (fan.first_name ?? "Fan")} · {fan.segment}</span>
                  <span>⭐ {fan.paid_stars} · {fan.paid_orders} Käufe</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Neuer Rabattcode</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label htmlFor="code">Code</Label>
            <Input
              id="code"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              placeholder="SOMMER"
            />
          </div>
          <div>
            <Label htmlFor="percent">Rabatt (%)</Label>
            <Input
              id="percent"
              type="number"
              value={form.percent_off}
              onChange={(e) => setForm({ ...form, percent_off: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label htmlFor="stars">Rabatt (Stars)</Label>
            <Input
              id="stars"
              type="number"
              value={form.stars_off}
              onChange={(e) => setForm({ ...form, stars_off: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label htmlFor="max">Max. Einlösungen (0 = frei)</Label>
            <Input
              id="max"
              type="number"
              value={form.max_uses}
              onChange={(e) => setForm({ ...form, max_uses: Number(e.target.value) })}
            />
          </div>
        </div>
        <Button className="mt-3" disabled={busy || form.code.length < 3} onClick={save}>
          Code speichern
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          Fans lösen den Code im Bot mit <code>/code {form.code || "SOMMER"}</code> ein.
        </p>
      </section>

      <section className="mt-6 rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Rabattcodes</h2>
        {!data?.codes?.length && <p className="text-sm text-muted-foreground">Noch keine Codes angelegt.</p>}
        <ul className="divide-y divide-border">
          {(data?.codes ?? []).map((c: any) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span>
                <strong>{c.code}</strong> · {c.percent_off}% {c.stars_off > 0 && `+ ⭐ ${c.stars_off}`} ·{" "}
                {c.used_count} eingelöst {c.active ? "" : "· inaktiv"}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await deleteFn({ data: { id: c.id } });
                  await refetch();
                }}
              >
                Löschen
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6 rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">VIP-Abos</h2>
        {!data?.subscriptions?.length && <p className="text-sm text-muted-foreground">Noch keine Abos.</p>}
        <ul className="divide-y divide-border">
          {(data?.subscriptions ?? []).map((s: any) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span>
                {s.tg_users?.username ? `@${s.tg_users.username}` : (s.tg_users?.first_name ?? "Fan")} ·{" "}
                {s.status} ·{" "}
                {s.expires_at ? `bis ${new Date(s.expires_at).toLocaleDateString("de-DE")}` : "unbefristet"} ·{" "}
                {s.renewals} Verlängerungen
              </span>
              <span className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    await subFn({ data: { id: s.id, action: "extend", days: 30 } });
                    toast.success("Um 30 Tage verlängert");
                    await refetch();
                  }}
                >
                  +30 Tage
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    await subFn({ data: { id: s.id, action: "cancel", days: 30 } });
                    await refetch();
                  }}
                >
                  Beenden
                </Button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6 rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Offene Rechnungen (Warenkorb-Rettung)</h2>
        {!data?.openInvoices?.length && <p className="text-sm text-muted-foreground">Keine offenen Rechnungen.</p>}
        <ul className="divide-y divide-border">
          {(data?.openInvoices ?? []).map((i: any) => (
            <li key={i.id} className="py-2 text-sm">
              {i.title} · ⭐ {i.amount_stars} · {new Date(i.created_at).toLocaleString("de-DE")}
              {i.reminded_at ? " · erinnert" : ""}
            </li>
          ))}
        </ul>
      </section>
    </DashLayout>
  );
}
