CREATE TABLE public.chat_templates (
  target text PRIMARY KEY,
  welcome_body text NOT NULL DEFAULT '',
  pin_message boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.chat_templates TO authenticated;
GRANT ALL ON public.chat_templates TO service_role;

ALTER TABLE public.chat_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_templates_admin_all" ON public.chat_templates
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE TRIGGER chat_templates_updated_at BEFORE UPDATE ON public.chat_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.bot_credentials
  ADD COLUMN IF NOT EXISTS previous_token text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS previous_valid_until timestamptz;
