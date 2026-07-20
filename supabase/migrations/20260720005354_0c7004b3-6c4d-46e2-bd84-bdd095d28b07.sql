-- Migration: GemMail Integration Schema
-- Description: Add fields for GemMail integration to campaigns and recipients tables.

-- 1. Update email_campaigns table
ALTER TABLE public.email_campaigns 
ADD COLUMN IF NOT EXISTS gemmail_list_id text,
ADD COLUMN IF NOT EXISTS gemmail_campaign_id text,
ADD COLUMN IF NOT EXISTS gemmail_template_id text,
ADD COLUMN IF NOT EXISTS provider_status text DEFAULT 'draft',
ADD COLUMN IF NOT EXISTS provider_error text,
ADD COLUMN IF NOT EXISTS synced_at timestamptz,
ADD COLUMN IF NOT EXISTS sent_at timestamptz;

-- 2. Update email_campaign_recipients table
ALTER TABLE public.email_campaign_recipients
ADD COLUMN IF NOT EXISTS gemmail_subscriber_id text,
ADD COLUMN IF NOT EXISTS provider_message_id text,
ADD COLUMN IF NOT EXISTS provider_status text,
ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
ADD COLUMN IF NOT EXISTS opened_at timestamptz,
ADD COLUMN IF NOT EXISTS clicked_at timestamptz,
ADD COLUMN IF NOT EXISTS unsubscribed_at timestamptz,
ADD COLUMN IF NOT EXISTS bounced_at timestamptz;

-- 3. Create a settings table for sending limits and provider info
CREATE TABLE IF NOT EXISTS public.email_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    monthly_limit integer DEFAULT 12000,
    hourly_limit integer DEFAULT 50,
    batch_size integer DEFAULT 50,
    delay_between_batches integer DEFAULT 3600,
    maximum_recipients_per_campaign integer DEFAULT 1000,
    from_name text DEFAULT 'Central de Atendimento',
    from_email text DEFAULT 'certificado.mei.estadual@seu-certificado-mei-digital.online',
    reply_to text DEFAULT 'certificado.mei.estadual@seu-certificado-mei-digital.online',
    sending_domain text DEFAULT 'seu-certificado-mei-digital.online',
    company_name text,
    company_address text,
    company_phone text,
    footer_text text,
    updated_at timestamptz DEFAULT now()
);

-- 4. Grant access to email_settings
GRANT SELECT, UPDATE ON public.email_settings TO authenticated;
GRANT ALL ON public.email_settings TO service_role;

-- 5. Enable RLS on email_settings
ALTER TABLE public.email_settings ENABLE ROW LEVEL SECURITY;

-- 6. Policy for administrators to manage settings
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'email_settings' AND policyname = 'Admins can manage email settings'
    ) THEN
        CREATE POLICY "Admins can manage email settings" ON public.email_settings
        FOR ALL TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.user_roles 
                WHERE user_id = auth.uid() 
                AND role = 'admin'::public.app_role
            )
        );
    END IF;
END
$$;

-- 7. Seed initial settings if table is empty
INSERT INTO public.email_settings (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM public.email_settings);
