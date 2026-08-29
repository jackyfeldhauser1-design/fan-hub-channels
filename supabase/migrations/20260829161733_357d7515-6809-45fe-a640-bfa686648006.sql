ALTER TABLE public.bot_settings
  ADD COLUMN IF NOT EXISTS announce_chat_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS preview_chat_id text NOT NULL DEFAULT '';

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sale_price_stars integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sale_until timestamptz,
  ADD COLUMN IF NOT EXISTS stock_limit integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_sold integer NOT NULL DEFAULT 0;

ALTER TABLE public.media_folders
  ADD COLUMN IF NOT EXISTS sale_price_stars integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sale_until timestamptz,
  ADD COLUMN IF NOT EXISTS stock_limit integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_sold integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS preview_file_id uuid REFERENCES public.media_files(id) ON DELETE SET NULL;