
CREATE TABLE IF NOT EXISTS public.email_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    subject_template TEXT,
    preheader_template TEXT,
    html_template TEXT,
    text_template TEXT,
    design_json JSONB,
    from_name TEXT,
    from_email TEXT,
    reply_to TEXT,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft','ready','scheduled','sending','paused','completed','failed')),
    source_file_name TEXT,
    total_rows INTEGER DEFAULT 0,
    valid_recipients INTEGER DEFAULT 0,
    invalid_recipients INTEGER DEFAULT 0,
    provider TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_campaigns TO authenticated;
GRANT ALL ON public.email_campaigns TO service_role;
ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth manage campaigns" ON public.email_campaigns FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.email_campaign_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    company_name TEXT,
    razao_social TEXT,
    nome_titular TEXT,
    cnpj TEXT,
    data_abertura TEXT,
    data_situacao TEXT,
    situacao TEXT,
    municipio TEXT,
    uf TEXT,
    public_link TEXT,
    checkout_link TEXT,
    token TEXT,
    reference_code TEXT,
    row_data JSONB DEFAULT '{}'::jsonb,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending','ready','blocked','invalid','sent','failed','unsubscribed')),
    error_message TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_campaign_recipients TO authenticated;
GRANT ALL ON public.email_campaign_recipients TO service_role;
ALTER TABLE public.email_campaign_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth manage recipients" ON public.email_campaign_recipients FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS ecr_campaign_idx ON public.email_campaign_recipients(campaign_id);
CREATE UNIQUE INDEX IF NOT EXISTS ecr_campaign_email_uidx ON public.email_campaign_recipients(campaign_id, email);
