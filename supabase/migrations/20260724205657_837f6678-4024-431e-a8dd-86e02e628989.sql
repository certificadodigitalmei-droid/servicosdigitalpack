
CREATE TABLE IF NOT EXISTS public.email_send_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email text NOT NULL,
  subject text NOT NULL,
  html text,
  text text,
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'queued',
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  last_status_code int,
  next_retry_at timestamptz,
  sent_message_id text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_send_queue_status_check CHECK (status IN ('queued','sending','sent','failed','suppressed'))
);

CREATE INDEX IF NOT EXISTS email_send_queue_status_next_retry_idx
  ON public.email_send_queue (status, next_retry_at NULLS FIRST);

GRANT SELECT ON public.email_send_queue TO authenticated;
GRANT ALL ON public.email_send_queue TO service_role;

ALTER TABLE public.email_send_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view send queue"
  ON public.email_send_queue
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

CREATE TRIGGER email_send_queue_updated_at
  BEFORE UPDATE ON public.email_send_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
