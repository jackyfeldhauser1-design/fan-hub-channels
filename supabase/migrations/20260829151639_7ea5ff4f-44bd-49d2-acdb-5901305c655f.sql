-- 1) Revoke anon privileges on every purchase / delivery related table
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END $$;

-- 2) Admin audit log for chat verification / test posts / membership changes
CREATE TABLE IF NOT EXISTS public.admin_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  action text NOT NULL,
  target text,
  chat_id text,
  status text NOT NULL DEFAULT 'ok',
  detail text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_audit TO authenticated;
GRANT ALL ON public.admin_audit TO service_role;
ALTER TABLE public.admin_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read admin audit" ON public.admin_audit;
CREATE POLICY "admins read admin audit" ON public.admin_audit
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE INDEX IF NOT EXISTS admin_audit_created_idx ON public.admin_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_chat_idx ON public.admin_audit (chat_id, created_at DESC);

-- 3) Generic rate limiting bucket table (server-only)
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket text NOT NULL,
  subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.rate_limits TO service_role;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
-- no policies: only service_role (which bypasses RLS) may use this table

CREATE INDEX IF NOT EXISTS rate_limits_lookup_idx ON public.rate_limits (bucket, subject, created_at DESC);

-- 4) Replay protection metadata for incoming Telegram updates
ALTER TABLE public.telegram_updates
  ADD COLUMN IF NOT EXISTS received_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS telegram_updates_received_idx ON public.telegram_updates (received_at DESC);