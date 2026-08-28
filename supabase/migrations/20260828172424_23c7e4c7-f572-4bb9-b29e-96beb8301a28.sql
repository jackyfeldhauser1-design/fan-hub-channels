-- roles
create type public.app_role as enum ('admin','user');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "users read own roles" on public.user_roles for select to authenticated using (user_id = auth.uid());
create policy "admins manage roles" on public.user_roles for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

-- bot settings
create table public.bot_settings (
  id boolean primary key default true,
  welcome_message text not null default 'Willkommen! Wähle unten, wie es weitergeht.',
  free_group_url text not null default '',
  vip_group_url text not null default '',
  ton_wallet text not null default '',
  affiliate_percent int not null default 20,
  tip_message text not null default 'Danke für deine Unterstützung!',
  upsell_message text not null default 'Das könnte dir auch gefallen:',
  updated_at timestamptz not null default now(),
  constraint bot_settings_singleton check (id)
);
grant select, insert, update on public.bot_settings to authenticated;
grant all on public.bot_settings to service_role;
alter table public.bot_settings enable row level security;
create policy "admins read settings" on public.bot_settings for select to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "admins write settings" on public.bot_settings for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create trigger bot_settings_updated before update on public.bot_settings for each row execute function public.set_updated_at();
insert into public.bot_settings (id) values (true);

-- products
create type public.product_kind as enum ('single','bundle','ppv','tip');
create type public.delivery_kind as enum ('text','file','link');

create table public.products (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  kind public.product_kind not null default 'single',
  price_stars int not null default 0,
  price_ton numeric(12,4) not null default 0,
  delivery_type public.delivery_kind not null default 'text',
  delivery_payload text not null default '',
  active boolean not null default true,
  sort_order int not null default 0,
  upsell_product_id uuid references public.products(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.products to authenticated;
grant all on public.products to service_role;
alter table public.products enable row level security;
create policy "admins manage products" on public.products for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create trigger products_updated before update on public.products for each row execute function public.set_updated_at();

create table public.bundle_items (
  bundle_id uuid not null references public.products(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  primary key (bundle_id, product_id)
);
grant select, insert, update, delete on public.bundle_items to authenticated;
grant all on public.bundle_items to service_role;
alter table public.bundle_items enable row level security;
create policy "admins manage bundle items" on public.bundle_items for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- telegram users
create table public.tg_users (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null unique,
  username text,
  first_name text,
  referral_code text not null unique,
  referred_by uuid references public.tg_users(id) on delete set null,
  joined_free boolean not null default false,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.tg_users to authenticated;
grant all on public.tg_users to service_role;
alter table public.tg_users enable row level security;
create policy "admins manage tg users" on public.tg_users for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- purchases
create type public.pay_currency as enum ('stars','ton');
create type public.pay_status as enum ('pending','paid','failed','refunded');

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  tg_user_id uuid not null references public.tg_users(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  title_snapshot text not null default '',
  currency public.pay_currency not null default 'stars',
  amount_stars int not null default 0,
  amount_ton numeric(12,4) not null default 0,
  status public.pay_status not null default 'pending',
  telegram_charge_id text,
  ton_memo text,
  referrer_id uuid references public.tg_users(id) on delete set null,
  commission_stars int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index purchases_user_idx on public.purchases (tg_user_id);
create index purchases_status_idx on public.purchases (status);
grant select, insert, update, delete on public.purchases to authenticated;
grant all on public.purchases to service_role;
alter table public.purchases enable row level security;
create policy "admins manage purchases" on public.purchases for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create trigger purchases_updated before update on public.purchases for each row execute function public.set_updated_at();

-- payouts
create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  tg_user_id uuid not null references public.tg_users(id) on delete cascade,
  amount_stars int not null default 0,
  status public.pay_status not null default 'pending',
  note text not null default '',
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.payouts to authenticated;
grant all on public.payouts to service_role;
alter table public.payouts enable row level security;
create policy "admins manage payouts" on public.payouts for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- update log
create table public.telegram_updates (
  update_id bigint primary key,
  chat_id bigint,
  telegram_user_id bigint,
  text text,
  raw jsonb not null,
  created_at timestamptz not null default now()
);
grant select, delete on public.telegram_updates to authenticated;
grant all on public.telegram_updates to service_role;
alter table public.telegram_updates enable row level security;
create policy "admins read updates" on public.telegram_updates for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));