
CREATE TABLE public.whatsapp_batch_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  extension_token text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  profile text NOT NULL DEFAULT 'safe',
  min_delay_ms integer NOT NULL DEFAULT 45000,
  max_delay_ms integer NOT NULL DEFAULT 120000,
  batch_size integer NOT NULL DEFAULT 20,
  long_pause_ms integer NOT NULL DEFAULT 600000,
  daily_limit integer NOT NULL DEFAULT 200,
  sent_today integer NOT NULL DEFAULT 0,
  day_bucket date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  last_heartbeat_at timestamptz,
  running boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_batch_config TO authenticated;
GRANT ALL ON public.whatsapp_batch_config TO service_role;
ALTER TABLE public.whatsapp_batch_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wba_config_admin_all" ON public.whatsapp_batch_config
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));

CREATE TABLE public.whatsapp_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  phone text NOT NULL,
  message text NOT NULL,
  company_name text,
  cnpj text,
  company_link_id uuid,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  error_message text,
  batch_label text,
  claimed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wq_status_created ON public.whatsapp_queue (status, created_at);
CREATE INDEX idx_wq_owner_created ON public.whatsapp_queue (owner_user_id, created_at DESC);
CREATE INDEX idx_wq_phone_recent ON public.whatsapp_queue (phone, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_queue TO authenticated;
GRANT ALL ON public.whatsapp_queue TO service_role;
ALTER TABLE public.whatsapp_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wq_admin_all" ON public.whatsapp_queue
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));

CREATE TRIGGER wba_config_updated_at BEFORE UPDATE ON public.whatsapp_batch_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER wq_updated_at BEFORE UPDATE ON public.whatsapp_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RPC segura para a extensão pegar próxima mensagem (chamada via SECURITY DEFINER pelo endpoint público com token)
CREATE OR REPLACE FUNCTION public.wq_claim_next(_token text)
RETURNS TABLE(id uuid, phone text, message text, company_name text, cnpj text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg_owner uuid;
  claimed uuid;
  tz_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  SELECT owner_user_id INTO cfg_owner
    FROM public.whatsapp_batch_config
   WHERE extension_token = _token AND active = true
   LIMIT 1;
  IF cfg_owner IS NULL THEN RETURN; END IF;

  -- reset contador diário se mudou o dia
  UPDATE public.whatsapp_batch_config
     SET sent_today = 0, day_bucket = tz_today
   WHERE extension_token = _token AND day_bucket <> tz_today;

  -- limite diário
  IF EXISTS (
    SELECT 1 FROM public.whatsapp_batch_config
     WHERE extension_token = _token AND sent_today >= daily_limit
  ) THEN
    RETURN;
  END IF;

  SELECT q.id INTO claimed
    FROM public.whatsapp_queue q
   WHERE q.owner_user_id = cfg_owner
     AND q.status = 'pending'
   ORDER BY q.created_at ASC
   FOR UPDATE SKIP LOCKED
   LIMIT 1;

  IF claimed IS NULL THEN RETURN; END IF;

  UPDATE public.whatsapp_queue
     SET status = 'sending', claimed_at = now(), attempts = attempts + 1
   WHERE public.whatsapp_queue.id = claimed;

  RETURN QUERY
    SELECT q.id, q.phone, q.message, q.company_name, q.cnpj
      FROM public.whatsapp_queue q
     WHERE q.id = claimed;
END;
$$;
REVOKE ALL ON FUNCTION public.wq_claim_next(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wq_claim_next(text) TO service_role;

CREATE OR REPLACE FUNCTION public.wq_report(_token text, _id uuid, _status text, _error text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg_owner uuid;
  tz_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  SELECT owner_user_id INTO cfg_owner
    FROM public.whatsapp_batch_config
   WHERE extension_token = _token AND active = true
   LIMIT 1;
  IF cfg_owner IS NULL THEN RETURN false; END IF;

  IF _status NOT IN ('sent','failed','skipped') THEN RETURN false; END IF;

  UPDATE public.whatsapp_queue
     SET status = _status,
         error_message = _error,
         sent_at = CASE WHEN _status = 'sent' THEN now() ELSE sent_at END
   WHERE id = _id AND owner_user_id = cfg_owner;

  IF _status = 'sent' THEN
    UPDATE public.whatsapp_batch_config
       SET sent_today = CASE WHEN day_bucket = tz_today THEN sent_today + 1 ELSE 1 END,
           day_bucket = tz_today,
           last_heartbeat_at = now()
     WHERE extension_token = _token;
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.wq_report(text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wq_report(text, uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.wq_heartbeat(_token text)
RETURNS TABLE(min_delay_ms integer, max_delay_ms integer, batch_size integer, long_pause_ms integer, daily_limit integer, sent_today integer, running boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tz_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  UPDATE public.whatsapp_batch_config
     SET last_heartbeat_at = now(),
         sent_today = CASE WHEN day_bucket = tz_today THEN sent_today ELSE 0 END,
         day_bucket = tz_today
   WHERE extension_token = _token AND active = true;

  RETURN QUERY
    SELECT c.min_delay_ms, c.max_delay_ms, c.batch_size, c.long_pause_ms, c.daily_limit, c.sent_today, c.running
      FROM public.whatsapp_batch_config c
     WHERE c.extension_token = _token AND c.active = true
     LIMIT 1;
END;
$$;
REVOKE ALL ON FUNCTION public.wq_heartbeat(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wq_heartbeat(text) TO service_role;
