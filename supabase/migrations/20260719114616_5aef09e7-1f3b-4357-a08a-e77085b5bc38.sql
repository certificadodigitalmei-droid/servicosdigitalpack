-- Ensure the authenticated role has basic grants first (PostgREST requirement)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.link_generations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_links TO authenticated;
GRANT ALL ON public.link_generations TO service_role;
GRANT ALL ON public.company_links TO service_role;

-- Drop existing problematic or missing policies to start fresh
DROP POLICY IF EXISTS "Admins can manage generations" ON public.link_generations;
DROP POLICY IF EXISTS "Admins can manage company links" ON public.company_links;
DROP POLICY IF EXISTS "Authenticated full access on generations" ON public.link_generations;
DROP POLICY IF EXISTS "Authenticated full access on company links" ON public.company_links;

-- Create robust policies for the link generation process
-- These tables are intended for admin-only use in this app's context.
-- We check for the 'admin' role via the security-definer function.

CREATE POLICY "Admins can manage generations" 
ON public.link_generations 
FOR ALL 
TO authenticated 
USING (private.has_role(auth.uid(), 'admin'))
WITH CHECK (private.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage company links" 
ON public.company_links 
FOR ALL 
TO authenticated 
USING (private.has_role(auth.uid(), 'admin'))
WITH CHECK (private.has_role(auth.uid(), 'admin'));
