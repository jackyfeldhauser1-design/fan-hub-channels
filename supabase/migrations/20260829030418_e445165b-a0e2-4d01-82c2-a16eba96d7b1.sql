ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'operator';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'viewer';

ALTER TABLE public.bot_settings
  ADD COLUMN IF NOT EXISTS admin_chat_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS notify_blocked boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_unpaid boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_expired boolean NOT NULL DEFAULT true;

ALTER TABLE public.access_tokens
  ADD COLUMN IF NOT EXISTS reactivated_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS reactivations integer NOT NULL DEFAULT 0;