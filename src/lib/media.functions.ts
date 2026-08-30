import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function adminDb(context: any) {
  const { data } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .in("role", ["admin", "operator"]);
  if (!data?.length) throw new Error("Forbidden");
  const isAdmin = data.some((r: any) => r.role === "admin");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { db: supabaseAdmin as any, isAdmin };
}

export const listMediaFolders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db, isAdmin } = await adminDb(context);
    const [{ data: folders }, { data: files }, { data: downloads }] = await Promise.all([
      db.from("media_folders").select("*").order("sort_order", { ascending: true }),
      db.from("media_files").select("*").order("sort_order", { ascending: true }),
      db.from("media_downloads").select("*, media_files(display_name)").order("created_at", { ascending: false }).limit(100),
    ]);
    return {
      isAdmin,
      folders: (folders ?? []).map((f: any) => ({
        ...f,
        files: (files ?? []).filter((x: any) => x.folder_id === f.id),
      })),
      downloads: (downloads ?? []).map((d: any) => ({
        id: d.id,
        file: d.media_files?.display_name ?? "—",
        allowed: d.allowed,
        reason: d.reason,
        createdAt: d.created_at,
      })),
    };
  });

export const saveMediaFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        title: z.string().min(1).max(120),
        description: z.string().max(2000).default(""),
        price_stars: z.number().int().min(0).max(1_000_000).default(0),
        price_ton: z.number().min(0).max(100000).default(0),
        active: z.boolean().default(true),
        sort_order: z.number().int().min(0).max(9999).default(0),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { db, isAdmin } = await adminDb(context);
    if (!isAdmin) throw new Error("Forbidden");
    const { id, ...values } = data;
    if (id) await db.from("media_folders").update(values).eq("id", id);
    else await db.from("media_folders").insert(values);
    return { ok: true };
  });

export const deleteMediaFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { db, isAdmin } = await adminDb(context);
    if (!isAdmin) throw new Error("Forbidden");
    const { data: files } = await db.from("media_files").select("storage_path").eq("folder_id", data.id);
    const paths = (files ?? []).map((f: any) => f.storage_path);
    if (paths.length) await db.storage.from("media-vault").remove(paths);
    await db.from("media_folders").delete().eq("id", data.id);
    return { ok: true };
  });

/** Kurzlebiger Upload-Link in den geschützten Speicher (Datei geht nie über die App-Server). */
export const createMediaUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ folderId: z.string().uuid(), filename: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { db, isAdmin } = await adminDb(context);
    if (!isAdmin) throw new Error("Forbidden");
    const safe = data.filename.replace(/[^\w.\-]+/g, "_").slice(-120);
    const path = `${data.folderId}/${crypto.randomUUID()}-${safe}`;
    const { data: signed, error } = await db.storage.from("media-vault").createSignedUploadUrl(path);
    if (error) throw new Error(error.message);
    return { path, token: signed.token as string, signedUrl: signed.signedUrl as string };
  });

export const registerMediaFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        folderId: z.string().uuid(),
        storagePath: z.string().min(1).max(400),
        displayName: z.string().min(1).max(200),
        mimeType: z.string().max(120).default(""),
        sizeBytes: z.number().int().min(0).default(0),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { db, isAdmin } = await adminDb(context);
    if (!isAdmin) throw new Error("Forbidden");
    await db.from("media_files").insert({
      folder_id: data.folderId,
      storage_path: data.storagePath,
      display_name: data.displayName,
      mime_type: data.mimeType,
      size_bytes: data.sizeBytes,
    });
    return { ok: true };
  });

export const deleteMediaFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { db, isAdmin } = await adminDb(context);
    if (!isAdmin) throw new Error("Forbidden");
    const { data: file } = await db.from("media_files").select("storage_path").eq("id", data.id).maybeSingle();
    if (file?.storage_path) await db.storage.from("media-vault").remove([file.storage_path]);
    await db.from("media_files").delete().eq("id", data.id);
    return { ok: true };
  });

/** Vorschau für das Team: 5-Minuten-Link, nur für Admins. */
export const previewMediaFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { db } = await adminDb(context);
    const { data: file } = await db.from("media_files").select("storage_path").eq("id", data.id).maybeSingle();
    if (!file) throw new Error("Datei nicht gefunden");
    const { data: signed, error } = await db.storage.from("media-vault").createSignedUrl(file.storage_path, 300);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl as string };
  });

/** Sortierung, Anzeigename oder Vorschau-Freigabe einer Datei ändern. */
export const updateMediaFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        sortOrder: z.number().int().min(0).max(9999).optional(),
        displayName: z.string().min(1).max(200).optional(),
        previewAllowed: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { db, isAdmin } = await adminDb(context);
    if (!isAdmin) throw new Error("Forbidden");
    const values: Record<string, unknown> = {};
    if (data.sortOrder !== undefined) values["sort_order"] = data.sortOrder;
    if (data.displayName !== undefined) values["display_name"] = data.displayName;
    if (data.previewAllowed !== undefined) values["preview_allowed"] = data.previewAllowed;
    if (Object.keys(values).length === 0) return { ok: true };
    const { error } = await db.from("media_files").update(values).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Vorschaubild eines Ordners festlegen (oder entfernen). */
export const setFolderPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ folderId: z.string().uuid(), fileId: z.string().uuid().nullable() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { db, isAdmin } = await adminDb(context);
    if (!isAdmin) throw new Error("Forbidden");
    const { error } = await db.from("media_folders").update({ preview_file_id: data.fileId }).eq("id", data.folderId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
