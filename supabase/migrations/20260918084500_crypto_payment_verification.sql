-- Automatic crypto payment verification.
ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS crypto_tx_id text;

CREATE UNIQUE INDEX IF NOT EXISTS purchases_crypto_tx_uidx
  ON public.purchases(crypto_tx_id)
  WHERE crypto_tx_id IS NOT NULL;
