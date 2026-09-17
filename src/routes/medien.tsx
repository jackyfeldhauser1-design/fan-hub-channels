import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FolderLock, Upload, Trash2, Eye, Plus, ArrowUp, ArrowDown, Star, Loader2, CheckCircle2, XCircle, ShoppingBag, Crown, Send } from "lucide-react";
import { DashLayout } from "@/components/DashLayout";
import { useAdmin } from "@/lib/useAdmin";
import {
  listMediaFolders,
  saveMediaFolder,
  deleteMediaFolder,
  createMediaUploadUrl,
  registerMediaFile,
  deleteMediaFile,
  previewMediaFile,
  updateMediaFile,
  setFolderPreview,
} from "@/lib/media.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createContentSet, publishContentSet } from "@/lib/content.functions";

export const Route = createFileRoute("/medien")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "Medien-Ordner – Fan Funnel Studio" },
      { name: "description", content: "Digitale Inhalte in kaufbaren Ordnern mit Download-Schutz verwalten." },
    ],
  }),
  component: MediaPage,
});

function human(bytes: number) {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i ? 1 : 0)} ${units[i]}`;
}

type Job = { id: string; folderId: string; name: string; progress: number; status: "wartet" | "läuft" | "fertig" | "fehler"; error?: string };

/** Datei mit Fortschritt in den geschützten Speicher laden. */
function putWithProgress(url: string, file: File, onProgress: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload fehlgeschlagen (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Netzwerkfehler beim Upload"));
    xhr.send(file);
  });
}

function MediaPage() {
  const { canRead, isAdmin, ready } = useAdmin();
  const qc = useQueryClient();
  const listFn = useServerFn(listMediaFolders);
  const saveFn = useServerFn(saveMediaFolder);
  const delFolderFn = useServerFn(deleteMediaFolder);
  const uploadUrlFn = useServerFn(createMediaUploadUrl);
  const registerFn = useServerFn(registerMediaFile);
  const delFileFn = useServerFn(deleteMediaFile);
  const previewFn = useServerFn(previewMediaFile);
  const updateFileFn = useServerFn(updateMediaFile);
  const setPreviewFn = useServerFn(setFolderPreview);
  const createContentFn = useServerFn(createContentSet);
  const publishContentFn = useServerFn(publishContentSet);

  const [form, setForm] = useState({ title: "", description: "", price_stars: 250, price_ton: 0 });
  const [jobs, setJobs] = useState<Job[]>([]);
  const [dragFolder, setDragFolder] = useState<string | null>(null);
  const [sellFolder, setSellFolder] = useState<any | null>(null);
  const [sellMode, setSellMode] = useState<"paid" | "vip">("paid");
  const [sellForm, setSellForm] = useState({ priceStars: 499, priceTon: 0, priceTrx: 0, accessMode: "permanent" as "permanent" | "hours" | "vip", accessHours: 24, previewFileId: "" });
  const [selling, setSelling] = useState(false);

  const query = useQuery({
    queryKey: ["media"],
    queryFn: () => listFn({ data: undefined as never }),
    enabled: canRead,
  });

  const save = useMutation({
    mutationFn: (input: any) => saveFn({ data: input }),
    onSuccess: () => {
      toast.success("Ordner gespeichert");
      setForm({ title: "", description: "", price_stars: 250, price_ton: 0 });
      qc.invalidateQueries({ queryKey: ["media"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Speichern fehlgeschlagen"),
  });

  function patchJob(id: string, patch: Partial<Job>) {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  }

  /** Mehrere Dateien nacheinander hochladen, mit Fortschritt pro Datei. */
  async function uploadMany(folderId: string, files: File[]) {
    const queued: Job[] = files.map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      folderId,
      name: f.name,
      progress: 0,
      status: "wartet",
    }));
    setJobs((prev) => [...prev, ...queued]);

    let done = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      const job = queued[i]!;
      patchJob(job.id, { status: "läuft" });
      try {
        const { path, signedUrl } = await uploadUrlFn({ data: { folderId, filename: file.name } });
        await putWithProgress(signedUrl, file, (pct) => patchJob(job.id, { progress: pct }));
        await registerFn({
          data: {
            folderId,
            storagePath: path,
            displayName: file.name,
            mimeType: file.type || "application/octet-stream",
            sizeBytes: file.size,
          },
        });
        patchJob(job.id, { status: "fertig", progress: 100 });
        done++;
      } catch (e: any) {
        patchJob(job.id, { status: "fehler", error: e?.message ?? "Upload fehlgeschlagen" });
      }
    }
    qc.invalidateQueries({ queryKey: ["media"] });
    if (done) toast.success(`${done} von ${files.length} Dateien hochgeladen`);
    if (done < files.length) toast.error(`${files.length - done} Dateien fehlgeschlagen`);
  }

  async function move(files: any[], index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= files.length) return;
    const a = files[index];
    const b = files[target];
    await Promise.all([
      updateFileFn({ data: { id: a.id, sortOrder: target } }),
      updateFileFn({ data: { id: b.id, sortOrder: index } }),
    ]);
    qc.invalidateQueries({ queryKey: ["media"] });
  }

  function openSell(folder: any, mode: "paid" | "vip") {
    setSellFolder(folder);
    setSellMode(mode);
    setSellForm({
      priceStars: mode === "vip" ? 1 : Math.max(1, Number(folder.price_stars || 499)),
      priceTon: 0,
      priceTrx: 0,
      accessMode: mode === "vip" ? "vip" : "permanent",
      accessHours: 24,
      previewFileId: folder.preview_file_id || "",
    });
  }

  async function quickPublish() {
    if (!sellFolder) return;
    if (!sellFolder.files?.length) return toast.error("Dieser Ordner enthält noch keine Medien.");
    setSelling(true);
    try {
      const created: any = await createContentFn({ data: {
        title: sellFolder.title,
        description: sellFolder.description || "Exklusiver Content",
        folderId: sellFolder.id,
        previewFileId: sellForm.previewFileId || null,
        priceStars: sellMode === "vip" ? 1 : sellForm.priceStars,
        priceTon: sellMode === "vip" ? 0 : sellForm.priceTon,
        priceTrx: sellMode === "vip" ? 0 : sellForm.priceTrx,
        accessMode: sellMode === "vip" ? "vip" : sellForm.accessMode,
        accessHours: sellForm.accessMode === "hours" ? sellForm.accessHours : null,
        seriesId: null,
        status: "active",
      } });
      await publishContentFn({ data: { id: created.id, target: "shop" } });
      toast.success(sellMode === "vip" ? "VIP-Inhalt veröffentlicht" : "Bezahlter Inhalt veröffentlicht");
      setSellFolder(null);
      await qc.invalidateQueries({ queryKey: ["content-studio"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Veröffentlichung fehlgeschlagen");
    } finally { setSelling(false); }
  }

  const folders = (query.data as any)?.folders ?? [];
  const downloads = (query.data as any)?.downloads ?? [];

  return (
    <DashLayout title="Medien-Ordner" subtitle="Digitale Inhalte gebündelt verkaufen – mit Download-Schutz">
      {!ready ? (
        <p className="text-sm text-muted-foreground">Lade…</p>
      ) : !canRead ? (
        <div className="panel p-6">
          <h2 className="text-lg font-semibold">Kein Zugriff</h2>
          <p className="mt-1 text-sm text-muted-foreground">Nur Team-Konten sehen die Medienverwaltung.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <section className="panel p-5">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl gold-surface">
                <FolderLock className="size-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold">Download-Schutz aktiv</h2>
                <p className="text-sm text-muted-foreground">
                  Dateien liegen in einem privaten Speicher. Fans bekommen nach bestätigter Zahlung nur
                  60-Sekunden-Links, gebunden an Gerät/Netz, mit Aufruf-Limit und vollständigem Protokoll.
                </p>
              </div>
            </div>
          </section>

          {isAdmin && (
            <section className="panel p-5">
              <h2 className="text-lg font-semibold">Neuen Ordner anlegen</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="t">Titel</Label>
                  <Input id="t" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p">Preis in Stars</Label>
                  <Input
                    id="p"
                    type="number"
                    min={0}
                    value={form.price_stars}
                    onChange={(e) => setForm({ ...form, price_stars: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="d">Beschreibung</Label>
                  <Textarea
                    id="d"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
              </div>
              <Button
                className="mt-4"
                disabled={!form.title || save.isPending}
                onClick={() => save.mutate({ ...form, active: true, sort_order: 0 })}
              >
                <Plus className="mr-2 size-4" /> Ordner anlegen
              </Button>
            </section>
          )}

          <div className="grid gap-4">
            {folders.map((f: any) => {
              const folderJobs = jobs.filter((j) => j.folderId === f.id);
              return (
                <section key={f.id} className="panel p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold">{f.title}</h2>
                      <p className="text-sm text-muted-foreground">
                        {f.price_stars} ⭐ · {f.files.length} Dateien · {f.active ? "aktiv" : "inaktiv"}
                      </p>
                    </div>
                    {isAdmin && (
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => openSell(f, "paid")} disabled={!f.files.length}>
                          <ShoppingBag className="mr-1.5 size-4" /> Verkaufen
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => openSell(f, "vip")} disabled={!f.files.length}>
                          <Crown className="mr-1.5 size-4" /> VIP
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            if (!confirm(`Ordner „${f.title}" mit allen Dateien löschen?`)) return;
                            await delFolderFn({ data: { id: f.id } });
                            qc.invalidateQueries({ queryKey: ["media"] });
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {isAdmin && (
                    <label
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragFolder(f.id);
                      }}
                      onDragLeave={() => setDragFolder((cur) => (cur === f.id ? null : cur))}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragFolder(null);
                        const list = Array.from(e.dataTransfer.files);
                        if (list.length) void uploadMany(f.id, list);
                      }}
                      className={`mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center text-sm transition ${
                        dragFolder === f.id ? "border-primary bg-primary/5" : "border-border text-muted-foreground"
                      }`}
                    >
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          const list = Array.from(e.target.files ?? []);
                          if (list.length) void uploadMany(f.id, list);
                          e.target.value = "";
                        }}
                      />
                      <Upload className="mb-2 size-5" />
                      Dateien hierher ziehen oder klicken – Mehrfachauswahl möglich
                    </label>
                  )}

                  {folderJobs.length > 0 && (
                    <ul className="mt-3 space-y-2">
                      {folderJobs.map((j) => (
                        <li key={j.id} className="text-sm">
                          <div className="flex items-center gap-2">
                            {j.status === "fertig" ? (
                              <CheckCircle2 className="size-4 text-emerald-500" />
                            ) : j.status === "fehler" ? (
                              <XCircle className="size-4 text-destructive" />
                            ) : (
                              <Loader2 className="size-4 animate-spin text-muted-foreground" />
                            )}
                            <span className="min-w-0 flex-1 truncate">{j.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {j.status === "fehler" ? j.error : `${j.progress}%`}
                            </span>
                          </div>
                          {j.status !== "fehler" && (
                            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${j.progress}%` }} />
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  <ul className="mt-4 divide-y divide-border/60">
                    {f.files.map((file: any, idx: number) => (
                      <li key={file.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <span className="min-w-0 flex-1 truncate">
                          {file.display_name}
                          {f.preview_file_id === file.id ? <span className="ml-2 text-xs text-primary">Vorschaubild</span> : null}
                        </span>
                        <span className="shrink-0 text-muted-foreground">{human(file.size_bytes)}</span>
                        <span className="flex shrink-0 gap-1">
                          {isAdmin && (
                            <>
                              <Button size="sm" variant="ghost" disabled={idx === 0} onClick={() => void move(f.files, idx, -1)}>
                                <ArrowUp className="size-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={idx === f.files.length - 1}
                                onClick={() => void move(f.files, idx, 1)}
                              >
                                <ArrowDown className="size-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Als Vorschaubild setzen"
                                onClick={async () => {
                                  await setPreviewFn({
                                    data: { folderId: f.id, fileId: f.preview_file_id === file.id ? null : file.id },
                                  });
                                  qc.invalidateQueries({ queryKey: ["media"] });
                                }}
                              >
                                <Star className={`size-4 ${f.preview_file_id === file.id ? "text-primary" : ""}`} />
                              </Button>
                            </>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={async () => {
                              const { url } = await previewFn({ data: { id: file.id } });
                              window.open(url, "_blank", "noopener");
                            }}
                          >
                            <Eye className="size-4" />
                          </Button>
                          {isAdmin && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={async () => {
                                await delFileFn({ data: { id: file.id } });
                                qc.invalidateQueries({ queryKey: ["media"] });
                              }}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          )}
                        </span>
                      </li>
                    ))}
                    {f.files.length === 0 && (
                      <li className="py-3 text-sm text-muted-foreground">Noch keine Dateien in diesem Ordner.</li>
                    )}
                  </ul>
                </section>
              );
            })}
            {folders.length === 0 && (
              <p className="panel p-6 text-sm text-muted-foreground">Noch keine Medien-Ordner angelegt.</p>
            )}
          </div>

          <section className="panel overflow-hidden">
            <h2 className="border-b border-border/60 px-5 py-4 text-lg font-semibold">Download-Protokoll</h2>
            {downloads.map((d: any) => (
              <div key={d.id} className="flex flex-wrap gap-3 border-b border-border/40 px-5 py-3 text-sm last:border-0">
                <span className={d.allowed ? "font-medium" : "font-medium text-destructive"}>
                  {d.allowed ? "Freigegeben" : "Blockiert"}
                </span>
                <span>{d.file}</span>
                <span className="text-muted-foreground">{d.reason}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {new Date(d.createdAt).toLocaleString("de-DE")}
                </span>
              </div>
            ))}
            {downloads.length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">Noch keine Downloads.</p>
            )}
          </section>
        </div>
      )}

      <Dialog open={Boolean(sellFolder)} onOpenChange={(open) => !open && setSellFolder(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{sellMode === "vip" ? "Als VIP-Inhalt veröffentlichen" : "Als bezahlten Inhalt veröffentlichen"}</DialogTitle>
          </DialogHeader>
          {sellFolder && (
            <div className="space-y-4">
              <div className="rounded-lg border p-3">
                <p className="font-medium">{sellFolder.title}</p>
                <p className="text-xs text-muted-foreground">{sellFolder.files.length} geschützte Datei(en) · Originale bleiben privat</p>
              </div>
              {sellMode === "paid" && (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5"><Label>Stars</Label><Input type="number" min={1} value={sellForm.priceStars} onChange={(e) => setSellForm({ ...sellForm, priceStars: Number(e.target.value) })} /></div>
                    <div className="space-y-1.5"><Label>TON optional</Label><Input type="number" min={0} step="0.01" value={sellForm.priceTon} onChange={(e) => setSellForm({ ...sellForm, priceTon: Number(e.target.value) })} /></div>
                    <div className="space-y-1.5"><Label>TRX optional</Label><Input type="number" min={0} step="0.01" value={sellForm.priceTrx} onChange={(e) => setSellForm({ ...sellForm, priceTrx: Number(e.target.value) })} /></div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5"><Label>Zugriff</Label><Select value={sellForm.accessMode} onValueChange={(v: any) => setSellForm({ ...sellForm, accessMode: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="permanent">Dauerhaft</SelectItem><SelectItem value="hours">Zeitlich begrenzt</SelectItem></SelectContent></Select></div>
                    {sellForm.accessMode === "hours" && <div className="space-y-1.5"><Label>Stunden</Label><Input type="number" min={1} max={8760} value={sellForm.accessHours} onChange={(e) => setSellForm({ ...sellForm, accessHours: Number(e.target.value) })} /></div>}
                  </div>
                </>
              )}
              <div className="space-y-1.5">
                <Label>Öffentliche Vorschau</Label>
                <Select value={sellForm.previewFileId || "none"} onValueChange={(v) => setSellForm({ ...sellForm, previewFileId: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Keine Vorschau" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Keine Vorschau</SelectItem>
                    {sellFolder.files.filter((file: any) => file.preview_allowed === true || file.id === sellFolder.preview_file_id).map((file: any) => <SelectItem key={file.id} value={file.id}>{file.display_name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Nur diese Vorschau kann im Shop sichtbar sein. Alle übrigen Dateien bleiben geschützt.</p>
              </div>
              <Button className="w-full" disabled={selling || (sellMode === "paid" && sellForm.priceStars < 1)} onClick={() => void quickPublish()}>
                {selling ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}
                Jetzt in Telegram veröffentlichen
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashLayout>
  );
}
