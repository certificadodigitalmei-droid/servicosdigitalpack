ALTER TABLE public.satellite_jobs ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

ALTER TABLE public.satellite_jobs DROP CONSTRAINT IF EXISTS satellite_jobs_status_check;
ALTER TABLE public.satellite_jobs ADD CONSTRAINT satellite_jobs_status_check
  CHECK (status = ANY (ARRAY['claimed'::text,'sent'::text,'error'::text,'pending_test'::text]));

DROP INDEX IF EXISTS public.satellite_jobs_company_active_idx;
CREATE UNIQUE INDEX satellite_jobs_company_active_idx
  ON public.satellite_jobs (company_id)
  WHERE status IN ('claimed','sent') AND is_test = false;

CREATE INDEX IF NOT EXISTS satellite_jobs_pending_test_idx
  ON public.satellite_jobs (satellite_id, claimed_at)
  WHERE status = 'pending_test';