import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Loader2, Megaphone, Clapperboard, Save } from "lucide-react";
import { DashLayout } from "@/components/DashLayout";
import { useAdmin } from "@/lib/useAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listDrops, saveDropPricing, publishDrop, getHealth } from "@/lib/drops.functions";

export const Route = createFileRoute("/drops")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "Drops & Aktionen – Telegram Fan Funnel Studio" },
      {
        name: "description",
        content:
          "Aktionspreise, Ablaufzeiten und limitierte Stückzahlen festlegen und Drops mit einem Klick in Ankündigungs- und Trailer-Channel veröffentlichen.",
      },
      { property: "og:title", content: "Drops & Aktionen – Telegram Fan Funnel Studio" },
      { property: "og:description", content: "Aktionen planen und Drops in einem Klick ankündigen." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DropsPage,
});

type Item = {
  id: string;
  kind: "product" | "folder";
  title: string;
  priceStars: number;
  salePriceStars: number;
  saleUntil: string | null;
  stockLimit: number;
  stockSold: number;
  effectivePrice: number;
  soldOut: boolean;
  saleActive: boolean;
  active: boolean;
};

function toLocalInput(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function DropCard({ item, disabled, onChanged }: { item: Item; disabled: boolean; onChanged: () => void }) {
  const saveFn = useServerFn(saveDropPricing);
  const publishFn = useServerFn(publishDrop);
  const [sale, setSale] = useState(String(item.salePriceStars || ""));
  const [until, setUntil] = useState(toLocalInput(item.saleUntil));
  const [stock, setStock] = useState(String(item.stockLimit || ""));

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          id: item.id,
          kind: item.kind,
          salePriceStars: Number(sale || 0),
          saleUntil: until ? new Date(until).toISOString() : null,
          stockLimit: Number(stock || 0),
        },
      }),
    onSuccess: () => {
      toast.success("Aktion gespeichert");
      onChanged();
    },
    onError: (e: any) => toast.error(e?.message ?? "Speichern fehlgeschlagen"),
  });

  const publish = useMutation({
    mutationFn: (targets: ("shop" | "community")[]) =>
      publishFn({ data: { id: item.id, kind: item.kind, targets } }),
    onSuccess: (res: any) => {
      const failed = (res.posts ?? []).filter((p: any) => !p.ok);
      if (failed.length === 0) toast.success("Drop veröffentlicht");
      else toast.error(failed[0].error || "Veröffentlichung fehlgeschlagen");
      onChanged();
    },
    onError: (e: any) => toast.error(e?.message ?? "Veröffentlichung fehlgeschlagen"),
  });

  return (
    <div className="panel space-y-4 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">{item.title}</h2>
        <span className="text-xs text-muted-foreground">
          {item.kind === "product" ? "Produkt" : "Medienordner"} · ⭐ {item.effectivePrice}
          {item.saleActive ? ` (statt ${item.priceStars})` : ""}
          {item.stockLimit > 0 ? ` · ${item.stockSold}/${item.stockLimit} verkauft` : ""}
          {item.soldOut ? " · ausverkauft" : ""}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Aktionspreis (Stars)</Label>
          <Input type="number" inputMode="numeric" value={sale} onChange={(e) => setSale(e.target.value)} placeholder="0 = keine Aktion" />
        </div>
        <div className="space-y-1.5">
          <Label>Aktion läuft bis</Label>
          <Input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Stückzahl-Limit</Label>
          <Input type="number" inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="0 = unbegrenzt" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" className="gap-2" disabled={disabled || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Aktion speichern
        </Button>
        <Button className="gap-2" disabled={disabled || publish.isPending} onClick={() => publish.mutate(["shop"])}>
          {publish.isPending ? <Loader2 className="size-4 animate-spin" /> : <Megaphone className="size-4" />}
          Im Shop posten
        </Button>
        <Button variant="outline" className="gap-2" disabled={disabled || publish.isPending} onClick={() => publish.mutate(["community"])}>
          <Clapperboard className="size-4" />
          Teaser in Community
        </Button>
      </div>
    </div>
  );
}

function DropsPage() {
  const { isAdmin } = useAdmin();
  const dropsFn = useServerFn(listDrops);
  const healthFn = useServerFn(getHealth);

  const drops = useQuery({
    queryKey: ["drops"],
    queryFn: () => dropsFn({ data: undefined as never }),
    enabled: isAdmin,
    retry: false,
  });
  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => healthFn({ data: undefined as never }),
    enabled: isAdmin,
    retry: false,
  });

  if (!isAdmin) {
    return (
      <DashLayout title="Drops & Aktionen">
        <p className="text-sm text-muted-foreground">Nur Administratoren können Drops verwalten.</p>
      </DashLayout>
    );
  }

  const items = (drops.data?.items ?? []) as Item[];
  const channels = drops.data?.channels;

  return (
    <DashLayout title="Drops & Aktionen" subtitle="Aktionspreise, Limits und Ein-Klick-Veröffentlichung in deine Channels.">
      <div className="space-y-4">
        <div className="panel p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Betriebsstatus</h2>
            <Button variant="secondary" onClick={() => health.refetch()} disabled={health.isFetching}>
              {health.isFetching ? <Loader2 className="size-4 animate-spin" /> : "Neu prüfen"}
            </Button>
          </div>
          <ul className="mt-3 divide-y divide-border">
            {(health.data?.checks ?? []).map((c) => (
              <li key={c.key} className="flex items-start gap-2 py-2">
                {c.ok ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                ) : (
                  <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium">{c.label}</p>
                  <p className="break-words text-xs text-muted-foreground">{c.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {!channels?.shop && !channels?.community ? (
          <p className="text-sm text-muted-foreground">
            Noch kein Shop- oder Community-Kanal verbunden – lege ihn unter „Verbinden“ oder im Bot-Setup fest.
          </p>
        ) : null}

        {drops.isLoading ? <p className="text-sm text-muted-foreground">Lädt…</p> : null}
        {items.map((item) => (
          <DropCard key={`${item.kind}-${item.id}`} item={item} disabled={!isAdmin} onChanged={() => drops.refetch()} />
        ))}
        {!drops.isLoading && items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Produkte oder Medienordner angelegt.</p>
        ) : null}
      </div>
    </DashLayout>
  );
}
