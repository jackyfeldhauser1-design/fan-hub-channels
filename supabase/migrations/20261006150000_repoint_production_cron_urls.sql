-- Repoint scheduled production jobs to the linked Supabase project.
-- Keeps runtime automation independent of the former Lovable/legacy project.
do $$
begin
  if exists(select 1 from cron.job where jobname='fan-hub-cart-recovery') then
    perform cron.unschedule('fan-hub-cart-recovery');
  end if;
  if exists(select 1 from cron.job where jobname='fan-hub-growth-automation') then
    perform cron.unschedule('fan-hub-growth-automation');
  end if;

  if exists(select 1 from vault.decrypted_secrets where name='fan_hub_cart_recovery_token') then
    perform cron.schedule(
      'fan-hub-cart-recovery',
      '*/5 * * * *',
      $job$
      select net.http_post(
        url:='https://biqvodzbbgfkzwrapftz.supabase.co/functions/v1/cart-recovery',
        headers:=jsonb_build_object(
          'Content-Type','application/json',
          'X-Cron-Token',(select decrypted_secret from vault.decrypted_secrets where name='fan_hub_cart_recovery_token')
        ),
        body:=jsonb_build_object('scheduled_at',now()),
        timeout_milliseconds:=15000
      );
      $job$
    );

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
