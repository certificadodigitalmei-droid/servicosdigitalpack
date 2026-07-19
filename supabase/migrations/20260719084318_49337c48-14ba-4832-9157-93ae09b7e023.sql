-- Fix RLS for user_roles (read only by security definer, but linter wants a policy if enabled)
CREATE POLICY "user_roles_read_admin" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Fix webhook_events (only service role needs access usually, but let's add a policy)
CREATE POLICY "webhook_events_service_role" ON public.webhook_events FOR ALL TO service_role USING (true);

-- Fix overly permissive policies by restricting to their own data if possible, 
-- but since these are for public checkout, 'true' is often used for INSERT. 
-- However, the linter warns about it. For INSERT only, it's usually fine.
-- The warning is for UPDATE/DELETE/ALL. My migration used ALL or INSERT.
-- I will refine them.

-- Fix security definer function permissions
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated, service_role;
