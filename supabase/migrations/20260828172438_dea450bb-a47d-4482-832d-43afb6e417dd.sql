revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;