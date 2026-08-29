import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Megaphone } from "lucide-react";
import { submitSponsorRequest } from "@/lib/public.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/werbepartner")({
  head: () => ({
    meta: [
      { title: "Sponsored Post in der Community buchen" },
      {
        name: "description",
        content: "Buche einen bezahlten Werbepost in der Fan- oder VIP-Telegram-Gruppe: Anfrage stellen, in Telegram Stars zahlen, Post wird veröffentlicht.",
      },
      { property: "og:title", content: "Sponsored Post in der Community buchen" },
      { property: "og:description", content: "Erreiche eine engagierte Telegram-Community mit einem bezahlten Post." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: "https://fan-hub-channels.lovable.app/werbepartner" },
    ],
    links: [{ rel: "canonical", href: "https://fan-hub-channels.lovable.app/werbepartner" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Start", item: "https://fan-hub-channels.lovable.app" },
            { "@type": "ListItem", position: 2, name: "Werbepartner", item: "https://fan-hub-channels.lovable.app/werbepartner" },
          ],
        }),
      },
    ],
  }),
  component: SponsorForm,
});

function SponsorForm() {
  const submit = useServerFn(submitSponsorRequest);
  const [form, setForm] = useState({
    advertiser: "",
    contact: "",
    target: "free" as "free" | "vip" | "both",
    content: "",
    link_url: "",
    media_url: "",
  });
  const [done, setDone] = useState<{ url: string; price: number } | null>(null);
  const [busy, setBusy] = useState(false);

  if (done) {
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <div className="panel max-w-md p-8 text-center">
          <h1 className="text-2xl font-bold">Anfrage eingegangen</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Preis: ⭐ {done.price}. Nach Freigabe kannst du direkt im Bot bezahlen – danach wird dein Post
            veröffentlicht.
          </p>
          {done.url ? (
            <Button asChild className="mt-5 w-full">
              <a href={done.url}>Im Telegram-Bot bezahlen</a>
            </Button>
          ) : null}
        </div>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl gold-surface">
            <Megaphone className="size-6" />
          </span>
          <h1 className="mt-4 text-3xl font-bold">Werbepost buchen</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Platziere deine Anzeige in der Fan- oder VIP-Gruppe. Zahlung bequem in Telegram Stars.
          </p>
        </div>

        <form
          className="panel space-y-4 p-6"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const res = await submit({ data: form });
              setDone({ url: res.payUrl, price: res.priceStars });
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Bitte prüfe deine Eingaben.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="adv">Firma / Marke</Label>
            <Input id="adv" required maxLength={120} value={form.advertiser} onChange={(e) => setForm({ ...form, advertiser: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contact">Kontakt (E-Mail oder @Telegram)</Label>
            <Input id="contact" required maxLength={200} value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="target">Zielgruppe</Label>
            <select
              id="target"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.target}
              onChange={(e) => setForm({ ...form, target: e.target.value as typeof form.target })}
            >
              <option value="free">Fan-Gruppe (gratis Community)</option>
              <option value="vip">VIP-Gruppe</option>
              <option value="both">Beide Gruppen</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="content">Anzeigentext</Label>
            <Textarea id="content" rows={5} required maxLength={1500} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="link">Ziel-Link (optional)</Label>
            <Input id="link" maxLength={300} placeholder="https://…" value={form.link_url} onChange={(e) => setForm({ ...form, link_url: e.target.value })} />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Wird gesendet…" : "Anfrage senden"}
          </Button>
        </form>
      </div>
    </main>
  );
}
