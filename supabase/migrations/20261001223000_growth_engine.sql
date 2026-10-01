-- Growth engine: two-stage recovery, funnel analytics, referrals, customer segments and starter bundle.

alter table public.invoice_intents
  add column if not exists recovery_count integer not null default 0,
  add column if not exists last_recovery_at timestamptz;

alter table public.purchases
  add column if not exists recovery_count integer not null default 0,
  add column if not exists last_recovery_at timestamptz;

alter table public.bot_settings
  add column if not exists cart_recovery_second_minutes integer not null default 360,
  add column if not exists cart_recovery_max_reminders integer not null default 2;

create table if not exists public.growth_events (
  id uuid primary key default gen_random_uuid(),
  tg_user_id uuid references public.tg_users(id) on delete set null,
  event_type text not null,
  product_id uuid references public.products(id) on delete set null,
  content_set_id uuid references public.content_sets(id) on delete set null,
  source text not null default '',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.growth_events enable row level security;
revoke all on table public.growth_events from anon;
grant select on table public.growth_events to authenticated;
drop policy if exists "growth_events_admin_select" on public.growth_events;
create policy "growth_events_admin_select" on public.growth_events
  for select to authenticated using (public.is_admin());

create index if not exists growth_events_type_created_idx
  on public.growth_events(event_type, created_at desc);
create index if not exists growth_events_user_created_idx
  on public.growth_events(tg_user_id, created_at desc);

create table if not exists public.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.tg_users(id) on delete cascade,
  referred_user_id uuid not null references public.tg_users(id) on delete cascade,
  trigger_purchase_id uuid references public.purchases(id) on delete set null,
  content_set_id uuid references public.content_sets(id) on delete set null,
  status text not null default 'granted' check (status in ('granted','delivered','cancelled')),
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  unique(referred_user_id)
);
alter table public.referral_rewards enable row level security;
revoke all on table public.referral_rewards from anon;
grant select on table public.referral_rewards to authenticated;
drop policy if exists "referral_rewards_admin_select" on public.referral_rewards;
create policy "referral_rewards_admin_select" on public.referral_rewards
  for select to authenticated using (public.is_admin());

create or replace view public.customer_growth_segments
with (security_invoker=true) as
select
  u.id as tg_user_id,
  u.telegram_id,
  u.username,
  u.first_name,
  u.created_at,
  u.last_seen_at,
  count(p.id) filter (where p.status='paid')::int as paid_orders,
  coalesce(sum(p.amount_stars) filter (where p.status='paid' and p.currency='stars'),0)::bigint as paid_stars,
  max(p.created_at) filter (where p.status='paid') as last_purchase_at,
  exists(
    select 1 from public.subscriptions s
    where s.tg_user_id=u.id and s.plan='vip' and s.status='active'
      and (s.expires_at is null or s.expires_at>now())
  ) as is_vip,
  case
    when exists(
      select 1 from public.subscriptions s
      where s.tg_user_id=u.id and s.plan='vip' and s.status='active'
        and (s.expires_at is null or s.expires_at>now())
    ) then 'vip'
    when count(p.id) filter (where p.status='paid') >= 2 then 'repeat'
    when count(p.id) filter (where p.status='paid') = 1 then 'buyer'
    else 'prospect'
  end as segment
from public.tg_users u
left join public.purchases p on p.tg_user_id=u.id
group by u.id;

revoke all on public.customer_growth_segments from anon;
grant select on public.customer_growth_segments to authenticated;

update public.products
set upsell_product_id='ca2c194a-88bd-42ef-94ce-b14eebf5def1'
where id='7f627b02-4c17-4cb3-b830-a52601b59cac';

update public.products
set upsell_product_id='89223718-6bf2-43a8-a091-3943fe72ad53'
where id in ('53430659-a294-4461-abeb-74eceb0553bd','a3fd919b-63ca-43b4-a419-0dd08a56e2f6');

with existing as (
  select id from public.products where kind='bundle' and active=true limit 1
), created as (
  insert into public.products(title,description,kind,price_stars,price_ton,delivery_type,delivery_payload,active,sort_order)
  select '3er Best-of Bundle','Drei Sets zusammen günstiger als einzeln.','bundle',1150,5.1,'text','bundle:content',true,-10
  where not exists(select 1 from existing)
  returning id
), bundle as (
  select id from existing union all select id from created limit 1
)
insert into public.bundle_items(bundle_id,product_id)
select bundle.id,p.id
from bundle
join public.products p on p.id in (
  'ca2c194a-88bd-42ef-94ce-b14eebf5def1',
  'da7a3ade-f833-4913-8e82-b47d3fe08edf',
  '89223718-6bf2-43a8-a091-3943fe72ad53'
)
on conflict do nothing;
