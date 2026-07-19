GRANT SELECT, INSERT, UPDATE, DELETE ON public.link_generations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_links TO authenticated;
GRANT ALL ON public.link_generations TO service_role;
GRANT ALL ON public.company_links TO service_role;
GRANT SELECT ON public.company_links TO anon;

-- Re-verify grants
SELECT grantee, table_name, privilege_type 
FROM information_schema.role_table_grants 
WHERE table_name IN ('link_generations', 'company_links');