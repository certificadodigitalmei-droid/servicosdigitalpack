-- Create link_generations table
CREATE TABLE IF NOT EXISTS public.link_generations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    arquivo TEXT NOT NULL,
    total_empresas INTEGER NOT NULL DEFAULT 0,
    total_links INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Grant access to link_generations
GRANT SELECT, INSERT ON public.link_generations TO authenticated;
GRANT ALL ON public.link_generations TO service_role;

-- Enable RLS on link_generations
ALTER TABLE public.link_generations ENABLE ROW LEVEL SECURITY;

-- Create policy for link_generations
CREATE POLICY "Allow authenticated to select generations" ON public.link_generations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated to insert generations" ON public.link_generations FOR INSERT TO authenticated WITH CHECK (true);

-- Create company_links table
CREATE TABLE IF NOT EXISTS public.company_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID,
    token TEXT NOT NULL UNIQUE,
    public_url TEXT,
    checkout_url TEXT,
    generation_id UUID REFERENCES public.link_generations(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    first_access_at TIMESTAMP WITH TIME ZONE,
    last_access_at TIMESTAMP WITH TIME ZONE,
    access_count INTEGER DEFAULT 0,
    company_data JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Grant access to company_links
GRANT SELECT, INSERT, UPDATE ON public.company_links TO authenticated;
GRANT SELECT ON public.company_links TO anon;
GRANT ALL ON public.company_links TO service_role;

-- Enable RLS on company_links
ALTER TABLE public.company_links ENABLE ROW LEVEL SECURITY;

-- Create policy for company_links
-- Admin can see all
CREATE POLICY "Allow authenticated to manage links" ON public.company_links FOR ALL TO authenticated USING (true);
-- Anonymous can see their specific link via token
CREATE POLICY "Allow anon to select link by token" ON public.company_links FOR SELECT TO anon USING (status = 'active');
