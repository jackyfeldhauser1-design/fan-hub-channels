-- Content Commerce scaffold: internal admin board, Telegram-only customer experience.

-- Safety preflight: this migration belongs to the Fan Connect schema only.
DO $$
BEGIN
  IF to_regclass('public.media_files') IS NULL
     OR to_regclass('public.products') IS NULL
     OR to_regclass('public.tg_users') IS NULL
     OR to_regclass('public.purchases') IS NULL THEN
    RAISE EXCEPTION 'Fan Connect Basisschema fehlt (media_files/products/tg_users/purchases). Migration abgebrochen.';
  END IF;
  IF to_regprocedure('public.is_admin()') IS NULL
     OR to_regprocedure('public.set_updated_at()') IS NULL THEN
    RAISE EXCEPTION 'Fan Connect Basisfunktionen fehlen (is_admin/set_updated_at). Migration abgebrochen.';
  END IF;
END $$;

ALTER TABLE public.media_files
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS content_rating text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS public.content_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.content_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id uuid REFERENCES public.content_series(id) ON DELETE SET NULL,
  product_id uuid UNIQUE REFERENCES public.products(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  access_mode text NOT NULL DEFAULT 'permanent' CHECK (access_mode IN ('permanent','hours','vip')),
  access_hours integer CHECK (access_hours IS NULL OR access_hours BETWEEN 1 AND 8760),
  series_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.content_set_items (
  content_set_id uuid NOT NULL REFERENCES public.content_sets(id) ON DELETE CASCADE,
  media_file_id uuid NOT NULL REFERENCES public.media_files(id) ON DELETE CASCADE,
  item_role text NOT NULL DEFAULT 'protected' CHECK (item_role IN ('preview','protected')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (content_set_id, media_file_id, item_role)
);

CREATE TABLE IF NOT EXISTS public.content_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_user_id uuid NOT NULL REFERENCES public.tg_users(id) ON DELETE CASCADE,
  content_set_id uuid NOT NULL REFERENCES public.content_sets(id) ON DELETE CASCADE,
  purchase_id uuid REFERENCES public.purchases(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','expired')),
  source text NOT NULL DEFAULT 'purchase',
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  last_opened_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.content_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_set_id uuid NOT NULL REFERENCES public.content_sets(id) ON DELETE CASCADE,
  target text NOT NULL DEFAULT 'shop' CHECK (target IN ('shop','community','vip')),
  telegram_chat_id text NOT NULL DEFAULT '',
  telegram_message_id bigint,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','failed','deleted')),
  error text NOT NULL DEFAULT '',
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS content_sets_status_idx ON public.content_sets(status, created_at DESC);
CREATE INDEX IF NOT EXISTS content_set_items_set_idx ON public.content_set_items(content_set_id, sort_order);
CREATE INDEX IF NOT EXISTS content_access_user_idx ON public.content_access(tg_user_id, status, granted_at DESC);
CREATE INDEX IF NOT EXISTS content_access_set_idx ON public.content_access(content_set_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS content_access_user_set_uidx ON public.content_access(tg_user_id, content_set_id);
CREATE UNIQUE INDEX IF NOT EXISTS content_access_purchase_set_uidx ON public.content_access(purchase_id, content_set_id) WHERE purchase_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS content_publications_set_idx ON public.content_publications(content_set_id, created_at DESC);

GRANT ALL ON public.content_series TO service_role;
GRANT ALL ON public.content_sets TO service_role;
GRANT ALL ON public.content_set_items TO service_role;
GRANT ALL ON public.content_access TO service_role;
GRANT ALL ON public.content_publications TO service_role;

ALTER TABLE public.content_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_set_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_publications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage content series" ON public.content_series;
CREATE POLICY "admins manage content series" ON public.content_series FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admins manage content sets" ON public.content_sets;
CREATE POLICY "admins manage content sets" ON public.content_sets FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admins manage content set items" ON public.content_set_items;
CREATE POLICY "admins manage content set items" ON public.content_set_items FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admins manage content access" ON public.content_access;
CREATE POLICY "admins manage content access" ON public.content_access FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admins manage content publications" ON public.content_publications;
CREATE POLICY "admins manage content publications" ON public.content_publications FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS content_series_updated ON public.content_series;
CREATE TRIGGER content_series_updated BEFORE UPDATE ON public.content_series
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS content_sets_updated ON public.content_sets;
CREATE TRIGGER content_sets_updated BEFORE UPDATE ON public.content_sets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS content_publications_updated ON public.content_publications;
CREATE TRIGGER content_publications_updated BEFORE UPDATE ON public.content_publications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
