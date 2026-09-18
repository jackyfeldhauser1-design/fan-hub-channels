import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Rocket, Sparkles } from "lucide-react";
import { submitLead } from "@/lib/public.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/warteliste")({
  head: () => ({
    meta: [
      { title: "Warteliste & Early Access sichern" },
      {
        name: "description",
        content: "Trag dich für kommende Drops ein und sichere dir optional einen bezahlten Early-Access-Slot mit Vorabzugang und Bonusinhalten.",
      },
      { property: "og:title", content: "Warteliste & Early Access sichern" },
      {
        property: "og:description",
        content: "Sei als Erste:r dabei: Warteliste kostenlos, Early-Access-Slot mit Telegram Stars.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: "https://fan-hub-channels.netlify.app/warteliste" },
    ],
    links: [{ rel: "canonical", href: "https://fan-hub-channels.netlify.app/warteliste" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Start", item: "https://fan-hub-channels.netlify.app" },
            { "@type": "ListItem", position: 2, name: "Warteliste", item: "https://fan-hub-channels.netlify.app/warteliste" },
          ],
        }),
      },
    ],
  }),
  component: WaitlistPage,
});

function WaitlistPage() {
  const submit = useServerFn(submitLead);
  const [form, setForm] = useState({ name: "", email: "", telegram_handle: "", interest: "", early_access: false });
  const [claim, setClaim] = useState<{ url: string; price: number } | null>(null);
  const [busy, setBusy] = useState(false);

  if (claim) {
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <div className="panel max-w-md p-8 text-center">
          <Sparkles className="mx-auto size-8 text-primary" />
          <h1 className="mt-4 text-2xl font-bold">Du stehst auf der Liste!</h1>
          {claim.url ? (
            <>
              <p className="mt-2 text-sm text-muted-foreground">
                Sichere dir jetzt deinen Early-Access-Slot für ⭐ {claim.price} direkt im Telegram-Chat.
              </p>
              <Button asChild className="mt-5 w-full">
                <a href={claim.url}>Early Access im Bot bezahlen</a>
              </Button>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Wir melden uns, sobald der nächste Drop startet.
            </p>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl gold-surface">
            <Rocket className="size-6" />
          </span>
          <h1 className="mt-4 text-3xl font-bold">Warteliste für den nächsten Drop</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Kostenlos eintragen – oder mit einem Early-Access-Slot vor allen anderen zugreifen.
          </p>
        </div>

        <form
          className="panel space-y-4 p-6"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const res = await submit({ data: form });
              setClaim({ url: res.claimUrl, price: res.priceStars });
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Bitte prüfe deine Eingaben.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" required maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">E-Mail</Label>
            <Input id="email" type="email" required maxLength={200} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tg">Telegram-Name (optional)</Label>
            <Input id="tg" maxLength={60} placeholder="@username" value={form.telegram_handle} onChange={(e) => setForm({ ...form, telegram_handle: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="interest">Worauf freust du dich? (optional)</Label>
            <Textarea id="interest" rows={3} maxLength={500} value={form.interest} onChange={(e) => setForm({ ...form, interest: e.target.value })} />
          </div>
          <label className="flex items-start gap-3 rounded-lg border border-border p-4 text-sm">
            <Checkbox
              checked={form.early_access}
              onCheckedChange={(v) => setForm({ ...form, early_access: v === true })}
            />
            <span>
              <span className="font-medium">Early-Access-Slot sichern</span>
              <span className="block text-muted-foreground">
                Kostenpflichtig in Telegram Stars: Vorabzugang zum Drop, bevor er öffentlich wird.
              </span>
            </span>
          </label>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Wird gesendet…" : "Eintragen"}
          </Button>
        </form>
      </div>
    </main>
  );
}
