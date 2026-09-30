revoke all on table private.cron_tokens from public, anon, authenticated;

drop policy if exists deny_direct_access on private.cron_tokens;

create policy deny_direct_access
on private.cron_tokens
for all
to public
using (false)
with check (false);
