DROP EXTENSION pg_net;
CREATE EXTENSION pg_net SCHEMA extensions;

CREATE SCHEMA IF NOT EXISTS private;
ALTER TABLE public.cron_tokens SET SCHEMA private;
REVOKE ALL ON private.cron_tokens FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT ALL ON private.cron_tokens TO service_role;

CREATE OR REPLACE FUNCTION public.cron_token_valid(p_token text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM private.cron_tokens
    WHERE token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  )
$$;
REVOKE ALL ON FUNCTION public.cron_token_valid(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_token_valid(text) TO service_role;