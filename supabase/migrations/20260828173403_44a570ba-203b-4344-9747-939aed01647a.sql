-- enums
create type public.delivery_state as enum ('pending','delivered','failed','revoked');
create type public.sponsor_status as enum ('requested','approved','paid','published','rejected');
create type public.audience as enum ('free','vip','both');

-- purchases: delivery tracking
alter table public.purchases
  add column delivery_status public.delivery_state not null default 'pending',
  add column delivered_at timestamptz,
  add column delivery_note text not null default '';

-- tg_users: risk
alter table public.tg_users
  add column risk_score integer not null default 0,
  add column blocked boolean not null default false,
  add column block_reason text not null default '';

-- bot settings
alter table public.bot_settings
  add column early_access_price_stars integer not null default 250,
  add column sponsor_price_stars integer not null default 1500,
  add column link_ttl_hours integer not null default 48,
  add column link_max_views integer not null default 3,
  add column max_purchases_per_hour integer not null default 6,
  add column app_base_url text not null default '';

-- one-time access tokens
create table public.access_tokens (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  purchase_id uuid references public.purchases(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  tg_user_id uuid references public.tg_users(id) on delete cascade,
  expires_at timestamptz not null,
  max_views integer not null default 3,
  views integer not null default 0,
  revoked boolean not null default false,
  last_ip_hash text not null default '',
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.access_tokens to authenticated;
grant all on public.access_tokens to service_role;
alter table public.access_tokens enable row level security;
create policy "admins manage access tokens" on public.access_tokens for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create index access_tokens_purchase_idx on public.access_tokens(purchase_id);

-- order events
create table public.order_events (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid references public.purchases(id) on delete cascade,
  tg_user_id uuid references public.tg_users(id) on delete cascade,
  kind text not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.order_events to authenticated;
grant all on public.order_events to service_role;
alter table public.order_events enable row level security;
create policy "admins read order events" on public.order_events for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create index order_events_purchase_idx on public.order_events(purchase_id);

-- rate limiting / fraud log
create table public.action_log (
  id uuid primary key default gen_random_uuid(),
  tg_user_id uuid references public.tg_users(id) on delete cascade,
  action text not null,
  meta text not null default '',
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.action_log to authenticated;
grant all on public.action_log to service_role;
alter table public.action_log enable row level security;
create policy "admins read action log" on public.action_log for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create index action_log_user_time_idx on public.action_log(tg_user_id, created_at desc);

-- sponsored posts
create table public.sponsored_posts (
  id uuid primary key default gen_random_uuid(),
  advertiser text not null,
  contact text not null default '',
  target public.audience not null default 'free',
  content text not null default '',
  media_url text not null default '',
  link_url text not null default '',
  price_stars integer not null default 0,
  status public.sponsor_status not null default 'requested',
  scheduled_at timestamptz,
  published_at timestamptz,
  tg_user_id uuid references public.tg_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.sponsored_posts to authenticated;
grant all on public.sponsored_posts to service_role;
alter table public.sponsored_posts enable row level security;
create policy "admins manage sponsored posts" on public.sponsored_posts for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create trigger sponsored_posts_updated before update on public.sponsored_posts
  for each row execute function public.set_updated_at();

-- leads / waitlist
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  email text not null default '',
  telegram_handle text not null default '',
  interest text not null default '',
  source text not null default 'web',
  early_access boolean not null default false,
  early_access_status public.pay_status not null default 'pending',
  amount_stars integer not null default 0,
  claim_token text not null unique,
  ip_hash text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.leads to authenticated;
grant all on public.leads to service_role;
alter table public.leads enable row level security;
create policy "admins manage leads" on public.leads for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create trigger leads_updated before update on public.leads
  for each row execute function public.set_updated_at();