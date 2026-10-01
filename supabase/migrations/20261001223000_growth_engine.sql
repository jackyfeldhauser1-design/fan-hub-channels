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


-- Lifecycle automation, personalization, A/B testing and performance analytics.
create table if not exists public.automation_deliveries (
  id uuid primary key default gen_random_uuid(),
  tg_user_id uuid references public.tg_users(id) on delete cascade,
  automation_key text not null,
  subject_key text not null default '',
  stage text not null default '',
  payload jsonb not null default '{}'::jsonb,
  delivered_at timestamptz not null default now(),
  unique(tg_user_id, automation_key, subject_key, stage)
);
alter table public.automation_deliveries enable row level security;
revoke all on table public.automation_deliveries from anon;
grant select on table public.automation_deliveries to authenticated;
drop policy if exists automation_deliveries_admin_select on public.automation_deliveries;
create policy automation_deliveries_admin_select on public.automation_deliveries
for select to authenticated using (public.is_admin());

create table if not exists public.teaser_experiments (
  id uuid primary key default gen_random_uuid(),
  content_set_id uuid not null references public.content_sets(id) on delete cascade,
  variant text not null check (variant in ('A','B')),
  message_id bigint,
  published_at timestamptz not null default now(),
  unique(content_set_id)
);
alter table public.teaser_experiments enable row level security;
revoke all on table public.teaser_experiments from anon;
grant select on table public.teaser_experiments to authenticated;
drop policy if exists teaser_experiments_admin_select on public.teaser_experiments;
create policy teaser_experiments_admin_select on public.teaser_experiments
for select to authenticated using (public.is_admin());

alter table public.bot_settings
  add column if not exists winback_days text not null default '14,30,60',
  add column if not exists new_drop_notify boolean not null default true,
  add column if not exists vip_upgrade_after_purchases integer not null default 2,
  add column if not exists loyalty_bonus_every integer not null default 3,
  add column if not exists daily_report_enabled boolean not null default true,
  add column if not exists weekly_report_enabled boolean not null default true,
  add column if not exists revenue_alert_enabled boolean not null default true,
  add column if not exists revenue_alert_stars integer not null default 500,
  add column if not exists abandonment_alert_count integer not null default 3,
  add column if not exists cross_sell_after_open_hours integer not null default 24,
  add column if not exists saturation_percent integer not null default 80;

create or replace view public.customer_growth_scores
with (security_invoker=true) as
with active_sets as (
  select count(*)::numeric as total from public.content_sets where status='active'
),
owned as (
  select tg_user_id,count(distinct content_set_id)::numeric as owned
  from public.content_access
  where status='active' and (expires_at is null or expires_at>now())
  group by tg_user_id
),
ev as (
  select tg_user_id,
    count(*) filter (where event_type='teaser_click' and created_at>now()-interval '30 days') as teaser_clicks,
    count(*) filter (where event_type='offer_view' and created_at>now()-interval '30 days') as offer_views,
    count(*) filter (where event_type='checkout_started' and created_at>now()-interval '30 days') as checkouts,
    count(*) filter (where event_type='recovery_click' and created_at>now()-interval '30 days') as recovery_clicks
  from public.growth_events
  group by tg_user_id
)
select
  s.*,
  coalesce(o.owned,0)::int as owned_sets,
  greatest(0,(select total from active_sets)-coalesce(o.owned,0))::int as unowned_sets,
  case when (select total from active_sets)>0 then round((coalesce(o.owned,0)/(select total from active_sets))*100,1) else 0 end as saturation_percent,
  case
    when s.is_vip then 'VIP'
    when s.paid_orders>=5 then 'Gold'
    when s.paid_orders>=2 then 'Stammkunde'
    when s.paid_orders=1 then 'Käufer'
    else 'Interessent'
  end as loyalty_level,
  least(100,
    (case when s.paid_orders>=2 then 25 when s.paid_orders=1 then 15 else 0 end)
    + least(coalesce(ev.teaser_clicks,0)*5,20)
    + least(coalesce(ev.offer_views,0)*4,20)
    + least(coalesce(ev.checkouts,0)*10,30)
    + least(coalesce(ev.recovery_clicks,0)*5,10)
  )::int as purchase_probability,
  case
    when s.paid_orders=0 then 'none'
    when s.last_purchase_at < now()-interval '60 days' then 'high'
    when s.last_purchase_at < now()-interval '30 days' then 'medium'
    when s.last_purchase_at < now()-interval '14 days' then 'watch'
    else 'low'
  end as churn_risk
from public.customer_growth_segments s
left join owned o on o.tg_user_id=s.tg_user_id
left join ev on ev.tg_user_id=s.tg_user_id;

revoke all on public.customer_growth_scores from anon;
grant select on public.customer_growth_scores to authenticated;

create or replace view public.product_performance_30d
with (security_invoker=true) as
select
  p.id as product_id,
  p.title,
  p.kind,
  p.price_stars,
  p.price_ton,
  count(*) filter (where g.event_type='offer_view')::int as offer_views,
  count(*) filter (where g.event_type='checkout_started')::int as checkout_starts,
  count(*) filter (where g.event_type='purchase_paid')::int as tracked_purchases,
  coalesce((select count(*) from public.purchases pu where pu.product_id=p.id and pu.status='paid' and pu.created_at>now()-interval '30 days'),0)::int as paid_purchases,
  coalesce((select sum(pu.amount_stars) from public.purchases pu where pu.product_id=p.id and pu.status='paid' and pu.currency='stars' and pu.created_at>now()-interval '30 days'),0)::bigint as revenue_stars,
  coalesce((select sum(pu.amount_ton) from public.purchases pu where pu.product_id=p.id and pu.status='paid' and pu.currency='ton' and pu.created_at>now()-interval '30 days'),0)::numeric as revenue_ton
from public.products p
left join public.growth_events g on g.product_id=p.id and g.created_at>now()-interval '30 days'
where p.active=true
group by p.id;

revoke all on public.product_performance_30d from anon;
grant select on public.product_performance_30d to authenticated;

with existing as (
  select id from public.products where kind='bundle' and title='2er Best-of Bundle' limit 1
), created as (
  insert into public.products(title,description,kind,price_stars,price_ton,delivery_type,delivery_payload,active,sort_order)
  select '2er Best-of Bundle','Zwei passende Sets zusammen mit Bundle-Vorteil.','bundle',675,2.7,'text','bundle:content',true,-20
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
  'da7a3ade-f833-4913-8e82-b47d3fe08edf'
)
on conflict do nothing;


do $$
begin
  if exists(select 1 from cron.job where jobname='fan-hub-growth-automation') then
    perform cron.unschedule('fan-hub-growth-automation');
  end if;
  if exists(select 1 from vault.decrypted_secrets where name='fan_hub_cart_recovery_token') then
    perform cron.schedule(
      'fan-hub-growth-automation',
      '0 * * * *',
      $job$
      select net.http_post(
        url:='https://biqvodzbbgfkzwrapftz.supabase.co/functions/v1/growth-automation',
        headers:=jsonb_build_object(
          'Content-Type','application/json',
          'X-Cron-Token',(select decrypted_secret from vault.decrypted_secrets where name='fan_hub_cart_recovery_token')
        ),
        body:=jsonb_build_object('scheduled_at',now()),
        timeout_milliseconds:=30000
      );
      $job$
    );
  end if;
end $$;
