
DROP POLICY IF EXISTS "public can insert consent" ON public.consent_logs;
CREATE POLICY "public can insert consent"
  ON public.consent_logs FOR INSERT TO anon, authenticated
  WITH CHECK (
    privacy_accepted = true
    AND terms_accepted = true
    AND service_private_acknowledged = true
    AND (user_agent IS NULL OR length(user_agent) <= 1000)
    AND (order_id IS NULL OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id))
  );

DROP POLICY IF EXISTS webhook_events_service_role ON public.webhook_events;
CREATE POLICY webhook_events_service_role
  ON public.webhook_events FOR ALL TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
