-- Funnel lifecycle hardening: timed-content reminder state and configurable warning window.
ALTER TABLE public.content_access
  ADD COLUMN IF NOT EXISTS expiry_reminded_at timestamptz;

ALTER TABLE public.bot_settings
  ADD COLUMN IF NOT EXISTS content_expiry_reminder_hours integer NOT NULL DEFAULT 6
    CHECK (content_expiry_reminder_hours BETWEEN 0 AND 168);

CREATE INDEX IF NOT EXISTS content_access_expiry_idx
  ON public.content_access(status, expires_at)
  WHERE expires_at IS NOT NULL;
