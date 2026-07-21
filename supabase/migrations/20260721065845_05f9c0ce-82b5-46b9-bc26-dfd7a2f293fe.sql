
-- Restrict email_campaigns to admins only
DROP POLICY IF EXISTS "Auth manage campaigns" ON public.email_campaigns;
DROP POLICY IF EXISTS "Admins can manage campaigns" ON public.email_campaigns;
CREATE POLICY "Admins can manage campaigns" ON public.email_campaigns
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

-- Restrict email_campaign_recipients to admins only
DROP POLICY IF EXISTS "Auth manage recipients" ON public.email_campaign_recipients;
DROP POLICY IF EXISTS "Admins can manage recipients" ON public.email_campaign_recipients;
CREATE POLICY "Admins can manage recipients" ON public.email_campaign_recipients
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

-- Lock down SECURITY DEFINER functions: revoke public/anon/authenticated execute
REVOKE ALL ON FUNCTION public.resolve_company_link(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_automation_by_id(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_due_automation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recover_stale_automations(interval) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.resolve_company_link(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_automation_by_id(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_due_automation() TO service_role;
GRANT EXECUTE ON FUNCTION public.recover_stale_automations(interval) TO service_role;
