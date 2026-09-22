create extension if not exists pg_cron with schema pg_catalog;

alter table public.bot_settings add column if not exists cart_recovery_token_hash text not null default '';
alter table public.purchases add column if not exists reminded_at timestamptz;

-- Historical abandoned test payments must not trigger customer reminders.
update public.invoice_intents set reminded_at=coalesce(reminded_at,now()) where paid=false;
update public.purchases set reminded_at=coalesce(reminded_at,now()) where currency='ton' and status='pending';

do $block$
declare recovery_token text;
begin
  recovery_token:=encode(extensions.gen_random_bytes(32),'hex');
  perform vault.create_secret(recovery_token,'fan_hub_cart_recovery_token','Token for the cart-recovery Edge Function');
  update public.bot_settings
  set cart_recovery_token_hash=encode(extensions.digest(recovery_token,'sha256'),'hex'),updated_at=now()
  where id=true;
end
$block$;

select cron.schedule(
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
