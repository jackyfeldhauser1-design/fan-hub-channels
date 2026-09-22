do $block$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname='public'
      and tablename='purchases'
      and indexname in ('purchases_crypto_tx_uidx','purchases_crypto_tx_id_unique')
  ) then
    create unique index purchases_crypto_tx_id_unique
      on public.purchases (crypto_tx_id)
      where crypto_tx_id is not null;
  end if;
end
$block$;
