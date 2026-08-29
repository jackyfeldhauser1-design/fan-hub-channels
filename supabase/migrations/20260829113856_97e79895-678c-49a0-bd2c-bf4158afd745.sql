-- Zusatzspalten für Zustellprotokoll
ALTER TABLE public.notification_deliveries
  ADD COLUMN IF NOT EXISTS provider_message_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS provider_response text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS campaign_id uuid,
  ADD COLUMN IF NOT EXISTS opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS clicked_at timestamptz,
  ADD COLUMN IF NOT EXISTS open_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS click_count integer NOT NULL DEFAULT 0;

-- Vorlagen pro Alarmtyp
CREATE TABLE IF NOT EXISTS public.notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.notify_kind NOT NULL,
  audience text NOT NULL DEFAULT 'admin',
  body text NOT NULL DEFAULT '',
  link_url text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, audience)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_templates TO authenticated;
GRANT ALL ON public.notification_templates TO service_role;
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "templates admin" ON public.notification_templates FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE TRIGGER notification_templates_updated BEFORE UPDATE ON public.notification_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Kampagnen
CREATE TABLE IF NOT EXISTS public.notification_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind public.notify_kind NOT NULL DEFAULT 'expiring',
  segment text NOT NULL DEFAULT 'expiring_soon',
  audience text NOT NULL DEFAULT 'fan',
  body text NOT NULL DEFAULT '',
  link_url text NOT NULL DEFAULT '',
  scheduled_at timestamptz,
  status text NOT NULL DEFAULT 'draft',
  sent_count integer NOT NULL DEFAULT 0,
  last_run_at timestamptz,
  last_error text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_campaigns TO authenticated;
GRANT ALL ON public.notification_campaigns TO service_role;
ALTER TABLE public.notification_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaigns admin" ON public.notification_campaigns FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE TRIGGER notification_campaigns_updated BEFORE UPDATE ON public.notification_campaigns FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Öffnungen / Klicks / Käufe
CREATE TABLE IF NOT EXISTS public.notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid REFERENCES public.notification_deliveries(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.notification_campaigns(id) ON DELETE SET NULL,
  event text NOT NULL,
  detail text NOT NULL DEFAULT '',
  purchase_id uuid REFERENCES public.purchases(id) ON DELETE SET NULL,
  amount_stars integer NOT NULL DEFAULT 0,
  ip_hash text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notification_events_delivery_idx ON public.notification_events (delivery_id);
CREATE INDEX IF NOT EXISTS notification_events_created_idx ON public.notification_events (created_at DESC);
GRANT SELECT ON public.notification_events TO authenticated;
GRANT ALL ON public.notification_events TO service_role;
ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events admin" ON public.notification_events FOR SELECT TO authenticated USING (public.is_admin());

-- Ausgehende Webhooks
CREATE TABLE IF NOT EXISTS public.notification_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL DEFAULT '',
  url text NOT NULL,
  secret text NOT NULL DEFAULT '',
  events text[] NOT NULL DEFAULT ARRAY['delivery.sent','delivery.failed'],
  active boolean NOT NULL DEFAULT true,
  last_status text NOT NULL DEFAULT '',
  last_called_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_webhooks TO authenticated;
GRANT ALL ON public.notification_webhooks TO service_role;
ALTER TABLE public.notification_webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "webhooks admin" ON public.notification_webhooks FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE TRIGGER notification_webhooks_updated BEFORE UPDATE ON public.notification_webhooks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();