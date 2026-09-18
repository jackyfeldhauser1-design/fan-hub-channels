import { createFileRoute } from "@tanstack/react-router";
import { useAdmin } from "@/lib/useAdmin";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Link2 } from "lucide-react";
import { DashLayout } from "@/components/DashLayout";
import { ChatSetupWizard } from "@/components/ChatSetupWizard";
import { ChatHealthPanel } from "@/components/ChatHealthPanel";
import { ConnectPanel } from "@/components/ConnectPanel";


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
  const [baseUrl, setBaseUrl] = useState("");

  useEffect(() => {
    if (data && !form) {
      setForm(data);
      setBaseUrl(data.app_base_url || (typeof window !== "undefined" ? window.location.origin : ""));
    }
  }, [data, form]);

  if (!form) return <DashLayout title="Bot-Setup">Lädt…</DashLayout>;

  return (
    <DashLayout title="Bot-Setup" subtitle="Verbinde den Bot und lege deine Funnel-Ziele fest.">
      <div className="mb-4">
        <ConnectPanel
          defaultBaseUrl={form.app_base_url || baseUrl}
          disabled={!isAdmin}
          onConnected={(v) =>
            setForm({
              ...form,
              community_chat_id: v.community,
              shop_chat_id: v.shop,
              control_chat_id: v.control,
            })
          }
        />
      </div>
      <details className="mb-4">
        <summary className="cursor-pointer px-1 py-2 text-sm text-muted-foreground">
          Manuell anpassen (Gruppen-Assistent)
        </summary>
        <div className="mt-2">
          <ChatSetupWizard
            initial={{
              community: form.community_chat_id ?? "",
              shop: form.shop_chat_id ?? "",
              control: form.control_chat_id ?? "",
            }}
            disabled={!isAdmin}
            onSaved={(v) =>
              setForm({
                ...form,
                community_chat_id: v.community,
                shop_chat_id: v.shop,
                control_chat_id: v.control,
              })
            }
          />
        </div>
      </details>

      <div className="mb-4">
        <ChatHealthPanel enabled={isAdmin} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">

        <div className="panel space-y-4 p-6 lg:col-span-2">
          <div className="space-y-1.5">
            <Label>Willkommensnachricht</Label>
            <Textarea rows={3} value={form.welcome_message} onChange={(e) => setForm({ ...form, welcome_message: e.target.value })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Link zur Gratis-Gruppe</Label>
              <Input value={form.free_group_url} onChange={(e) => setForm({ ...form, free_group_url: e.target.value })} inputMode="url" autoCapitalize="none" autoCorrect="off" placeholder="https://t.me/…" />
            </div>
            <div className="space-y-1.5">
              <Label>Link zur VIP-Gruppe</Label>
              <Input value={form.vip_group_url} onChange={(e) => setForm({ ...form, vip_group_url: e.target.value })} inputMode="url" autoCapitalize="none" autoCorrect="off" placeholder="https://t.me/+…" />
            </div>
            <div className="space-y-1.5">
              <Label>TON-Wallet</Label>
              <Input value={form.ton_wallet ?? ""} onChange={(e) => setForm({ ...form, ton_wallet: e.target.value })} autoCapitalize="none" autoCorrect="off" placeholder="UQ…" />
            </div>
            <div className="space-y-1.5">
              <Label>TRON-Wallet (TRX)</Label>
              <Input value={form.trx_wallet ?? ""} onChange={(e) => setForm({ ...form, trx_wallet: e.target.value })} autoCapitalize="none" autoCorrect="off" placeholder="T…" />
              <p className="text-xs text-muted-foreground">Nur öffentliche Empfangsadresse – niemals Seed Phrase oder Private Key.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Affiliate-Provision (%)</Label>
              <Input type="number" inputMode="numeric" value={form.affiliate_percent} onChange={(e) => setForm({ ...form, affiliate_percent: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Trinkgeld-Text</Label>
            <Input value={form.tip_message} onChange={(e) => setForm({ ...form, tip_message: e.target.value })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Chat-ID Community</Label>
              <Input value={form.community_chat_id} onChange={(e) => setForm({ ...form, community_chat_id: e.target.value })} inputMode="numeric" placeholder="-100…" />
            </div>
            <div className="space-y-1.5">
              <Label>Chat-ID Shop</Label>
              <Input value={form.shop_chat_id} onChange={(e) => setForm({ ...form, shop_chat_id: e.target.value })} inputMode="numeric" placeholder="-100…" />
            </div>
            <div className="space-y-1.5">
              <Label>Öffentliche App-Adresse (für Einmal-Links)</Label>
              <Input value={form.app_base_url} onChange={(e) => setForm({ ...form, app_base_url: e.target.value })} inputMode="url" autoCapitalize="none" autoCorrect="off" placeholder="https://…" />
            </div>
            <div className="space-y-1.5">
              <Label>Early-Access-Preis (Stars)</Label>
              <Input type="number" inputMode="numeric" value={form.early_access_price_stars} onChange={(e) => setForm({ ...form, early_access_price_stars: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Preis Werbepost (Stars)</Label>
              <Input type="number" inputMode="numeric" value={form.sponsor_price_stars} onChange={(e) => setForm({ ...form, sponsor_price_stars: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Käufe pro Stunde & Fan (Limit)</Label>
              <Input type="number" inputMode="numeric" value={form.max_purchases_per_hour} onChange={(e) => setForm({ ...form, max_purchases_per_hour: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Gültigkeit Einmal-Link (Stunden)</Label>
              <Input type="number" inputMode="numeric" value={form.link_ttl_hours} onChange={(e) => setForm({ ...form, link_ttl_hours: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Max. Aufrufe pro Zugangslink</Label>
              <Input type="number" inputMode="numeric" value={form.link_max_views} onChange={(e) => setForm({ ...form, link_max_views: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Chat-ID Kontrollraum (Alarme)</Label>
            <Input value={form.control_chat_id ?? ""} onChange={(e) => setForm({ ...form, control_chat_id: e.target.value })} inputMode="numeric" placeholder="z. B. deine Telegram-ID" />
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {([
              ["notify_blocked", "Alarm bei gesperrtem Konto"],
              ["notify_unpaid", "Alarm bei fehlender Zahlung"],
              ["notify_expired", "Alarm bei abgelaufenem Zugang"],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-[hsl(var(--primary))]"
                  checked={Boolean(form[key])}
                  onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                />
                {label}
              </label>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label>Upsell-Text nach dem Kauf</Label>
            <Input value={form.upsell_message} onChange={(e) => setForm({ ...form, upsell_message: e.target.value })} />
          </div>

          <div className="rounded-xl border border-border p-4">
            <h3 className="mb-3 font-semibold">Automationen</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>VIP-Laufzeit (Tage, 0 = dauerhaft)</Label>
                <Input type="number" min={0} value={form.vip_period_days ?? 0} onChange={(e) => setForm({ ...form, vip_period_days: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>VIP-Erinnerung vor Ablauf (Tage)</Label>
                <Input type="number" min={0} value={form.vip_reminder_days ?? 3} onChange={(e) => setForm({ ...form, vip_reminder_days: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Reaktivierung nach Inaktivität (Tage)</Label>
                <Input type="number" min={0} value={form.reactivate_after_days ?? 14} onChange={(e) => setForm({ ...form, reactivate_after_days: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Warenkorb-Erinnerung nach (Minuten)</Label>
                <Input type="number" min={0} value={form.cart_recovery_minutes ?? 30} onChange={(e) => setForm({ ...form, cart_recovery_minutes: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Rabattcode für Warenkorb-Rettung</Label>
                <Input value={form.cart_recovery_code ?? ""} onChange={(e) => setForm({ ...form, cart_recovery_code: e.target.value.toUpperCase() })} placeholder="optional" />
              </div>
              <div className="space-y-1.5">
                <Label>Content-Ablaufwarnung (Stunden vorher)</Label>
                <Input type="number" min={0} value={form.content_expiry_reminder_hours ?? 6} onChange={(e) => setForm({ ...form, content_expiry_reminder_hours: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Referral-Stufe ab Käufen</Label>
                <Input type="number" min={1} value={form.referral_tier_threshold ?? 5} onChange={(e) => setForm({ ...form, referral_tier_threshold: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Referral-Provision Stufe (%)</Label>
                <Input type="number" min={0} max={90} value={form.referral_tier_percent ?? 30} onChange={(e) => setForm({ ...form, referral_tier_percent: e.target.value })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Trinkgeld-Stufen (Stars, kommagetrennt)</Label>
                <Input value={form.tip_amounts ?? "50,150,500"} onChange={(e) => setForm({ ...form, tip_amounts: e.target.value })} placeholder="50,150,500" />
              </div>
            </div>
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-[hsl(var(--primary))]"
                checked={Boolean(form.sequence_enabled)}
                onChange={(e) => setForm({ ...form, sequence_enabled: e.target.checked })}
              />
              Willkommens-Sequenz automatisch senden
            </label>
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
                    trx_wallet: form.trx_wallet ?? "",
                    affiliate_percent: Number(form.affiliate_percent),
                    tip_message: form.tip_message,
                    upsell_message: form.upsell_message,
                    community_chat_id: form.community_chat_id,
                    shop_chat_id: form.shop_chat_id,
                    app_base_url: form.app_base_url,
                    early_access_price_stars: Number(form.early_access_price_stars),
                    sponsor_price_stars: Number(form.sponsor_price_stars),
                    link_ttl_hours: Number(form.link_ttl_hours),
                    link_max_views: Number(form.link_max_views),
                    max_purchases_per_hour: Number(form.max_purchases_per_hour),
                    control_chat_id: form.control_chat_id ?? "",
                    notify_blocked: Boolean(form.notify_blocked),
                    notify_unpaid: Boolean(form.notify_unpaid),
                    notify_expired: Boolean(form.notify_expired),
                    vip_period_days: Number(form.vip_period_days ?? 0),
                    vip_reminder_days: Number(form.vip_reminder_days ?? 3),
                    reactivate_after_days: Number(form.reactivate_after_days ?? 14),
                    sequence_enabled: Boolean(form.sequence_enabled),
                    cart_recovery_minutes: Number(form.cart_recovery_minutes ?? 30),
                    cart_recovery_code: String(form.cart_recovery_code ?? ""),
                    referral_tier_threshold: Number(form.referral_tier_threshold ?? 5),
                    referral_tier_percent: Number(form.referral_tier_percent ?? 30),
                    tip_amounts: String(form.tip_amounts ?? "50,150,500"),
                    content_expiry_reminder_hours: Number(form.content_expiry_reminder_hours ?? 6),
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
            /start → Gratis-Gruppe für Fans → Shop, Pay-per-View, VIP-Zugang → Zahlung per Stars, TON oder TRX → sichere
            Auslieferung (Einmal-Link) → Upsell → Empfehlungslink mit Provision. Zusätzlich im Bot: /warteliste für
            Early-Access-Slots und /werbung für bezahlte Werbeposts.
          </div>
        </div>
      </div>
    </DashLayout>
  );
}
