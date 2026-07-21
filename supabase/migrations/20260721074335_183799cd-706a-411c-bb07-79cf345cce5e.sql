ALTER TABLE public.automatic_company_queue ADD COLUMN IF NOT EXISTS raw_data jsonb;
ALTER TABLE public.automatic_company_queue ADD COLUMN IF NOT EXISTS last_normalized_at timestamptz;
CREATE INDEX IF NOT EXISTS automatic_company_queue_pending_idx ON public.automatic_company_queue(automation_id, status) WHERE status IN ('discovered','pending_enrichment');