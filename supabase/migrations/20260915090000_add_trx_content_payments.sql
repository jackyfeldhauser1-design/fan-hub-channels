-- Telegram content payments: add TRX alongside native Stars and TON.
-- Customers stay in Telegram; only admins manage products, media and payment confirmation in the web app.

ALTER TYPE public.pay_currency ADD VALUE IF NOT EXISTS 'trx';

ALTER TABLE public.bot_settings
  ADD COLUMN IF NOT EXISTS trx_wallet text NOT NULL DEFAULT '';

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS price_trx numeric(18,6) NOT NULL DEFAULT 0;

ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS amount_trx numeric(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trx_memo text;

CREATE UNIQUE INDEX IF NOT EXISTS purchases_pending_trx_memo_uidx
  ON public.purchases (trx_memo)
  WHERE trx_memo IS NOT NULL;

COMMENT ON COLUMN public.bot_settings.trx_wallet IS
  'Public TRON (TRX) receiving address shown by the Telegram bot.';
COMMENT ON COLUMN public.products.price_trx IS
  'Optional TRX price. Zero disables TRX for this product.';
COMMENT ON COLUMN public.purchases.trx_memo IS
  'Unique payment reference used to match a TRX transfer before admin confirmation.';
