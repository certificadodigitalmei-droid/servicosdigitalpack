-- Drop existing policies to recreate them cleanly
DROP POLICY IF EXISTS "Authenticated users can insert generations" ON public.link_generations;
DROP POLICY IF EXISTS "Authenticated users can select their generations" ON public.link_generations;
DROP POLICY IF EXISTS "Authenticated users can update their generations" ON public.link_generations;
DROP POLICY IF EXISTS "Authenticated users can insert company links" ON public.company_links;
DROP POLICY IF EXISTS "Authenticated users can select company links" ON public.company_links;

-- Create broad policies for authenticated users
-- Since this is an admin panel for authenticated users, we allow them to manage these tables
CREATE POLICY "Allow authenticated full access to link_generations"
ON public.link_generations
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow authenticated full access to company_links"
ON public.company_links
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Also ensure anon can select from company_links for the public routes
-- (Checking if a policy already exists for anon)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow anon select company_links' AND tablename = 'company_links') THEN
        CREATE POLICY "Allow anon select company_links"
        ON public.company_links
        FOR SELECT
        TO anon
        USING (true);
    END IF;
END $$;

-- Double check GRANTS
GRANT ALL ON public.link_generations TO authenticated;
GRANT ALL ON public.link_generations TO service_role;
GRANT ALL ON public.company_links TO authenticated;
GRANT ALL ON public.company_links TO service_role;
GRANT SELECT ON public.company_links TO anon;
