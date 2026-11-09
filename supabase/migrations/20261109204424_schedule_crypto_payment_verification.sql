do $$
begin
  if exists (select 1 from vault.secrets where name = 'fan_hub_cart_recovery_token') then
    perform cron.schedule(
      'fan-hub-crypto-verification',
      '*/5 * * * *',
      $job$
      select net.http_post(
        url := 'https://itsfelize.store/api/public/jobs/crypto',
        headers := jsonb_build_object(
          'x-cron-token',
          (select decrypted_secret from vault.decrypted_secrets where name = 'fan_hub_cart_recovery_token')
        ),
        timeout_milliseconds := 30000
      );
      $job$
    );
  end if;
end $$;
