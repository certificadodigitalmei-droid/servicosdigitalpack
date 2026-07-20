-- Create suppression_list table if it somehow doesn't exist (safety)
CREATE TABLE IF NOT EXISTS public.suppression_list (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    cnpj TEXT,
    reason TEXT,
    source TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES auth.users(id)
);

-- Ensure index on lowercase email for unique normalization
DROP INDEX IF EXISTS public.suppression_list_email_idx;
CREATE UNIQUE INDEX suppression_list_email_idx ON public.suppression_list (LOWER(email));

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppression_list TO authenticated;
GRANT ALL ON public.suppression_list TO service_role;

-- RLS
ALTER TABLE public.suppression_list ENABLE ROW LEVEL SECURITY;

-- Only admins can manage the suppression list
DROP POLICY IF EXISTS "Admins can manage suppression_list" ON public.suppression_list;
CREATE POLICY "Admins can manage suppression_list"
ON public.suppression_list
FOR ALL
TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role));
