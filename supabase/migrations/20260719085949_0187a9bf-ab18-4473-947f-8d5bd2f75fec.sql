-- Fix search_path and public access for handle_new_user_role
ALTER FUNCTION public.handle_new_user_role() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_user_role() TO service_role;

-- Ensure private.has_role is also secured correctly
REVOKE EXECUTE ON FUNCTION private.has_role FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_role TO authenticated, service_role;
