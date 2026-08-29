import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FolderLock, Upload, Trash2, Eye, Plus } from "lucide-react";
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
} from "@/lib/media.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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

  const [form, setForm] = useState({ title: "", description: "", price_stars: 250, price_ton: 0 });
  const [uploading, setUploading] = useState<string | null>(null);

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

  async function upload(folderId: string, file: File) {
    setUploading(folderId);
    try {
      const { path, signedUrl } = await uploadUrlFn({ data: { folderId, filename: file.name } });
      const res = await fetch(signedUrl, { method: "PUT", body: file });
      if (!res.ok) throw new Error("Upload fehlgeschlagen");
      await registerFn({
        data: {
          folderId,
          storagePath: path,
          displayName: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        },
      });
      toast.success(`${file.name} hochgeladen`);
      qc.invalidateQueries({ queryKey: ["media"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Upload fehlgeschlagen");
    } finally {
      setUploading(null);
    }
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
            {folders.map((f: any) => (
              <section key={f.id} className="panel p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{f.title}</h2>
                    <p className="text-sm text-muted-foreground">
                      {f.price_stars} ⭐ · {f.files.length} Dateien · {f.active ? "aktiv" : "inaktiv"}
                    </p>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-2">
                      <label className="inline-flex">
                        <input
                          type="file"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void upload(f.id, file);
                            e.target.value = "";
                          }}
                        />
                        <span className="inline-flex h-9 cursor-pointer items-center rounded-md border border-border px-3 text-sm">
                          <Upload className="mr-2 size-4" />
                          {uploading === f.id ? "Lädt…" : "Datei hinzufügen"}
                        </span>
                      </label>
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

                <ul className="mt-4 divide-y divide-border/60">
                  {f.files.map((file: any) => (
                    <li key={file.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="truncate">{file.display_name}</span>
                      <span className="shrink-0 text-muted-foreground">{human(file.size_bytes)}</span>
                      <span className="flex shrink-0 gap-1">
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
            ))}
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
    </DashLayout>
  );
}
