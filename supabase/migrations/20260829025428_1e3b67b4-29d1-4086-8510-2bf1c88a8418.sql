-- Replace has_role() in RLS policies with an inline, RLS-safe subquery so the
-- SECURITY DEFINER function no longer needs to be executable by signed-in users.

create or replace function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'admin'
  )
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

-- bot_settings
drop policy "admins read settings" on public.bot_settings;
create policy "admins read settings" on public.bot_settings for select to authenticated using (public.is_admin());
drop policy "admins write settings" on public.bot_settings;
create policy "admins write settings" on public.bot_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- products
drop policy "admins manage products" on public.products;
create policy "admins manage products" on public.products for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- bundle_items
drop policy "admins manage bundle items" on public.bundle_items;
create policy "admins manage bundle items" on public.bundle_items for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- tg_users
drop policy "admins manage tg users" on public.tg_users;
create policy "admins manage tg users" on public.tg_users for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- purchases
drop policy "admins manage purchases" on public.purchases;
create policy "admins manage purchases" on public.purchases for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- payouts
drop policy "admins manage payouts" on public.payouts;
create policy "admins manage payouts" on public.payouts for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- leads
drop policy "admins manage leads" on public.leads;
create policy "admins manage leads" on public.leads for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- telegram_updates
drop policy "admins read updates" on public.telegram_updates;
create policy "admins read updates" on public.telegram_updates for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- access_tokens
drop policy "admins manage access tokens" on public.access_tokens;
create policy "admins manage access tokens" on public.access_tokens for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- order_events
drop policy "admins read order events" on public.order_events;
create policy "admins read order events" on public.order_events for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- action_log
drop policy "admins read action log" on public.action_log;
create policy "admins read action log" on public.action_log for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- sponsored_posts
drop policy "admins manage sponsored posts" on public.sponsored_posts;
create policy "admins manage sponsored posts" on public.sponsored_posts for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- user_roles: role management happens exclusively via the server-side service role
-- (claimAdmin uses the admin client), so the admin manage policy is dropped.
-- "users read own roles" remains for self-checks.
drop policy "admins manage roles" on public.user_roles;

-- Lock down the SECURITY DEFINER function: no longer callable by signed-in users.
revoke execute on function public.has_role(uuid, public.app_role) from public, anon, authenticated;
grant execute on function public.has_role(uuid, public.app_role) to service_role;