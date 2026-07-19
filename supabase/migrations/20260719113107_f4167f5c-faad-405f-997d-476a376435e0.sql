-- Ensure authenticated can call has_role
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, app_role) TO authenticated;

-- Consolidate company_links policies: admins only for management; anon reads go through RPC
DROP POLICY IF EXISTS "Allow authenticated full access to company_links" ON public.company_links;
DROP POLICY IF EXISTS "Allow authenticated to manage links" ON public.company_links;
DROP POLICY IF EXISTS "Authenticated users can select company links" ON public.company_links;
DROP POLICY IF EXISTS "Authenticated users can insert company links" ON public.company_links;
DROP POLICY IF EXISTS "Allow anon select company_links" ON public.company_links;
DROP POLICY IF EXISTS "Allow anon to select link by token" ON public.company_links;

-- Keep single admin-only policy (already exists as "Admins can manage links"), ensure it exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='company_links' AND policyname='Admins can manage links') THEN
    CREATE POLICY "Admins can manage links" ON public.company_links
    FOR ALL TO authenticated
    USING (private.has_role(auth.uid(), 'admin'::app_role))
    WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;

-- Revoke direct anon access; token resolution goes through resolve_company_link SECURITY DEFINER RPC
REVOKE SELECT ON public.company_links FROM anon;

-- link_generations: consolidate to admin-only
DROP POLICY IF EXISTS "Allow authenticated full access to link_generations" ON public.link_generations;
DROP POLICY IF EXISTS "Allow authenticated to insert generations" ON public.link_generations;
DROP POLICY IF EXISTS "Allow authenticated to select generations" ON public.link_generations;
DROP POLICY IF EXISTS "Authenticated users can insert generations" ON public.link_generations;
DROP POLICY IF EXISTS "Authenticated users can select their generations" ON public.link_generations;
DROP POLICY IF EXISTS "Authenticated users can update their generations" ON public.link_generations;

CREATE POLICY "Admins can manage link generations"
ON public.link_generations
FOR ALL
TO authenticated
USING (private.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
