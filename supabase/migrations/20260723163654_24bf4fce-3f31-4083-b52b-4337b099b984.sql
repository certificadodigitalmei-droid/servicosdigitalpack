
CREATE TABLE IF NOT EXISTS public.user_cloud_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_cloud_state TO authenticated;
GRANT ALL ON public.user_cloud_state TO service_role;

ALTER TABLE public.user_cloud_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own cloud state"
  ON public.user_cloud_state
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.tg_user_cloud_state_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER user_cloud_state_updated_at
  BEFORE UPDATE ON public.user_cloud_state
  FOR EACH ROW EXECUTE FUNCTION public.tg_user_cloud_state_updated_at();
