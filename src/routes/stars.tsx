import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Star } from "lucide-react";
import { DashLayout } from "@/components/DashLayout";
import { useAdmin } from "@/lib/useAdmin";
import { getSettings, saveStarsSettings } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/stars")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "Stars-Einstellungen – Telegram Fan Funnel Studio" },
      {
        name: "description",
        content: "VIP-Preis, Early-Access, Werbepreise, Provision und Zugangslimits in Telegram Stars festlegen.",
      },
      { property: "og:title", content: "Stars-Einstellungen – Telegram Fan Funnel Studio" },
      { property: "og:description", content: "Alle Preise in Telegram Stars an einer Stelle." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StarsPage,
});

const fields: { key: string; label: string; hint: string; min: number }[] = [
  { key: "vip_price_stars", label: "VIP-Zugang (Stars)", hint: "Preis für den bezahlten Shop-Channel.", min: 1 },
  { key: "vip_invite_ttl_hours", label: "Einladung gültig (Stunden)", hint: "Laufzeit persönlicher Einmal-Links.", min: 1 },
  { key: "early_access_price_stars", label: "Early Access (Stars)", hint: "Vorabzugang zum nächsten Drop.", min: 0 },
  { key: "sponsor_price_stars", label: "Werbepost (Stars)", hint: "Preis pro gebuchtem Werbepost.", min: 0 },
  { key: "affiliate_percent", label: "Provision (%)", hint: "Anteil für Empfehlungen.", min: 0 },
  { key: "link_ttl_hours", label: "Inhalts-Link gültig (Stunden)", hint: "Laufzeit für Einmal-Zugänge.", min: 1 },
  { key: "link_max_views", label: "Aufrufe je Link", hint: "Maximale Öffnungen pro Zugang.", min: 1 },
  { key: "max_purchases_per_hour", label: "Käufe je Stunde", hint: "Schutz vor Missbrauch.", min: 1 },
];

function StarsPage() {
  const { isAdmin } = useAdmin();
  const getFn = useServerFn(getSettings);
  const saveFn = useServerFn(saveStarsSettings);
  const { data, refetch } = useQuery({
    queryKey: ["settings"],
    queryFn: () => getFn({ data: undefined as never }),
    enabled: isAdmin,
  });
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data && !form) setForm(data);
  }, [data, form]);

  if (!isAdmin) return <DashLayout title="Stars">Nur für Admins.</DashLayout>;
  if (!form) return <DashLayout title="Stars">Lädt…</DashLayout>;

  const save = async () => {
    setSaving(true);
    try {
      await saveFn({
        data: {
          vip_price_stars: Number(form.vip_price_stars ?? 450),
          vip_product_title: String(form.vip_product_title || "VIP-Zugang"),
          vip_invite_ttl_hours: Number(form.vip_invite_ttl_hours ?? 24),
          early_access_price_stars: Number(form.early_access_price_stars ?? 0),
          sponsor_price_stars: Number(form.sponsor_price_stars ?? 0),
          affiliate_percent: Number(form.affiliate_percent ?? 0),
          link_ttl_hours: Number(form.link_ttl_hours ?? 24),
          link_max_views: Number(form.link_max_views ?? 3),
          max_purchases_per_hour: Number(form.max_purchases_per_hour ?? 5),
          tip_message: String(form.tip_message ?? ""),
        },
      });
      toast.success("Stars-Einstellungen gespeichert");
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashLayout title="Stars & Preise" subtitle="Alle Preise deines Funnels in Telegram Stars.">
      <div className="rounded-xl border bg-card p-4">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
          <Star className="size-4 text-primary" /> Preise
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="vip_title">Titel des VIP-Angebots</Label>
            <Input
              id="vip_title"
              value={form.vip_product_title ?? ""}
              onChange={(e) => setForm({ ...form, vip_product_title: e.target.value })}
            />
          </div>
          {fields.map((f) => (
            <div key={f.key}>
              <Label htmlFor={f.key}>{f.label}</Label>
              <Input
                id={f.key}
                type="number"
                min={f.min}
                value={form[f.key] ?? 0}
                onChange={(e) => setForm({ ...form, [f.key]: Number(e.target.value) })}
              />
              <p className="mt-1 text-xs text-muted-foreground">{f.hint}</p>
            </div>
          ))}
          <div className="sm:col-span-2">
            <Label htmlFor="tip">Trinkgeld-Text im Bot</Label>
            <Textarea
              id="tip"
              rows={3}
              value={form.tip_message ?? ""}
              onChange={(e) => setForm({ ...form, tip_message: e.target.value })}
            />
          </div>
        </div>
        <Button className="mt-4" onClick={save} disabled={saving}>
          {saving ? "Speichert…" : "Speichern"}
        </Button>
      </div>
    </DashLayout>
  );
}
