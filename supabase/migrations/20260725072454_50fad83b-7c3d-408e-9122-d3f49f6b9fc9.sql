DROP TABLE IF EXISTS public.smtp_servers CASCADE;

CREATE TABLE public.email_workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  worker_url text NOT NULL,
  worker_api_key text NOT NULL,
  from_email text,
  from_name text,
  priority int NOT NULL DEFAULT 100,
  hourly_limit int NOT NULL DEFAULT 100,
  daily_limit int NOT NULL DEFAULT 2000,
  monthly_limit int NOT NULL DEFAULT 50000,
  is_active boolean NOT NULL DEFAULT false,
  last_test_at timestamptz,
  last_test_ok boolean,
  last_test_message text,
  last_used_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_workers TO authenticated;
GRANT ALL ON public.email_workers TO service_role;

ALTER TABLE public.email_workers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage email workers"
  ON public.email_workers
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));

CREATE TRIGGER trg_email_workers_updated_at
  BEFORE UPDATE ON public.email_workers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();