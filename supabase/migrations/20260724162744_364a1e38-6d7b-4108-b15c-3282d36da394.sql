
ALTER TABLE public.link_events DROP CONSTRAINT IF EXISTS link_events_event_type_check;
ALTER TABLE public.link_events ADD CONSTRAINT link_events_event_type_check
  CHECK (event_type = ANY (ARRAY['view_link','view_checkout','click_certificado','click_guia','copy_pix']));

DROP POLICY IF EXISTS "Anyone can insert own event" ON public.link_events;
CREATE POLICY "Anyone can insert own event" ON public.link_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (event_type = ANY (ARRAY['view_link','view_checkout','click_certificado','click_guia','copy_pix']));
