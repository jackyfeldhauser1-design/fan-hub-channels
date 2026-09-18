alter table public.products
  add column if not exists price_trx numeric not null default 0;

alter table public.products
  drop constraint if exists products_price_trx_check;

alter table public.products
  add constraint products_price_trx_check check (price_trx >= 0);
