
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ============= automatic_company_queries =============
CREATE TABLE public.automatic_company_queries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Consulta padrão',
  enabled BOOLEAN NOT NULL DEFAULT false,
  mode TEXT NOT NULL DEFAULT 'openings_today',
  quantity_per_run INTEGER NOT NULL DEFAULT 1,
  interval_minutes INTEGER NOT NULL DEFAULT 60,
  filters JSONB NOT NULL DEFAULT jsonb_build_object(
    'only_mei', true,
    'only_active', true,
    'only_matriz', true,
    'require_email', true
  ),
  status TEXT NOT NULL DEFAULT 'inactive',
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX automatic_company_queries_due_idx
  ON public.automatic_company_queries (enabled, next_run_at)
  WHERE enabled = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.automatic_company_queries TO authenticated;
GRANT ALL ON public.automatic_company_queries TO service_role;
ALTER TABLE public.automatic_company_queries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage automatic_company_queries"
  ON public.automatic_company_queries
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

-- ============= automatic_company_query_runs =============
CREATE TABLE public.automatic_company_query_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  automation_id UUID NOT NULL REFERENCES public.automatic_company_queries(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running',
  trigger TEXT NOT NULL DEFAULT 'cron',
  requested_quantity INTEGER,
  api_total INTEGER,
  imported_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  link_created_count INTEGER NOT NULL DEFAULT 0,
  link_reused_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  api_summary JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX automatic_company_query_runs_by_automation
  ON public.automatic_company_query_runs (automation_id, started_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.automatic_company_query_runs TO authenticated;
GRANT ALL ON public.automatic_company_query_runs TO service_role;
ALTER TABLE public.automatic_company_query_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage automatic_company_query_runs"
  ON public.automatic_company_query_runs
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

-- ============= automatic_company_queue =============
CREATE TABLE public.automatic_company_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  automation_id UUID NOT NULL REFERENCES public.automatic_company_queries(id) ON DELETE CASCADE,
  query_date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  cnpj TEXT NOT NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  company_link_id UUID REFERENCES public.company_links(id) ON DELETE SET NULL,
  was_new_company BOOLEAN NOT NULL DEFAULT false,
  was_new_link BOOLEAN NOT NULL DEFAULT false,
  run_id UUID REFERENCES public.automatic_company_query_runs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (automation_id, query_date, cnpj)
);
CREATE INDEX automatic_company_queue_by_date
  ON public.automatic_company_queue (automation_id, query_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.automatic_company_queue TO authenticated;
GRANT ALL ON public.automatic_company_queue TO service_role;
ALTER TABLE public.automatic_company_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage automatic_company_queue"
  ON public.automatic_company_queue
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

-- ============= updated_at trigger =============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_aut_queries_updated_at
  BEFORE UPDATE ON public.automatic_company_queries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============= Lock / claim RPC =============
-- Called only by service_role from the internal worker route.
CREATE OR REPLACE FUNCTION public.claim_due_automation()
RETURNS TABLE (
  id UUID,
  owner_user_id UUID,
  mode TEXT,
  quantity_per_run INTEGER,
  interval_minutes INTEGER,
  filters JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed_id UUID;
BEGIN
  SELECT q.id INTO claimed_id
  FROM public.automatic_company_queries q
  WHERE q.enabled = true
    AND (q.next_run_at IS NULL OR q.next_run_at <= now())
    AND q.status <> 'running'
  ORDER BY q.next_run_at NULLS FIRST
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF claimed_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.automatic_company_queries
     SET status = 'running',
         updated_at = now()
   WHERE public.automatic_company_queries.id = claimed_id;

  RETURN QUERY
    SELECT q.id, q.owner_user_id, q.mode, q.quantity_per_run, q.interval_minutes, q.filters
      FROM public.automatic_company_queries q
     WHERE q.id = claimed_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_due_automation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_automation() TO service_role;

-- ============= Manual "run now" RPC (admin only, callable from server fn as user) =============
CREATE OR REPLACE FUNCTION public.claim_automation_by_id(_id UUID)
RETURNS TABLE (
  id UUID,
  owner_user_id UUID,
  mode TEXT,
  quantity_per_run INTEGER,
  interval_minutes INTEGER,
  filters JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed_id UUID;
BEGIN
  IF NOT private.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT q.id INTO claimed_id
  FROM public.automatic_company_queries q
  WHERE q.id = _id
    AND q.status <> 'running'
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF claimed_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.automatic_company_queries
     SET status = 'running', updated_at = now()
   WHERE public.automatic_company_queries.id = claimed_id;

  RETURN QUERY
    SELECT q.id, q.owner_user_id, q.mode, q.quantity_per_run, q.interval_minutes, q.filters
      FROM public.automatic_company_queries q
     WHERE q.id = claimed_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_automation_by_id(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_automation_by_id(UUID) TO authenticated, service_role;
