-- Add missing columns
ALTER TABLE public.suppression_list ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE public.suppression_list ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- Create a unique index on the normalized (lowercase) email if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'suppression_list_email_idx') THEN
        CREATE UNIQUE INDEX suppression_list_email_idx ON public.suppression_list (LOWER(email));
    END IF;
END
$$;

-- Drop old policy if exists
DROP POLICY IF EXISTS "Admins can manage suppression" ON public.suppression_list;
DROP POLICY IF EXISTS "Admins can manage suppression list" ON public.suppression_list;

-- Policy: Only admins can view and manage records
CREATE POLICY "Admins can manage suppression list" ON public.suppression_list
    FOR ALL
    TO authenticated
    USING (private.has_role(auth.uid(), 'admin'::public.app_role))
    WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));