
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS is_test_record boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS data_quality_status text NOT NULL DEFAULT 'complete',
  ADD COLUMN IF NOT EXISTS missing_fields jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.company_links
  ADD COLUMN IF NOT EXISTS is_test_record boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS data_quality_status text NOT NULL DEFAULT 'complete';

ALTER TABLE public.automatic_company_queue
  ADD COLUMN IF NOT EXISTS is_test_record boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS data_quality_status text NOT NULL DEFAULT 'complete',
  ADD COLUMN IF NOT EXISTS missing_fields jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.automatic_company_query_runs
  ADD COLUMN IF NOT EXISTS incomplete_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pending_enrichment_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS test_link_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS missing_fields_summary jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS companies_data_quality_status_idx
  ON public.companies (data_quality_status);

CREATE INDEX IF NOT EXISTS companies_is_test_record_idx
  ON public.companies (is_test_record);
