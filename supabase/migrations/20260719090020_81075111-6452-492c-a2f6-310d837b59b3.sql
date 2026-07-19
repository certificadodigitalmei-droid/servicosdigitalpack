-- Re-verify revokes on the functions in the private schema
REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION private.handle_new_user_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.handle_new_user_role() FROM anon;
REVOKE ALL ON FUNCTION private.handle_new_user_role() FROM authenticated;
GRANT EXECUTE ON FUNCTION private.handle_new_user_role() TO service_role;
