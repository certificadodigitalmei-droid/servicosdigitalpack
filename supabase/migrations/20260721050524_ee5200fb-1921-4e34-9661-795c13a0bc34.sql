
ALTER TABLE public.automatic_company_queries
  ADD COLUMN IF NOT EXISTS query_date_mode text NOT NULL DEFAULT 'today',
  ADD COLUMN IF NOT EXISTS selected_query_date date;

ALTER TABLE public.automatic_company_queries
  DROP CONSTRAINT IF EXISTS automatic_company_queries_query_date_mode_check;
ALTER TABLE public.automatic_company_queries
  ADD CONSTRAINT automatic_company_queries_query_date_mode_check
  CHECK (query_date_mode IN ('today','specific'));

ALTER TABLE public.automatic_company_query_runs
  ADD COLUMN IF NOT EXISTS query_date date;
