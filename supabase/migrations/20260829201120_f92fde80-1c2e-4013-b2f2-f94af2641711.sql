CREATE TABLE public.bot_credentials (
  id boolean NOT NULL PRIMARY KEY DEFAULT true CHECK (id),
  bot_token text NOT NULL DEFAULT '',
  bot_username text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.bot_credentials TO service_role;
ALTER TABLE public.bot_credentials ENABLE ROW LEVEL SECURITY;
-- Absichtlich keine Policies: nur die Service-Role (Serverfunktionen) darf zugreifen.

CREATE TRIGGER bot_credentials_updated_at
BEFORE UPDATE ON public.bot_credentials
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.chat_setup_codes (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  target text NOT NULL CHECK (target IN ('community','shop','control')),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  chat_id text NOT NULL DEFAULT '',
  chat_title text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  detail text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX chat_setup_codes_code_idx ON public.chat_setup_codes (code);
CREATE INDEX chat_setup_codes_created_idx ON public.chat_setup_codes (created_at DESC);

GRANT SELECT ON public.chat_setup_codes TO authenticated;
GRANT ALL ON public.chat_setup_codes TO service_role;
ALTER TABLE public.chat_setup_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view setup codes"
ON public.chat_setup_codes FOR SELECT TO authenticated
USING (public.is_admin());

CREATE TRIGGER chat_setup_codes_updated_at
BEFORE UPDATE ON public.chat_setup_codes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();