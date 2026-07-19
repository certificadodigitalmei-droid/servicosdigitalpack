-- Criar tabela de campanhas de e-mail
CREATE TABLE IF NOT EXISTS public.email_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    subject_template TEXT,
    preheader_template TEXT,
    html_template TEXT,
    text_template TEXT,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'scheduled', 'sending', 'paused', 'completed', 'failed')),
    source_file_name TEXT,
    total_rows INTEGER DEFAULT 0,
    valid_recipients INTEGER DEFAULT 0,
    invalid_recipients INTEGER DEFAULT 0,
    provider TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_campaigns TO authenticated;
GRANT ALL ON public.email_campaigns TO service_role;
ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage campaigns" ON public.email_campaigns
    FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Criar tabela de destinatários
CREATE TABLE IF NOT EXISTS public.email_campaign_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    company_name TEXT,
    cnpj TEXT,
    public_link TEXT,
    checkout_link TEXT,
    reference_code TEXT UNIQUE,
    personalized_subject TEXT,
    personalized_html TEXT,
    personalized_text TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'blocked', 'invalid', 'sent', 'failed', 'unsubscribed')),
    error_message TEXT,
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_campaign_recipients TO authenticated;
GRANT ALL ON public.email_campaign_recipients TO service_role;
ALTER TABLE public.email_campaign_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage recipients" ON public.email_campaign_recipients
    FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Criar tabela de supressão (se não existir, criar)
CREATE TABLE IF NOT EXISTS public.suppression_list (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    cnpj TEXT,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppression_list TO authenticated;
GRANT ALL ON public.suppression_list TO service_role;
ALTER TABLE public.suppression_list ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage suppression list" ON public.suppression_list
    FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
