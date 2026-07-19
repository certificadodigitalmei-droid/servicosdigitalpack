
CREATE TABLE public.link_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_link_id uuid REFERENCES public.company_links(id) ON DELETE CASCADE,
  token text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('view_link','view_checkout','click_certificado','click_guia')),
  visitor_id text NOT NULL,
  browser text,
  os text,
  device text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (token, event_type, visitor_id)
);

CREATE INDEX link_events_token_idx ON public.link_events (token);
CREATE INDEX link_events_type_idx ON public.link_events (event_type);
CREATE INDEX link_events_created_idx ON public.link_events (created_at DESC);

GRANT INSERT ON public.link_events TO anon, authenticated;
GRANT SELECT ON public.link_events TO authenticated;
GRANT ALL ON public.link_events TO service_role;

ALTER TABLE public.link_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert own event"
  ON public.link_events FOR INSERT
  TO anon, authenticated
  WITH CHECK (event_type IN ('view_link','view_checkout','click_certificado','click_guia'));

CREATE POLICY "Admins read link_events"
  ON public.link_events FOR SELECT
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));
