
-- Two-phase automation refactor: real metric columns + queue lifecycle + per-run limits.

-- 1. Real metric columns on runs (previously only inside api_summary).
ALTER TABLE public.automatic_company_query_runs
  ADD COLUMN IF NOT EXISTS current_stage TEXT,
  ADD COLUMN IF NOT EXISTS detail_queries INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS complete_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS partial_reason TEXT,
  ADD COLUMN IF NOT EXISTS limit_reason TEXT;

-- 2. Queue lifecycle columns (discovered → pending_enrichment → enriched → imported / error).
ALTER TABLE public.automatic_company_queue
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'discovered',
  ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT;

-- Back-fill status from existing data (imported when a link/company was tied).
UPDATE public.automatic_company_queue
   SET status = CASE
     WHEN company_link_id IS NOT NULL OR company_id IS NOT NULL THEN 'imported'
     WHEN data_quality_status = 'pending_enrichment' THEN 'pending_enrichment'
     ELSE 'discovered'
   END
 WHERE status IS NULL OR status = 'discovered';

CREATE INDEX IF NOT EXISTS automatic_company_queue_status_idx
  ON public.automatic_company_queue (automation_id, status, created_at);

-- 3. Per-run limits on the automation row (with safe defaults matching new arch).
ALTER TABLE public.automatic_company_queries
  ADD COLUMN IF NOT EXISTS search_pages_per_run INT NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS search_page_size INT NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS max_detail_queries_per_run INT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS max_items_analyzed_per_run INT NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS max_execution_time_ms INT NOT NULL DEFAULT 45000;
