import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Archive, Bot, CheckCircle2, FolderOpen, Images, Layers3, LockKeyhole, Package, Plus, Send, Sparkles, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { DashLayout } from "@/components/DashLayout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAdmin } from "@/lib/useAdmin";
import {
  cleanupContentSmokeTest,
  createContentBundle,
  createContentSeries,
  createContentSet,
  createContentSmokeTest,
  getContentStudio,
  publishContentSet,
  setContentUpsell,
  updateContentSet,
} from "@/lib/content.functions";

export const Route = createFileRoute("/content")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "Content Studio – Fan Funnel" },
      { name: "description", content: "Interne Content-Verwaltung für Shop-Gruppe und Telegram-Bot." },
    ],
  }),
  component: ContentStudio,
});

function ContentStudio() {
  const { canRead, isAdmin, ready } = useAdmin();
  const qc = useQueryClient();
  const listFn = useServerFn(getContentStudio);
  const createFn = useServerFn(createContentSet);
  const updateFn = useServerFn(updateContentSet);
  const publishFn = useServerFn(publishContentSet);
  const createSeriesFn = useServerFn(createContentSeries);
  const createBundleFn = useServerFn(createContentBundle);
  const smokeFn = useServerFn(createContentSmokeTest);
  const cleanupSmokeFn = useServerFn(cleanupContentSmokeTest);
  const upsellFn = useServerFn(setContentUpsell);
  const [form, setForm] = useState({
    title: "",
    description: "",
    folderId: "",
    previewFileId: "",
    priceStars: 499,
    priceTon: 0,
    priceTrx: 0,
    accessMode: "permanent" as "permanent" | "hours" | "vip",
    accessHours: 24,
    seriesId: "",
    status: "draft" as "draft" | "active",
  });
  const [seriesForm, setSeriesForm] = useState({ title: "", description: "" });
  const [bundleForm, setBundleForm] = useState({ title: "", description: "", priceStars: 999, setIds: [] as string[] });

  const query = useQuery({
    queryKey: ["content-studio"],
    queryFn: () => listFn({ data: undefined as never }),
    enabled: canRead,
  });

  const folders = (query.data as any)?.folders ?? [];
  const sets = (query.data as any)?.sets ?? [];
  const series = (query.data as any)?.series ?? [];
  const analytics = (query.data as any)?.analytics ?? {};
  const bundles = (query.data as any)?.bundles ?? [];
  const totalRevenue = Object.values(analytics).reduce((sum: number, row: any) => sum + Number(row?.revenueStars ?? 0), 0);
  const totalTon = Object.values(analytics).reduce((sum: number, row: any) => sum + Number(row?.revenueTon ?? 0), 0);
  const totalTrx = Object.values(analytics).reduce((sum: number, row: any) => sum + Number(row?.revenueTrx ?? 0), 0);
  const selectedFolder = useMemo(() => folders.find((f: any) => f.id === form.folderId), [folders, form.folderId]);

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          title: form.title,
          description: form.description,
          folderId: form.folderId,
          previewFileId: form.previewFileId || null,
          priceStars: form.priceStars,
          priceTon: form.priceTon,
          priceTrx: form.priceTrx,
          accessMode: form.accessMode,
          accessHours: form.accessMode === "hours" ? form.accessHours : null,
          seriesId: form.seriesId || null,
          status: form.status,
        },
      }),
    onSuccess: () => {
      toast.success("Content-Set angelegt");
      setForm({ title: "", description: "", folderId: "", previewFileId: "", priceStars: 499, priceTon: 0, priceTrx: 0, accessMode: "permanent", accessHours: 24, seriesId: "", status: "draft" });
      qc.invalidateQueries({ queryKey: ["content-studio"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Content konnte nicht angelegt werden"),
  });

  async function patch(id: string, data: any) {
    try {
      await updateFn({ data: { id, ...data } });
      await qc.invalidateQueries({ queryKey: ["content-studio"] });
      toast.success("Gespeichert");
    } catch (e: any) {
      toast.error(e?.message ?? "Änderung fehlgeschlagen");
    }
  }

  async function publish(id: string) {
    try {
      await publishFn({ data: { id, target: "shop" } });
      await qc.invalidateQueries({ queryKey: ["content-studio"] });
      toast.success("In der Shop-Gruppe veröffentlicht");
    } catch (e: any) {
      toast.error(e?.message ?? "Veröffentlichung fehlgeschlagen");
    }
  }

  async function createSmokeTest() {
    try {
      const result = await smokeFn({ data: undefined as never });
      await qc.invalidateQueries({ queryKey: ["content-studio"] });
      toast.success((result as any)?.reused ? "Smoke-Test reaktiviert" : "1-Star-Smoke-Test angelegt");
    } catch (e: any) {
      toast.error(e?.message ?? "Smoke-Test konnte nicht angelegt werden");
    }
  }

  async function cleanupSmokeTest() {
    try {
      await cleanupSmokeFn({ data: undefined as never });
      await qc.invalidateQueries({ queryKey: ["content-studio"] });
      toast.success("Smoke-Test entfernt");
    } catch (e: any) {
      toast.error(e?.message ?? "Smoke-Test konnte nicht entfernt werden");
    }
  }

  async function createSeries() {
    try {
      await createSeriesFn({ data: seriesForm });
      setSeriesForm({ title: "", description: "" });
      await qc.invalidateQueries({ queryKey: ["content-studio"] });
      toast.success("Serie angelegt");
    } catch (e: any) {
      toast.error(e?.message ?? "Serie konnte nicht angelegt werden");
    }
  }

  async function createBundle() {
    try {
      await createBundleFn({
        data: {
          title: bundleForm.title,
          description: bundleForm.description,
          priceStars: bundleForm.priceStars,
          contentSetIds: bundleForm.setIds,
        },
      });
      setBundleForm({ title: "", description: "", priceStars: 999, setIds: [] });
      await qc.invalidateQueries({ queryKey: ["content-studio"] });
      toast.success("Bundle angelegt");
    } catch (e: any) {
      toast.error(e?.message ?? "Bundle konnte nicht angelegt werden");
    }
  }

  async function setUpsell(contentSetId: string, upsellContentSetId: string | null) {
    try {
      await upsellFn({ data: { contentSetId, upsellContentSetId } });
      await qc.invalidateQueries({ queryKey: ["content-studio"] });
      toast.success("Upsell gespeichert");
    } catch (e: any) {
      toast.error(e?.message ?? "Upsell konnte nicht gespeichert werden");
    }
  }

  return (
    <DashLayout title="Content Studio" subtitle="Intern verwalten – Kunden sehen nur Bot, Shop-Gruppe und freigeschaltete Telegram-Inhalte">
      {!ready ? (
        <p className="text-sm text-muted-foreground">Lade…</p>
      ) : !canRead ? (
        <div className="panel p-6">Kein Zugriff.</div>
      ) : (
        <div className="space-y-6">
          {isAdmin && (
            <section className="panel flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">Live-Smoke-Test vorbereiten</p>
                <p className="text-sm text-muted-foreground">Erzeugt aus einem freigegebenen Preview-Medium ein aktives 1-Star-Testset für Shop-Post, Zahlung und Telegram-Auslieferung.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={createSmokeTest}>1-Star-Testset anlegen</Button>
                <Button variant="outline" onClick={cleanupSmokeTest}>Testset entfernen</Button>
              </div>
            </section>
          )}

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div className="panel p-4"><p className="text-xs text-muted-foreground">Content-Sets</p><p className="mt-1 text-2xl font-bold">{sets.length}</p></div>
            <div className="panel p-4"><p className="text-xs text-muted-foreground">Aktiv</p><p className="mt-1 text-2xl font-bold">{sets.filter((s: any) => s.status === "active").length}</p></div>
            <div className="panel p-4"><p className="text-xs text-muted-foreground">Serien</p><p className="mt-1 text-2xl font-bold">{series.length}</p></div>
            <div className="panel p-4"><p className="text-xs text-muted-foreground">Bundles</p><p className="mt-1 text-2xl font-bold">{bundles.length}</p></div>
            <div className="panel p-4"><p className="text-xs text-muted-foreground">Content-Umsatz</p><p className="mt-1 flex items-center gap-1 text-lg font-bold"><TrendingUp className="size-5" />⭐ {totalRevenue} · {totalTon} TON · {totalTrx} TRX</p></div>
            <div className="panel p-4"><p className="text-xs text-muted-foreground">Prinzip</p><p className="mt-1 flex items-center gap-1 font-semibold"><LockKeyhole className="size-4" /> Telegram only</p></div>
          </section>

          <section className="panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Medienbibliothek</h2>
                <p className="text-sm text-muted-foreground">Dateien zuerst geschützt hochladen, danach hier zu verkaufbaren Sets zusammenstellen.</p>
              </div>
              <Button asChild variant="secondary"><Link to="/medien"><Images className="mr-2 size-4" /> Medien hochladen & verwalten</Link></Button>
            </div>
          </section>

          <section className="panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="font-semibold">Verkauf & Automatisierung</h2><p className="text-sm text-muted-foreground">Content-Sets nutzen die vorhandenen Module für Drops, Kampagnen und Benachrichtigungen.</p></div>
              <div className="flex flex-wrap gap-2"><Button asChild variant="outline" size="sm"><Link to="/drops">Drops</Link></Button><Button asChild variant="outline" size="sm"><Link to="/kampagnen">Kampagnen</Link></Button><Button asChild variant="outline" size="sm"><Link to="/benachrichtigungen">Benachrichtigungen</Link></Button></div>
            </div>
          </section>

          {isAdmin && (
            <section className="panel p-5">
              <div className="flex items-center gap-2"><Sparkles className="size-5 text-primary" /><h2 className="text-lg font-semibold">Neues Content-Set</h2></div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5"><Label>Titel</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="z. B. Midnight Set #01" /></div>
                <div className="space-y-1.5"><Label>Preis in Stars</Label><Input type="number" min={1} value={form.priceStars} onChange={(e) => setForm({ ...form, priceStars: Number(e.target.value) })} /></div>
                <div className="space-y-1.5"><Label>Preis in TON (optional)</Label><Input type="number" min={0} step="0.01" value={form.priceTon} onChange={(e) => setForm({ ...form, priceTon: Number(e.target.value) })} /></div>
                <div className="space-y-1.5"><Label>Preis in TRX (optional)</Label><Input type="number" min={0} step="0.01" value={form.priceTrx} onChange={(e) => setForm({ ...form, priceTrx: Number(e.target.value) })} /></div>
                <div className="space-y-1.5 sm:col-span-2"><Label>Beschreibung</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                <div className="space-y-1.5">
                  <Label>Medienordner</Label>
                  <Select value={form.folderId} onValueChange={(v) => setForm({ ...form, folderId: v, previewFileId: "" })}>
                    <SelectTrigger><SelectValue placeholder="Ordner auswählen" /></SelectTrigger>
                    <SelectContent>{folders.map((f: any) => <SelectItem key={f.id} value={f.id}>{f.title} · {f.media_files?.length ?? 0} Dateien</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Serie</Label>
                  <Select value={form.seriesId || "none"} onValueChange={(v) => setForm({ ...form, seriesId: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="Keine Serie" /></SelectTrigger>
                    <SelectContent><SelectItem value="none">Keine Serie</SelectItem>{series.map((row: any) => <SelectItem key={row.id} value={row.id}>{row.title}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Vorschau</Label>
                  <Select value={form.previewFileId} onValueChange={(v) => setForm({ ...form, previewFileId: v })} disabled={!selectedFolder}>
                    <SelectTrigger><SelectValue placeholder="Automatisch / Datei wählen" /></SelectTrigger>
                    <SelectContent>{(selectedFolder?.media_files ?? []).filter((f: any) => f.preview_allowed === true).map((f: any) => <SelectItem key={f.id} value={f.id}>{f.display_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Zugriff</Label>
                  <Select value={form.accessMode} onValueChange={(v: any) => setForm({ ...form, accessMode: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="permanent">Dauerhaft</SelectItem><SelectItem value="hours">Zeitlich begrenzt</SelectItem><SelectItem value="vip">VIP</SelectItem></SelectContent>
                  </Select>
                </div>
                {form.accessMode === "hours" && <div className="space-y-1.5"><Label>Stunden</Label><Input type="number" min={1} max={8760} value={form.accessHours} onChange={(e) => setForm({ ...form, accessHours: Number(e.target.value) })} /></div>}
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v: any) => setForm({ ...form, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="draft">Entwurf</SelectItem><SelectItem value="active">Direkt aktiv</SelectItem></SelectContent></Select>
                </div>
              </div>
              <Button className="mt-4" disabled={!form.title || !form.folderId || create.isPending} onClick={() => create.mutate()}><Plus className="mr-2 size-4" /> Content-Set anlegen</Button>
            </section>
          )}

          {isAdmin && (
            <section className="grid gap-4 lg:grid-cols-2">
              <div className="panel p-5">
                <div className="flex items-center gap-2"><Layers3 className="size-5 text-primary" /><h2 className="font-semibold">Content-Serie</h2></div>
                <div className="mt-4 space-y-3">
                  <Input value={seriesForm.title} onChange={(e) => setSeriesForm({ ...seriesForm, title: e.target.value })} placeholder="Serienname" />
                  <Textarea value={seriesForm.description} onChange={(e) => setSeriesForm({ ...seriesForm, description: e.target.value })} placeholder="Beschreibung" />
                  <Button disabled={!seriesForm.title} onClick={createSeries}><Plus className="mr-2 size-4" /> Serie anlegen</Button>
                </div>
              </div>
              <div className="panel p-5">
                <div className="flex items-center gap-2"><Package className="size-5 text-primary" /><h2 className="font-semibold">Content-Bundle</h2></div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Input value={bundleForm.title} onChange={(e) => setBundleForm({ ...bundleForm, title: e.target.value })} placeholder="Bundle-Titel" />
                  <Input type="number" min={1} value={bundleForm.priceStars} onChange={(e) => setBundleForm({ ...bundleForm, priceStars: Number(e.target.value) })} placeholder="Stars" />
                  <Textarea className="sm:col-span-2" value={bundleForm.description} onChange={(e) => setBundleForm({ ...bundleForm, description: e.target.value })} placeholder="Bundle-Beschreibung" />
                  <div className="sm:col-span-2 max-h-48 space-y-2 overflow-auto rounded-md border p-3">
                    {sets.filter((row: any) => row.status !== "archived").map((row: any) => {
                      const checked = bundleForm.setIds.includes(row.id);
                      return <label key={row.id} className="flex cursor-pointer items-center gap-2 text-sm"><Checkbox checked={checked} onCheckedChange={(value) => setBundleForm({ ...bundleForm, setIds: value ? [...bundleForm.setIds, row.id] : bundleForm.setIds.filter((id) => id !== row.id) })} /><span>{row.title}</span></label>;
                    })}
                  </div>
                  <Button className="sm:col-span-2" disabled={!bundleForm.title || bundleForm.setIds.length < 2} onClick={createBundle}><Package className="mr-2 size-4" /> Bundle aus {bundleForm.setIds.length} Sets anlegen</Button>
                </div>
              </div>
            </section>
          )}

          <section className="space-y-3">
            <div className="flex items-center gap-2"><FolderOpen className="size-5" /><h2 className="text-lg font-semibold">Content-Sets</h2></div>
            {sets.length === 0 ? <div className="panel p-6 text-sm text-muted-foreground">Noch keine Content-Sets. Medien hochladen und das erste Set erstellen.</div> : sets.map((set: any) => {
              const protectedCount = (set.content_set_items ?? []).filter((i: any) => i.item_role === "protected").length;
              const previewCount = (set.content_set_items ?? []).filter((i: any) => i.item_role === "preview").length;
              return (
                <article key={set.id} className="panel p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2"><h3 className="font-semibold">{set.title}</h3>{set.status === "active" ? <CheckCircle2 className="size-4 text-emerald-500" /> : set.status === "archived" ? <Archive className="size-4" /> : <span className="rounded bg-muted px-2 py-0.5 text-xs">Entwurf</span>}</div>
                      <p className="mt-1 text-sm text-muted-foreground">{set.description || "Keine Beschreibung"}</p>
                      <p className="mt-2 text-xs text-muted-foreground">⭐ {set.products?.price_stars ?? 0}{Number(set.products?.price_ton) > 0 ? ` · ${set.products.price_ton} TON` : ""}{Number(set.products?.price_trx) > 0 ? ` · ${set.products.price_trx} TRX` : ""} · {protectedCount} geschützte Medien · {previewCount} Preview · {set.access_mode === "hours" ? `${set.access_hours}h` : set.access_mode}{set.content_series?.title ? ` · Serie: ${set.content_series.title}` : ""}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Verkäufe: {analytics[set.id]?.sales ?? 0} · Umsatz: ⭐ {analytics[set.id]?.revenueStars ?? 0} · {analytics[set.id]?.revenueTon ?? 0} TON · {analytics[set.id]?.revenueTrx ?? 0} TRX · bereits geöffnet: {analytics[set.id]?.ownersOpened ?? 0}</p>
                    </div>
                    {isAdmin && <div className="flex min-w-56 flex-col gap-2">
                      <div className="flex flex-wrap gap-2">
                        {set.status !== "active" ? <Button size="sm" variant="secondary" onClick={() => patch(set.id, { status: "active" })}>Aktivieren</Button> : <Button size="sm" variant="secondary" onClick={() => patch(set.id, { status: "draft" })}>Pausieren</Button>}
                        <Button size="sm" disabled={set.status !== "active"} onClick={() => publish(set.id)}><Send className="mr-1.5 size-4" /> Shop-Gruppe</Button>
                        {set.status !== "archived" && <Button size="sm" variant="outline" onClick={() => patch(set.id, { status: "archived" })}><Archive className="mr-1.5 size-4" /> Archiv</Button>}
                      </div>
                      <Select value={set.series_id ?? "none"} onValueChange={(value) => patch(set.id, { seriesId: value === "none" ? null : value })}>
                        <SelectTrigger className="h-8"><SelectValue placeholder="Serie" /></SelectTrigger>
                        <SelectContent><SelectItem value="none">Keine Serie</SelectItem>{series.map((row: any) => <SelectItem key={row.id} value={row.id}>{row.title}</SelectItem>)}</SelectContent>
                      </Select>
                      <Select value={sets.find((row: any) => row.products?.id === set.products?.upsell_product_id)?.id ?? "none"} onValueChange={(value) => setUpsell(set.id, value === "none" ? null : value)}>
                        <SelectTrigger className="h-8"><SelectValue placeholder="Upsell" /></SelectTrigger>
                        <SelectContent><SelectItem value="none">Kein Upsell</SelectItem>{sets.filter((row: any) => row.id !== set.id && row.status === "active").map((row: any) => <SelectItem key={row.id} value={row.id}>Danach: {row.title}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>}
                  </div>
                </article>
              );
            })}
          </section>

          <section className="panel p-5">
            <div className="flex items-start gap-3"><Bot className="mt-0.5 size-5 text-primary" /><div><h2 className="font-semibold">Kundenfluss</h2><p className="mt-1 text-sm text-muted-foreground">Shop-Gruppe → 🔒 Preview → Bot → Stars, TON oder TRX → Zahlungsbestätigung → 🔓 Freischaltung → Medien direkt im privaten Telegram-Chat. Kein Kunden-Login und kein Kunden-Dashboard.</p></div></div>
          </section>
        </div>
      )}
    </DashLayout>
  );
}
