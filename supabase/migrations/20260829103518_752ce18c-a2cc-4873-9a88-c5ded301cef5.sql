create type public.notify_channel as enum ('telegram', 'email');
create type public.notify_kind as enum ('expiring', 'expired', 'unpaid', 'blocked', 'reactivated');
create type public.notify_status as enum ('queued', 'sent', 'retrying', 'dead', 'skipped_optout');

create table public.notification_recipients (
  id uuid primary key default gen_random_uuid(),
  label text not null default '',
  channel public.notify_channel not null default 'telegram',
  chat_id text not null default '',
  email text not null default '',
  fallback_channel public.notify_channel,
  fallback_target text not null default '',
  active boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.notification_recipients to authenticated;
grant all on public.notification_recipients to service_role;
alter table public.notification_recipients enable row level security;
create policy "admins manage notification recipients" on public.notification_recipients
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create trigger notification_recipients_updated before update on public.notification_recipients
  for each row execute function public.set_updated_at();

create table public.notification_prefs (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.notification_recipients(id) on delete cascade,
  kind public.notify_kind not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recipient_id, kind)
);

grant select, insert, update, delete on public.notification_prefs to authenticated;
grant all on public.notification_prefs to service_role;
alter table public.notification_prefs enable row level security;
create policy "admins manage notification prefs" on public.notification_prefs
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create trigger notification_prefs_updated before update on public.notification_prefs
  for each row execute function public.set_updated_at();

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid references public.notification_recipients(id) on delete set null,
  recipient_label text not null default '',
  kind public.notify_kind not null,
  channel public.notify_channel not null default 'telegram',
  target text not null default '',
  token_id uuid references public.access_tokens(id) on delete set null,
  tg_user_id uuid references public.tg_users(id) on delete set null,
  body text not null default '',
  status public.notify_status not null default 'queued',
  attempt integer not null default 0,
  error text not null default '',
  used_fallback boolean not null default false,
  next_retry_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.notification_deliveries to authenticated;
grant all on public.notification_deliveries to service_role;
alter table public.notification_deliveries enable row level security;
create policy "admins read notification deliveries" on public.notification_deliveries
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create trigger notification_deliveries_updated before update on public.notification_deliveries
  for each row execute function public.set_updated_at();

create index notification_deliveries_retry_idx on public.notification_deliveries (status, next_retry_at);
create index notification_deliveries_created_idx on public.notification_deliveries (created_at desc);

create table public.access_token_recipients (
  token_id uuid not null references public.access_tokens(id) on delete cascade,
  recipient_id uuid not null references public.notification_recipients(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (token_id, recipient_id)
);

grant select, insert, update, delete on public.access_token_recipients to authenticated;
grant all on public.access_token_recipients to service_role;
alter table public.access_token_recipients enable row level security;
create policy "admins manage access token recipients" on public.access_token_recipients
  for all to authenticated using (public.is_admin()) with check (public.is_admin());