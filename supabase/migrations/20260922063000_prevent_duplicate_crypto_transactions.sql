create unique index if not exists purchases_crypto_tx_id_unique
on public.purchases (crypto_tx_id)
where crypto_tx_id is not null;
