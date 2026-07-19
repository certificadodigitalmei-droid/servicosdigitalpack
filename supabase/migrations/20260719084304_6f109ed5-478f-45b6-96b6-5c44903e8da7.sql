-- ENUMS
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TYPE public.monitor_mode AS ENUM ('MANUAL', 'SEMIAUTOMATIC', 'AUTOMATIC');
CREATE TYPE public.data_level AS ENUM ('simples', 'completo');
CREATE TYPE public.contact_status AS ENUM ('draft', 'awaiting_approval', 'approved', 'sent', 'failed', 'blocked', 'unsubscribed');
CREATE TYPE public.company_status AS ENUM (
  'encontrada', 'dados_basicos', 'aguardando_aprovacao', 'dados_completos', 
  'qualificada', 'link_criado', 'mensagem_preparada', 'mensagem_aprovada', 
  'mensagem_enviada', 'link_acessado', 'checkout_iniciado', 'pagamento_pendente', 
  'pagamento_confirmado', 'falhou', 'bloqueada', 'descadastrada'
);

-- USER ROLES
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role public.app_role NOT NULL,
    UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER FUNCTION FOR ROLE CHECK
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- ADMIN PROFILES
CREATE TABLE public.admin_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nome TEXT,
    email TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.admin_profiles TO authenticated;
GRANT ALL ON public.admin_profiles TO service_role;
ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can see all profiles" ON public.admin_profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can see own profile" ON public.admin_profiles FOR SELECT TO authenticated USING (auth.uid() = id);

-- AQUICNPJ SETTINGS
CREATE TABLE public.aquicnpj_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    monitor_enabled BOOLEAN DEFAULT false,
    monitor_mode public.monitor_mode DEFAULT 'SEMIAUTOMATIC',
    interval_minutes INTEGER DEFAULT 60,
    use_current_date BOOLEAN DEFAULT true,
    target_date DATE,
    range_query JSONB DEFAULT '{}'::jsonb,
    somente_mei BOOLEAN DEFAULT false,
    excluir_mei BOOLEAN DEFAULT false,
    com_email BOOLEAN DEFAULT true,
    com_contato_telefonico BOOLEAN DEFAULT false,
    somente_matriz BOOLEAN DEFAULT true,
    somente_filial BOOLEAN DEFAULT false,
    remove_contab BOOLEAN DEFAULT true,
    uf JSONB DEFAULT '[]'::jsonb,
    municipio JSONB DEFAULT '[]'::jsonb,
    cnaes JSONB DEFAULT '[]'::jsonb,
    situacao_cadastral JSONB DEFAULT '["02"]'::jsonb,
    page_size INTEGER DEFAULT 50,
    max_pages_per_run INTEGER DEFAULT 5,
    max_new_companies_per_run INTEGER DEFAULT 100,
    max_complete_credits_per_day INTEGER DEFAULT 50,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.aquicnpj_settings TO authenticated;
GRANT ALL ON public.aquicnpj_settings TO service_role;
ALTER TABLE public.aquicnpj_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage settings" ON public.aquicnpj_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- COMPANIES
CREATE TABLE public.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cnpj TEXT UNIQUE NOT NULL,
    razao_social_original TEXT,
    nome_titular_exibicao TEXT,
    nome_fantasia TEXT,
    porte TEXT,
    inicio_atividade DATE,
    situacao_cadastral TEXT,
    situacao_cadastral_desc TEXT,
    situacao_cadastral_data DATE,
    cnae_principal_codigo TEXT,
    cnae_principal_descricao TEXT,
    cnaes_secundarios JSONB DEFAULT '[]'::jsonb,
    tipo_logradouro TEXT,
    logradouro TEXT,
    numero TEXT,
    complemento TEXT,
    bairro TEXT,
    cep TEXT,
    uf TEXT,
    municipio_codigo TEXT,
    municipio_descricao TEXT,
    ddd TEXT,
    telefones JSONB DEFAULT '[]'::jsonb,
    email TEXT,
    possui_email BOOLEAN DEFAULT false,
    possui_telefone BOOLEAN DEFAULT false,
    tipo_telefone TEXT,
    is_mei BOOLEAN DEFAULT false,
    is_simples BOOLEAN DEFAULT false,
    is_matriz BOOLEAN DEFAULT false,
    is_filial BOOLEAN DEFAULT false,
    capital_social NUMERIC(15,2),
    natureza_id TEXT,
    numero_socios INTEGER,
    socios JSONB DEFAULT '[]'::jsonb,
    nivel_dados public.data_level DEFAULT 'simples',
    fonte TEXT,
    first_found_at TIMESTAMPTZ DEFAULT now(),
    last_seen_at TIMESTAMPTZ DEFAULT now(),
    complete_data_fetched_at TIMESTAMPTZ,
    status public.company_status DEFAULT 'encontrada',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.companies TO authenticated;
