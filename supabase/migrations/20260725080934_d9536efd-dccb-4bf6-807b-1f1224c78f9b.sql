
CREATE TABLE public.satellite_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  satellite_id TEXT NOT NULL,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cnpj TEXT,
  email TEXT NOT NULL,
  public_token TEXT,
  public_url TEXT,
  status TEXT NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed','sent','error')),
  error_message TEXT,
  provider_message_id TEXT,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX satellite_jobs_company_active_idx
  ON public.satellite_jobs (company_id)
  WHERE status IN ('claimed','sent');

CREATE INDEX satellite_jobs_satellite_status_idx
  ON public.satellite_jobs (satellite_id, status, claimed_at DESC);

CREATE INDEX satellite_jobs_status_claimed_at_idx
  ON public.satellite_jobs (status, claimed_at DESC);

GRANT SELECT ON public.satellite_jobs TO authenticated;
GRANT ALL ON public.satellite_jobs TO service_role;

ALTER TABLE public.satellite_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read satellite_jobs"
  ON public.satellite_jobs
  FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER satellite_jobs_set_updated_at
  BEFORE UPDATE ON public.satellite_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
