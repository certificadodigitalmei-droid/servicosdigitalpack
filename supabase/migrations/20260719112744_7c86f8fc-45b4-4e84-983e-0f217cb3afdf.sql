-- Grant permissions for link_generations
GRANT SELECT, INSERT, UPDATE, DELETE ON public.link_generations TO authenticated;
GRANT ALL ON public.link_generations TO service_role;

-- Grant permissions for company_links
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_links TO authenticated;
GRANT ALL ON public.company_links TO service_role;

-- Verify RLS is enabled
ALTER TABLE public.link_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_links ENABLE ROW LEVEL SECURITY;

-- Ensure authenticated users can insert into link_generations
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can insert generations' AND tablename = 'link_generations') THEN
        CREATE POLICY "Authenticated users can insert generations" ON public.link_generations
        FOR INSERT TO authenticated WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can select their generations' AND tablename = 'link_generations') THEN
        CREATE POLICY "Authenticated users can select their generations" ON public.link_generations
        FOR SELECT TO authenticated USING (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can update their generations' AND tablename = 'link_generations') THEN
        CREATE POLICY "Authenticated users can update their generations" ON public.link_generations
        FOR UPDATE TO authenticated USING (true);
    END IF;

    -- Ensure authenticated users can insert into company_links
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can insert company links' AND tablename = 'company_links') THEN
        CREATE POLICY "Authenticated users can insert company links" ON public.company_links
        FOR INSERT TO authenticated WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can select company links' AND tablename = 'company_links') THEN
        CREATE POLICY "Authenticated users can select company links" ON public.company_links
        FOR SELECT TO authenticated USING (true);
    END IF;
END $$;
