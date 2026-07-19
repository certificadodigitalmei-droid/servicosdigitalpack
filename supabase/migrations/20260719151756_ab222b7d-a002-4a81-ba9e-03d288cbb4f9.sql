ALTER TABLE public.link_events
  DROP CONSTRAINT IF EXISTS link_events_token_event_type_visitor_id_key;

CREATE INDEX IF NOT EXISTS link_events_unique_rollup_idx
  ON public.link_events (token, event_type, visitor_id);

CREATE INDEX IF NOT EXISTS link_events_event_created_idx
  ON public.link_events (event_type, created_at DESC);