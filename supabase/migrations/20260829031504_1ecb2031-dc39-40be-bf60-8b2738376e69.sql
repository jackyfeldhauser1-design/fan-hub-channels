CREATE TABLE public.media_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  cover_url text NOT NULL DEFAULT '',
  price_stars integer NOT NULL DEFAULT 0,
  price_ton numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.media_folders TO service_role;
ALTER TABLE public.media_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage media folders" ON public.media_folders FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE TRIGGER media_folders_updated BEFORE UPDATE ON public.media_folders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE public.media_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id uuid NOT NULL REFERENCES public.media_folders(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  mime_type text NOT NULL DEFAULT '',
  size_bytes bigint NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  preview_allowed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.media_files TO service_role;
ALTER TABLE public.media_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage media files" ON public.media_files FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE TRIGGER media_files_updated BEFORE UPDATE ON public.media_files FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE public.media_downloads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id uuid REFERENCES public.media_files(id) ON DELETE SET NULL,
  folder_id uuid REFERENCES public.media_folders(id) ON DELETE SET NULL,
  token_id uuid REFERENCES public.access_tokens(id) ON DELETE SET NULL,
  tg_user_id uuid REFERENCES public.tg_users(id) ON DELETE SET NULL,
  allowed boolean NOT NULL DEFAULT false,
  reason text NOT NULL DEFAULT '',
  ip_hash text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.media_downloads TO service_role;
ALTER TABLE public.media_downloads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read media downloads" ON public.media_downloads FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

ALTER TABLE public.access_tokens ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES public.media_folders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS media_files_folder_idx ON public.media_files(folder_id);
CREATE INDEX IF NOT EXISTS media_downloads_created_idx ON public.media_downloads(created_at DESC);