create table public.job_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null,
  ok boolean not null default true,
  processed integer not null default 0,
  sent integer not null default 0,
  failed integer not null default 0,
  detail text not null default '',
  created_at timestamptz not null default now()
);
create index job_runs_job_created_idx on public.job_runs (job, created_at desc);
grant select on public.job_runs to authenticated;
grant all on public.job_runs to service_role;
alter table public.job_runs enable row level security;
create policy "team reads job runs" on public.job_runs for select to authenticated
  using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid()));

create table public.purchase_attributions (
  purchase_id uuid primary key references public.purchases(id) on delete cascade,
  delivery_id uuid references public.notification_deliveries(id) on delete set null,
  campaign_id uuid references public.notification_campaigns(id) on delete set null,
  kind notify_kind,
  channel notify_channel,
  audience text not null default '',
  template_source text not null default '',
  touch text not null default 'click',
  touched_at timestamptz,
  minutes_to_purchase integer not null default 0,
  amount_stars integer not null default 0,
  created_at timestamptz not null default now()
);
create index purchase_attributions_campaign_idx on public.purchase_attributions (campaign_id);
grant select on public.purchase_attributions to authenticated;
grant all on public.purchase_attributions to service_role;
alter table public.purchase_attributions enable row level security;
create policy "team reads attributions" on public.purchase_attributions for select to authenticated
  using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid()));