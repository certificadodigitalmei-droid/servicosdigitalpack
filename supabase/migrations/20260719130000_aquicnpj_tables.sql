-- Create system settings table for API config and range query
CREATE TABLE IF NOT EXISTS public.system_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Grant access
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_settings TO authenticated;
GRANT ALL ON public.system_settings TO service_role;

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Policy for admins (since it's a private app, but let's be safe)
CREATE POLICY "Admins can manage system settings"
ON public.system_settings
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Initial settings
INSERT INTO public.system_settings (key, value)
VALUES 
('aquicnpj_config', '{"base_url": "https://api.aquicnpj.com", "range_query": {}}'::jsonb),
('monitoring_config', '{"active": false, "filters": {"somente_mei": true, "somente_matriz": true, "com_email": true}}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Companies table (if not exists, though previous migrations likely created it)
CREATE TABLE IF NOT EXISTS public.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cnpj TEXT UNIQUE NOT NULL,
    razao_social TEXT NOT NULL,
    nome_titular_exibicao TEXT,
    email TEXT,
    telefones JSONB DEFAULT '[]'::jsonb,
    is_mei BOOLEAN DEFAULT false,
    inicio_atividade DATE,
    situacao_cadastral TEXT,
    raw_data JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Grant access
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT SELECT ON public.companies TO anon; -- Needed for leaf pages
GRANT ALL ON public.companies TO service_role;

-- Enable RLS
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- API Logs table
CREATE TABLE IF NOT EXISTS public.api_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL,
    status_code INTEGER,
    duration_ms INTEGER,
    results_count INTEGER,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT ON public.api_logs TO authenticated;
GRANT ALL ON public.api_logs TO service_role;
ALTER TABLE public.api_logs ENABLE ROW LEVEL SECURITY;
