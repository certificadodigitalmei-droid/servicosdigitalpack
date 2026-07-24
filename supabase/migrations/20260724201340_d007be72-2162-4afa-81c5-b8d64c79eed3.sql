
CREATE TABLE public.smtp_servers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 587,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  from_email TEXT NOT NULL,
  from_name TEXT,
  encryption TEXT NOT NULL DEFAULT 'tls',
  hourly_limit INTEGER NOT NULL DEFAULT 100,
  daily_limit INTEGER NOT NULL DEFAULT 1000,
  monthly_limit INTEGER NOT NULL DEFAULT 30000,
  is_active BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.smtp_servers TO authenticated;
GRANT ALL ON public.smtp_servers TO service_role;
ALTER TABLE public.smtp_servers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage smtp servers" ON public.smtp_servers FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));
CREATE TRIGGER trg_smtp_servers_updated_at BEFORE UPDATE ON public.smtp_servers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
