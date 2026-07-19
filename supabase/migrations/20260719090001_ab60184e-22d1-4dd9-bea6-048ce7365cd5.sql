-- Move handle_new_user_role to private schema to keep it out of public API
-- First create it in private schema
CREATE OR REPLACE FUNCTION private.handle_new_user_role()
RETURNS trigger AS $$
BEGIN
  IF NEW.email = 'coringa@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Update the trigger to use the new function path
DROP TRIGGER IF EXISTS on_auth_user_created_assign_role ON auth.users;
CREATE TRIGGER on_auth_user_created_assign_role
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.handle_new_user_role();

-- Remove the old function from public
DROP FUNCTION IF EXISTS public.handle_new_user_role();

-- Ensure EXECUTE is revoked from public on both secured functions
REVOKE EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.handle_new_user_role() FROM PUBLIC;

-- Grant to appropriate roles (service_role for trigger, authenticated for has_role check)
GRANT EXECUTE ON FUNCTION private.handle_new_user_role() TO service_role;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;
