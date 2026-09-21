export type TeaserSource = {
  id?: string | null;
  storage_path?: string | null;
  mime_type?: string | null;
};

export async function createPixelatedTeaser(
  db: any,
  contentSetId: string,
  source: TeaserSource,
): Promise<string | null> {
  const storagePath = String(source?.storage_path ?? "").trim();
  const mime = String(source?.mime_type ?? "").toLowerCase();
  if (!storagePath || !mime.startsWith("image/")) return null;

  const { data: original, error: downloadError } = await db.storage.from("media-vault").download(storagePath);
  if (downloadError || !original) throw new Error(downloadError?.message ?? "Teaser-Quelle konnte nicht geladen werden.");

  const input = Buffer.from(await original.arrayBuffer());
  const sharp = (await import("sharp")).default;

  const teaser = await sharp(input)
    .rotate()
    .resize({ width: 18, withoutEnlargement: false })
    .resize({ width: 1080, withoutEnlargement: false, kernel: "nearest" })
    .jpeg({ quality: 72, mozjpeg: true })
    .toBuffer();

  const sourceId = String(source?.id ?? "source").replace(/[^a-zA-Z0-9_-]/g, "");
  const teaserPath = `teasers/${contentSetId}/${sourceId || "source"}.jpg`;
  const { error: uploadError } = await db.storage.from("media-vault").upload(teaserPath, teaser, {
    contentType: "image/jpeg",
    upsert: true,
    cacheControl: "3600",
  });
  if (uploadError) throw new Error(uploadError.message);

  const { data: signed, error: signedError } = await db.storage.from("media-vault").createSignedUrl(teaserPath, 300);
  if (signedError) throw new Error(signedError.message);
  return signed?.signedUrl ?? null;
}
