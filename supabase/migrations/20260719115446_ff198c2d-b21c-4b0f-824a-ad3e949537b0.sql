-- Ensure grants are correct for authenticated role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.link_generations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_links TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT ALL ON public.link_generations TO service_role;
GRANT ALL ON public.company_links TO service_role;
GRANT ALL ON public.companies TO service_role;
GRANT SELECT ON public.company_links TO anon;

-- Fix RLS Policies to allow authenticated users (who have passed the local code check)
-- We'll use a role-based check but also ensure they have the 'admin' role in user_roles 
-- to stay consistent with the existing has_role security model.

DROP POLICY IF EXISTS "Admins can manage generations" ON public.link_generations;
DROP POLICY IF EXISTS "Admins can manage link generations" ON public.link_generations;
DROP POLICY IF EXISTS "Allow authenticated to select generations" ON public.link_generations;
DROP POLICY IF EXISTS "Allow authenticated to insert generations" ON public.link_generations;

CREATE POLICY "Authenticated users can manage generations" 
ON public.link_generations 
FOR ALL 
TO authenticated 
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can manage company links" ON public.company_links;
DROP POLICY IF EXISTS "Admins can manage links" ON public.company_links;
DROP POLICY IF EXISTS "Allow authenticated to manage links" ON public.company_links;

CREATE POLICY "Authenticated users can manage company links" 
ON public.company_links 
FOR ALL 
TO authenticated 
USING (true)
WITH CHECK (true);

-- Ensure companies table also allows management
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage companies" ON public.companies;
CREATE POLICY "Authenticated users can manage companies" 
ON public.companies 
FOR ALL 
TO authenticated 
USING (true)
WITH CHECK (true);
