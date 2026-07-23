UPDATE public.company_links
SET public_url = 'https://certificadodigitalccmei.online/c/' || public_token
WHERE public_token IS NOT NULL
  AND (
    public_url IS NULL
    OR public_url !~ '^https?://[^/]+/'
    OR public_url ~* 'lovable\.app|localhost|127\.0\.0\.1|seu-certificado-mei-digital\.online'
  );

UPDATE public.company_links
SET checkout_url = 'https://certificadodigitalccmei.online/checkout/' || public_token
WHERE public_token IS NOT NULL
  AND (
    checkout_url IS NULL
    OR checkout_url !~ '^https?://[^/]+/'
    OR checkout_url ~* 'lovable\.app|localhost|127\.0\.0\.1|seu-certificado-mei-digital\.online'
  );