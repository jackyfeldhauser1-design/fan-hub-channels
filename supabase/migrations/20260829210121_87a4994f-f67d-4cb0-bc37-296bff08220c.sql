ALTER TABLE public.bot_settings
  ADD COLUMN IF NOT EXISTS vip_price_stars integer NOT NULL DEFAULT 450,
  ADD COLUMN IF NOT EXISTS vip_product_title text NOT NULL DEFAULT 'VIP-Zugang',
  ADD COLUMN IF NOT EXISTS vip_invite_ttl_hours integer NOT NULL DEFAULT 24;

ALTER TABLE public.sponsored_posts
  ADD COLUMN IF NOT EXISTS repeat_hours integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS repeat_until timestamptz,
  ADD COLUMN IF NOT EXISTS next_run_at timestamptz,
  ADD COLUMN IF NOT EXISTS paused boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS sponsored_posts_next_run_idx ON public.sponsored_posts (next_run_at) WHERE paused = false;