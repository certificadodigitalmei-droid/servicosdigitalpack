-- Re-create link_generations if it doesn't exist
CREATE TABLE IF NOT EXISTS public.link_generations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    arquivo TEXT NOT NULL,
    total_empresas INTEGER NOT NULL DEFAULT 0,
    total_links INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

GRANT SELECT, INSERT ON public.link_generations TO authenticated;
GRANT ALL ON public.link_generations TO service_role;
ALTER TABLE public.link_generations ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow authenticated to select generations') THEN
        CREATE POLICY "Allow authenticated to select generations" ON public.link_generations FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow authenticated to insert generations') THEN
        CREATE POLICY "Allow authenticated to insert generations" ON public.link_generations FOR INSERT TO authenticated WITH CHECK (true);
    END IF;
END $$;

-- Update company_links to align with requirements
DO $$
BEGIN
    -- Add new columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_links' AND column_name = 'generation_id') THEN
        ALTER TABLE public.company_links ADD COLUMN generation_id UUID REFERENCES public.link_generations(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_links' AND column_name = 'company_data') THEN
        ALTER TABLE public.company_links ADD COLUMN company_data JSONB NOT NULL DEFAULT '{}'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_links' AND column_name = 'public_url') THEN
        ALTER TABLE public.company_links ADD COLUMN public_url TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_links' AND column_name = 'checkout_url') THEN
        ALTER TABLE public.company_links ADD COLUMN checkout_url TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_links' AND column_name = 'token') THEN
        ALTER TABLE public.company_links ADD COLUMN token TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_links' AND column_name = 'status') THEN
        ALTER TABLE public.company_links ADD COLUMN status TEXT DEFAULT 'active';
    END IF;
END $$;

-- Fix unique constraint for token
ALTER TABLE public.company_links DROP CONSTRAINT IF EXISTS company_links_token_key;
ALTER TABLE public.company_links ADD CONSTRAINT company_links_token_key UNIQUE (token);

GRANT SELECT, INSERT, UPDATE ON public.company_links TO authenticated;
GRANT SELECT ON public.company_links TO anon;
GRANT ALL ON public.company_links TO service_role;

-- Ensure policies use the correct columns
DROP POLICY IF EXISTS "Allow anon to select link by token" ON public.company_links;
CREATE POLICY "Allow anon to select link by token" ON public.company_links FOR SELECT TO anon USING (status = 'active');

DROP POLICY IF EXISTS "Allow authenticated to manage links" ON public.company_links;
CREATE POLICY "Allow authenticated to manage links" ON public.company_links FOR ALL TO authenticated USING (true);
