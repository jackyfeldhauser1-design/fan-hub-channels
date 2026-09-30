create unique index if not exists purchases_one_pending_ton_per_user_product_uidx
on public.purchases (tg_user_id, product_id)
where currency = 'ton' and status = 'pending';
