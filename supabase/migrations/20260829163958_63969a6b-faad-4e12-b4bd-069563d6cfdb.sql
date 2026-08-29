-- 1) Alten Zustand im Admin-Audit sichern
INSERT INTO public.admin_audit (action, target, status, detail, meta)
SELECT
  'chat_structure_reset',
  'bot_settings',
  'ok',
  'Alte Chat-Zuordnungen vor Umstellung auf 3 Kanäle gesichert',
  jsonb_build_object(
    'free_chat_id', s.free_chat_id,
    'vip_chat_id', s.vip_chat_id,
    'admin_chat_id', s.admin_chat_id,
    'announce_chat_id', s.announce_chat_id,
    'preview_chat_id', s.preview_chat_id
  )
FROM public.bot_settings s
WHERE s.id = true;

-- 2) Neue Felder
ALTER TABLE public.bot_settings
  ADD COLUMN IF NOT EXISTS community_chat_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS shop_chat_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS control_chat_id text NOT NULL DEFAULT '';

-- 3) Alte Felder entfernen (kompletter Reset gewünscht)
ALTER TABLE public.bot_settings
  DROP COLUMN IF EXISTS free_chat_id,
  DROP COLUMN IF EXISTS vip_chat_id,
  DROP COLUMN IF EXISTS admin_chat_id,
  DROP COLUMN IF EXISTS announce_chat_id,
  DROP COLUMN IF EXISTS preview_chat_id;