-- 1. Idempotenz für Telegram-Zahlungen
CREATE UNIQUE INDEX IF NOT EXISTS purchases_telegram_charge_uidx
  ON public.purchases (telegram_charge_id)
  WHERE telegram_charge_id IS NOT NULL;

-- 2. Abos
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_user_id uuid NOT NULL REFERENCES public.tg_users(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'vip',
  status text NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  renewals integer NOT NULL DEFAULT 0,
  last_reminder_at timestamptz,
  last_purchase_id uuid REFERENCES public.purchases(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscriptions_user_idx ON public.subscriptions (tg_user_id);
CREATE INDEX IF NOT EXISTS subscriptions_expiry_idx ON public.subscriptions (status, expires_at);
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscriptions admin read" ON public.subscriptions FOR SELECT TO authenticated USING (public.is_admin());

-- 3. Rabattcodes
CREATE TABLE IF NOT EXISTS public.discount_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL DEFAULT '',
  percent_off integer NOT NULL DEFAULT 0,
  stars_off integer NOT NULL DEFAULT 0,
  max_uses integer NOT NULL DEFAULT 0,
  used_count integer NOT NULL DEFAULT 0,
  once_per_fan boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discount_codes TO authenticated;
GRANT ALL ON public.discount_codes TO service_role;
ALTER TABLE public.discount_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "discount_codes admin all" ON public.discount_codes FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE IF NOT EXISTS public.code_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id uuid NOT NULL REFERENCES public.discount_codes(id) ON DELETE CASCADE,
  tg_user_id uuid REFERENCES public.tg_users(id) ON DELETE SET NULL,
  purchase_id uuid REFERENCES public.purchases(id),
  amount_saved integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS code_redemptions_code_idx ON public.code_redemptions (code_id);
GRANT SELECT ON public.code_redemptions TO authenticated;
GRANT ALL ON public.code_redemptions TO service_role;
ALTER TABLE public.code_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "code_redemptions admin read" ON public.code_redemptions FOR SELECT TO authenticated USING (public.is_admin());

-- 4. Offene Rechnungen (Warenkorb-Rettung)
CREATE TABLE IF NOT EXISTS public.invoice_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_user_id uuid NOT NULL REFERENCES public.tg_users(id) ON DELETE CASCADE,
  chat_id bigint NOT NULL,
  payload text NOT NULL,
  title text NOT NULL DEFAULT '',
  amount_stars integer NOT NULL DEFAULT 0,
  paid boolean NOT NULL DEFAULT false,
  reminded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoice_intents_open_idx ON public.invoice_intents (paid, created_at);
GRANT SELECT ON public.invoice_intents TO authenticated;
GRANT ALL ON public.invoice_intents TO service_role;
ALTER TABLE public.invoice_intents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoice_intents admin read" ON public.invoice_intents FOR SELECT TO authenticated USING (public.is_admin());

-- 5. Bot-Sequenzen (Willkommen / Reaktivierung)
CREATE TABLE IF NOT EXISTS public.fan_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_user_id uuid NOT NULL REFERENCES public.tg_users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'welcome',
  step integer NOT NULL DEFAULT 0,
  next_at timestamptz NOT NULL DEFAULT now(),
  done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tg_user_id, kind)
);
CREATE INDEX IF NOT EXISTS fan_sequences_due_idx ON public.fan_sequences (done, next_at);
GRANT SELECT ON public.fan_sequences TO authenticated;
GRANT ALL ON public.fan_sequences TO service_role;
ALTER TABLE public.fan_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fan_sequences admin read" ON public.fan_sequences FOR SELECT TO authenticated USING (public.is_admin());

-- 6. Neue Einstellungen
ALTER TABLE public.bot_settings
  ADD COLUMN IF NOT EXISTS vip_period_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vip_reminder_days integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS reactivate_after_days integer NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS sequence_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cart_recovery_minutes integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS cart_recovery_code text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS referral_tier_threshold integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS referral_tier_percent integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS tip_amounts text NOT NULL DEFAULT '50,150,500';

CREATE TRIGGER subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER discount_codes_updated_at BEFORE UPDATE ON public.discount_codes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER fan_sequences_updated_at BEFORE UPDATE ON public.fan_sequences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();