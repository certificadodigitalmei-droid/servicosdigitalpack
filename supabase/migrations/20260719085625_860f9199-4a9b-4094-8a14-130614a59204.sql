
-- 1) Security-definer resolver for public token flow
CREATE OR REPLACE FUNCTION public.resolve_company_link(_token text)
RETURNS TABLE(cnpj text, nome text, abertura date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.cnpj, c.nome_titular_exibicao, c.inicio_atividade
  FROM public.company_links l
  JOIN public.companies c ON c.id = l.company_id
  WHERE l.public_token = _token
    AND l.active = true
    AND (l.expires_at IS NULL OR l.expires_at > now())
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.resolve_company_link(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_company_link(text) TO anon, authenticated;

-- 2) Drop overly broad anon SELECT policies
DROP POLICY IF EXISTS "Companies visible only via active link" ON public.companies;
DROP POLICY IF EXISTS "Active links readable by token lookup" ON public.company_links;

-- Revoke direct table SELECT from anon (admin policies still apply for authenticated admins)
REVOKE SELECT ON public.companies FROM anon;
REVOKE SELECT ON public.company_links FROM anon;

-- 3) Storage: restrict public read to a specific 'public/' path prefix
DROP POLICY IF EXISTS "Anyone can see assets" ON storage.objects;

CREATE POLICY "Public site assets readable"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'site-assets'
  AND (storage.foldername(name))[1] = 'public'
);