GRANT SELECT ON public.companies TO anon; -- For public links
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage companies" ON public.companies FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Anyone can see companies via public links" ON public.companies FOR SELECT TO anon USING (true);

-- SYNC RUNS
CREATE TABLE public.sync_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mode public.monitor_mode,
    started_at TIMESTAMPTZ DEFAULT now(),
    finished_at TIMESTAMPTZ,
    status TEXT,
    filters JSONB DEFAULT '{}'::jsonb,
    pages_processed INTEGER DEFAULT 0,
    total_returned INTEGER DEFAULT 0,
    new_companies INTEGER DEFAULT 0,
    updated_companies INTEGER DEFAULT 0,
    duplicates_ignored INTEGER DEFAULT 0,
    complete_queries INTEGER DEFAULT 0,
    credits_before INTEGER,
    credits_after INTEGER,
    duration_ms INTEGER,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sync_runs TO authenticated;
GRANT ALL ON public.sync_runs TO service_role;
ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can see sync runs" ON public.sync_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- COMPANY LINKS
CREATE TABLE public.company_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    public_token TEXT UNIQUE NOT NULL,
    active BOOLEAN DEFAULT true,
    expires_at TIMESTAMPTZ,
    first_access_at TIMESTAMPTZ,
    last_access_at TIMESTAMPTZ,
    access_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.company_links TO authenticated;
GRANT SELECT ON public.company_links TO anon;
GRANT ALL ON public.company_links TO service_role;
ALTER TABLE public.company_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage links" ON public.company_links FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Anyone can read link by token" ON public.company_links FOR SELECT TO anon USING (active = true);

-- SITE SETTINGS
CREATE TABLE public.site_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    logo_url TEXT,
    company_name TEXT DEFAULT 'Central MEI Digital',
    support_email TEXT,
    support_phone TEXT,
    product_name TEXT DEFAULT 'Apoio Digital para MEI',
    product_description TEXT DEFAULT 'Serviço privado de organização e suporte digital para microempreendedores.',
    product_amount NUMERIC(12,2) DEFAULT 97.00,
    private_service_notice TEXT DEFAULT 'Serviço privado e opcional. Não possui vínculo com órgãos públicos.',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.site_settings TO anon, authenticated;
GRANT UPDATE ON public.site_settings TO authenticated;
GRANT ALL ON public.site_settings TO service_role;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can update site settings" ON public.site_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Anyone can read site settings" ON public.site_settings FOR SELECT TO anon, authenticated USING (true);

-- CONTACT QUEUE
CREATE TABLE public.contact_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    company_link_id UUID REFERENCES public.company_links(id) ON DELETE SET NULL,
    recipient_email TEXT,
    subject TEXT,
    message_html TEXT,
    message_text TEXT,
    status public.contact_status DEFAULT 'draft',
    approved_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    provider_message_id TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.contact_queue TO authenticated;
GRANT ALL ON public.contact_queue TO service_role;
ALTER TABLE public.contact_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage queue" ON public.contact_queue FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- SUPPRESSION LIST
CREATE TABLE public.suppression_list (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT,
    cnpj TEXT,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.suppression_list TO authenticated;
GRANT ALL ON public.suppression_list TO service_role;
ALTER TABLE public.suppression_list ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage suppression" ON public.suppression_list FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ORDERS (UPDATING)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS public_link_id UUID REFERENCES public.company_links(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_document TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;

-- API LOGS
CREATE TABLE public.api_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT,
    endpoint TEXT,
    method TEXT,
    status_code INTEGER,
    success BOOLEAN,
    duration_ms INTEGER,
    request_summary JSONB DEFAULT '{}'::jsonb,
    response_summary JSONB DEFAULT '{}'::jsonb,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.api_logs TO authenticated;
GRANT ALL ON public.api_logs TO service_role;
ALTER TABLE public.api_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can see api logs" ON public.api_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- SEED INITIAL SETTINGS
INSERT INTO public.aquicnpj_settings (monitor_enabled) VALUES (false) ON CONFLICT DO NOTHING;
INSERT INTO public.site_settings (company_name) VALUES ('Central MEI Digital') ON CONFLICT DO NOTHING;
