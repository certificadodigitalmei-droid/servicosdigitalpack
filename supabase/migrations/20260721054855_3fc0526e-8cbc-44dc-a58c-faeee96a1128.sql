
ALTER TABLE public.automatic_company_queries
  ADD COLUMN IF NOT EXISTS pagination_cursors jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS max_pages_per_run integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS page_size integer NOT NULL DEFAULT 50;

ALTER TABLE public.automatic_company_query_runs
  ADD COLUMN IF NOT EXISTS pages_fetched integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS items_received integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS items_analyzed integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS link_reused_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cursor_start jsonb,
  ADD COLUMN IF NOT EXISTS cursor_end jsonb;
