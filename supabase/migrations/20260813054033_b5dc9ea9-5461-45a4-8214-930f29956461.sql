ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS public_base_url text;
UPDATE public.site_settings SET public_base_url = 'https://digitalcertificaa1mei.online' WHERE public_base_url IS NULL;