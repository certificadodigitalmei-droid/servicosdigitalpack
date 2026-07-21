
ALTER TABLE public.automatic_company_queries
  ADD COLUMN IF NOT EXISTS auto_import_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_generate_links_enabled boolean NOT NULL DEFAULT true;

-- Allow 'test_manual' trigger value on run rows (drop old check if present)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.automatic_company_query_runs'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%trigger%'
  LOOP
    EXECUTE format('ALTER TABLE public.automatic_company_query_runs DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
