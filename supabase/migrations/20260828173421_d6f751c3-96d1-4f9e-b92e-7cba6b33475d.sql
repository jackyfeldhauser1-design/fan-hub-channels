alter table public.bot_settings
  add column free_chat_id text not null default '',
  add column vip_chat_id text not null default '';