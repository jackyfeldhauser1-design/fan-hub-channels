CREATE TABLE public.cron_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  label text NOT NULL UNIQUE,
  token_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.cron_tokens TO service_role;
ALTER TABLE public.cron_tokens ENABLE ROW LEVEL SECURITY;
INSERT INTO public.cron_tokens (label, token_hash) VALUES ('notifications-scheduler', 'a97e00ac6f5668efa443e82ce55606882f22265fdeab58c49c745057e5d0a715');