import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil } from "lucide-react";
import { DashLayout } from "@/components/DashLayout";
import { listProducts, saveProduct, deleteProduct } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/produkte")({
  head: () => ({
    meta: [
      { title: "Inhalte & Preise – Telegram Fan Funnel Studio" },
      {
        name: "description",
        content: "Digitale Inhalte, Bundles, Pay-per-View und VIP-Zugänge mit Preisen in Telegram Stars und TON verwalten.",
      },
      { property: "og:title", content: "Inhalte & Preise – Telegram Fan Funnel Studio" },
      { property: "og:description", content: "Produkte, Bundles und Upsells für deinen Telegram-Bot pflegen." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProductsPage,
});

const empty = {
  title: "",
  description: "",
  kind: "single" as const,
  price_stars: 100,
  price_ton: 0,
  delivery_type: "text" as const,
  delivery_payload: "",
  active: true,
  sort_order: 0,
  upsell_product_id: null as string | null,
};

const kindLabel: Record<string, string> = {
  single: "Einzelkauf",
  bundle: "Bundle",
  ppv: "Pay-per-View",
  tip: "Trinkgeld",
};

function ProductsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listProducts);
  const saveFn = useServerFn(saveProduct);
  const delFn = useServerFn(deleteProduct);
  const { session } = useAuth();
  const { data: products } = useQuery({ queryKey: ["products"], queryFn: () => listFn({ data: undefined as never }), enabled: Boolean(session) });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(empty);

  async function save() {
    try {
      await saveFn({ data: { ...form, price_stars: Number(form.price_stars), price_ton: Number(form.price_ton), sort_order: Number(form.sort_order) } });
      toast.success("Gespeichert");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["products"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    }
  }

  return (
    <DashLayout title="Inhalte & Preise" subtitle="Einzelverkäufe, Bundles, Pay-per-View und VIP-Zugänge.">
      <Button
        className="mb-5 gap-2"
        onClick={() => {
          setForm(empty);
          setOpen(true);
        }}
      >
        <Plus className="size-4" /> Neuer Inhalt
      </Button>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(products ?? []).map((p: any) => (
          <div key={p.id} className="panel flex flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold">{p.title}</h3>
              <Badge variant={p.active ? "default" : "secondary"}>{p.active ? "aktiv" : "pausiert"}</Badge>
            </div>
            <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">{kindLabel[p.kind]}</p>
            <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>
            <p className="mt-4 font-display text-xl font-bold gold-text">
              ⭐ {p.price_stars}
              {Number(p.price_ton) > 0 ? ` · ${p.price_ton} TON` : ""}
            </p>
            <div className="mt-4 flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="gap-1"
                onClick={() => {
                  setForm(p);
                  setOpen(true);
                }}
              >
                <Pencil className="size-3.5" /> Bearbeiten
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="gap-1 text-destructive"
                onClick={async () => {
                  await delFn({ data: { id: p.id } });
                  qc.invalidateQueries({ queryKey: ["products"] });
                }}
              >
                <Trash2 className="size-3.5" /> Löschen
              </Button>
            </div>
          </div>
        ))}
        {products?.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Inhalte angelegt.</p>
        ) : null}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Inhalt bearbeiten" : "Neuer Inhalt"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Titel</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Beschreibung</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Art</Label>
                <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Einzelkauf</SelectItem>
                    <SelectItem value="bundle">Bundle</SelectItem>
                    <SelectItem value="ppv">Pay-per-View</SelectItem>
                    <SelectItem value="tip">Trinkgeld</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Reihenfolge</Label>
                <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Preis in Stars</Label>
                <Input type="number" value={form.price_stars} onChange={(e) => setForm({ ...form, price_stars: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Preis in TON</Label>
                <Input type="number" step="0.01" value={form.price_ton} onChange={(e) => setForm({ ...form, price_ton: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Auslieferung</Label>
              <Select value={form.delivery_type} onValueChange={(v) => setForm({ ...form, delivery_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text im Chat</SelectItem>
                  <SelectItem value="file">Datei (Telegram file_id)</SelectItem>
                  <SelectItem value="link">Link / Gruppen-Einladung</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Inhalt / file_id / Link</Label>
              <Textarea value={form.delivery_payload} onChange={(e) => setForm({ ...form, delivery_payload: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Upsell nach dem Kauf</Label>
              <Select
                value={form.upsell_product_id ?? "none"}
                onValueChange={(v) => setForm({ ...form, upsell_product_id: v === "none" ? null : v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Kein Upsell</SelectItem>
                  {(products ?? [])
                    .filter((p: any) => p.id !== form.id)
                    .map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
              <Label htmlFor="active">Im Bot sichtbar</Label>
              <Switch id="active" checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
            </div>
            <Button className="w-full" onClick={save}>Speichern</Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashLayout>
  );
}
