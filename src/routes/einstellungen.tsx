import { createFileRoute } from "@tanstack/react-router";
import { useAdmin } from "@/lib/useAdmin";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Link2 } from "lucide-react";
import { DashLayout } from "@/components/DashLayout";
import { getSettings, saveSettings, getBotStatus, setupWebhook } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/einstellungen")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "Bot-Setup – Telegram Fan Funnel Studio" },
      {
        name: "description",
        content: "Gruppenlinks, TON-Wallet, Affiliate-Provision und Willkommenstext deines Telegram-Bots einstellen und den Webhook aktivieren.",
      },
      { property: "og:title", content: "Bot-Setup – Telegram Fan Funnel Studio" },
      { property: "og:description", content: "Bot verbinden, Gruppen verlinken und Provisionen festlegen." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const getFn = useServerFn(getSettings);
  const saveFn = useServerFn(saveSettings);
  const statusFn = useServerFn(getBotStatus);
  const hookFn = useServerFn(setupWebhook);
  const { isAdmin } = useAdmin();
  const { data } = useQuery({ queryKey: ["settings"], queryFn: () => getFn({ data: undefined as never }), enabled: isAdmin });
  const status = useQuery({ queryKey: ["botStatus"], queryFn: () => statusFn({ data: undefined as never }), retry: false, enabled: isAdmin });
  const [form, setForm] = useState<any>(null);
  const [baseUrl, setBaseUrl] = useState(
    "https://project--35deff30-24dd-4f21-b1d1-af6203c909df-dev.lovable.app",
  );

  useEffect(() => {
    if (data && !form) setForm(data);
  }, [data, form]);

  if (!form) return <DashLayout title="Bot-Setup">Lädt…</DashLayout>;

  return (
    <DashLayout title="Bot-Setup" subtitle="Verbinde den Bot und lege deine Funnel-Ziele fest.">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="panel space-y-4 p-6 lg:col-span-2">
          <div className="space-y-1.5">
            <Label>Willkommensnachricht</Label>
            <Textarea rows={3} value={form.welcome_message} onChange={(e) => setForm({ ...form, welcome_message: e.target.value })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Link zur Gratis-Gruppe</Label>
              <Input value={form.free_group_url} onChange={(e) => setForm({ ...form, free_group_url: e.target.value })} placeholder="https://t.me/…" />
            </div>
            <div className="space-y-1.5">
              <Label>Link zur VIP-Gruppe</Label>
              <Input value={form.vip_group_url} onChange={(e) => setForm({ ...form, vip_group_url: e.target.value })} placeholder="https://t.me/+…" />
            </div>
            <div className="space-y-1.5">
              <Label>TON-Wallet</Label>
              <Input value={form.ton_wallet} onChange={(e) => setForm({ ...form, ton_wallet: e.target.value })} placeholder="UQ…" />
            </div>
            <div className="space-y-1.5">
              <Label>Affiliate-Provision (%)</Label>
              <Input type="number" value={form.affiliate_percent} onChange={(e) => setForm({ ...form, affiliate_percent: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Trinkgeld-Text</Label>
            <Input value={form.tip_message} onChange={(e) => setForm({ ...form, tip_message: e.target.value })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Chat-ID Gratis-Gruppe</Label>
              <Input value={form.free_chat_id} onChange={(e) => setForm({ ...form, free_chat_id: e.target.value })} placeholder="-100…" />
            </div>
            <div className="space-y-1.5">
              <Label>Chat-ID VIP-Gruppe</Label>
              <Input value={form.vip_chat_id} onChange={(e) => setForm({ ...form, vip_chat_id: e.target.value })} placeholder="-100…" />
            </div>
            <div className="space-y-1.5">
              <Label>Öffentliche App-Adresse (für Einmal-Links)</Label>
              <Input value={form.app_base_url} onChange={(e) => setForm({ ...form, app_base_url: e.target.value })} placeholder="https://…" />
            </div>
            <div className="space-y-1.5">
              <Label>Early-Access-Preis (Stars)</Label>
              <Input type="number" value={form.early_access_price_stars} onChange={(e) => setForm({ ...form, early_access_price_stars: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Preis Werbepost (Stars)</Label>
              <Input type="number" value={form.sponsor_price_stars} onChange={(e) => setForm({ ...form, sponsor_price_stars: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Käufe pro Stunde & Fan (Limit)</Label>
              <Input type="number" value={form.max_purchases_per_hour} onChange={(e) => setForm({ ...form, max_purchases_per_hour: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Gültigkeit Einmal-Link (Stunden)</Label>
              <Input type="number" value={form.link_ttl_hours} onChange={(e) => setForm({ ...form, link_ttl_hours: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Max. Aufrufe pro Zugangslink</Label>
              <Input type="number" value={form.link_max_views} onChange={(e) => setForm({ ...form, link_max_views: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Upsell-Text nach dem Kauf</Label>
            <Input value={form.upsell_message} onChange={(e) => setForm({ ...form, upsell_message: e.target.value })} />
          </div>
          <Button
            onClick={async () => {
              try {
                await saveFn({
                  data: {
                    welcome_message: form.welcome_message,
                    free_group_url: form.free_group_url,
                    vip_group_url: form.vip_group_url,
                    ton_wallet: form.ton_wallet,
                    affiliate_percent: Number(form.affiliate_percent),
                    tip_message: form.tip_message,
                    upsell_message: form.upsell_message,
                    free_chat_id: form.free_chat_id,
                    vip_chat_id: form.vip_chat_id,
                    app_base_url: form.app_base_url,
                    early_access_price_stars: Number(form.early_access_price_stars),
                    sponsor_price_stars: Number(form.sponsor_price_stars),
                    link_ttl_hours: Number(form.link_ttl_hours),
                    link_max_views: Number(form.link_max_views),
                    max_purchases_per_hour: Number(form.max_purchases_per_hour),
                  },
                });
                toast.success("Einstellungen gespeichert");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Fehlgeschlagen");
              }
            }}
          >
            Speichern
          </Button>
        </div>

        <div className="panel space-y-4 p-6">
          <h2 className="text-lg font-semibold">Bot-Verbindung</h2>
          <p className="text-sm text-muted-foreground">
            Bot: <span className="text-foreground">{status.data?.username ? `@${status.data.username}` : "—"}</span>
          </p>
          <p className="break-all text-xs text-muted-foreground">
            Webhook: {status.data?.webhook || "nicht aktiv"}
          </p>
          <div className="space-y-1.5">
            <Label>Öffentliche Bot-URL</Label>
            <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
          </div>
          <Button
            variant="secondary"
            className="w-full gap-2"
            onClick={async () => {
              try {
                const res = await hookFn({ data: { baseUrl } });
                toast.success(`Webhook aktiv: ${res.url}`);
                status.refetch();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Fehlgeschlagen");
              }
            }}
          >
            <Link2 className="size-4" /> Webhook aktivieren
          </Button>
          <div className="rounded-lg border border-border p-4 text-xs text-muted-foreground">
            <p className="mb-2 flex items-center gap-2 text-foreground">
              <CheckCircle2 className="size-4 text-primary" /> Funnel-Kette
            </p>
            /start → Gratis-Gruppe für Fans → Shop, Pay-per-View, VIP-Zugang → Zahlung per Stars oder TON → sichere
            Auslieferung (Einmal-Link) → Upsell → Empfehlungslink mit Provision. Zusätzlich im Bot: /warteliste für
            Early-Access-Slots und /werbung für bezahlte Werbeposts.
          </div>
        </div>
      </div>
    </DashLayout>
  );
}
