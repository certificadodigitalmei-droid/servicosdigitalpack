REVOKE EXECUTE ON FUNCTION public.resolve_company_link(text) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_company_link(text) TO service_role;