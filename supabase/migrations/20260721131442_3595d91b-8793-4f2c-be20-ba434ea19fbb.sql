
-- Revoke EXECUTE from PUBLIC/anon/authenticated on SECURITY DEFINER functions
-- that are not meant to be called directly by the client.
-- has_role is intentionally kept executable by authenticated users because
-- server functions call it via the user-scoped supabase client to authorize
-- admin actions (see src/lib/email-campaign/send.functions.ts).

REVOKE ALL ON FUNCTION public.resolve_company_link(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_company_link(text) TO service_role;

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
-- trigger function; only needs to be callable by the table owner (postgres) — no grants needed

REVOKE ALL ON FUNCTION public.claim_automation_by_id(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_automation_by_id(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.recover_stale_automations(interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_stale_automations(interval) TO service_role;

REVOKE ALL ON FUNCTION public.claim_due_automation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_automation() TO service_role;
