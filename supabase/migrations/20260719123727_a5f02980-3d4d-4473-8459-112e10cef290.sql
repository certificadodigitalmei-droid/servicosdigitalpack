
-- Tighten RLS: admin-only access on companies/company_links/link_generations
DROP POLICY IF EXISTS "Authenticated users can manage companies" ON public.companies;
DROP POLICY IF EXISTS "Authenticated users can manage company links" ON public.company_links;
DROP POLICY IF EXISTS "Authenticated users can manage generations" ON public.link_generations;

CREATE POLICY "Admins manage companies"
  ON public.companies FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage company_links"
  ON public.company_links FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage link_generations"
  ON public.link_generations FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

-- Extended resolver returning full data for public pages/checkout
DROP FUNCTION IF EXISTS public.resolve_company_link(text);

CREATE OR REPLACE FUNCTION public.resolve_company_link(_token text)
RETURNS TABLE(
  cnpj text,
  nome text,
  razao_social text,
  nome_fantasia text,
  abertura date,
  email text,
  telefone text,
  uf text,
  municipio text,
  situacao text,
  natureza_juridica text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.cnpj,
    COALESCE(c.nome_titular_exibicao, c.razao_social_original) AS nome,
    c.razao_social_original AS razao_social,
    c.nome_fantasia,
    c.inicio_atividade AS abertura,
    c.email,
    COALESCE(
      NULLIF(c.telefones->0->>'numero', ''),
      c.ddd
    ) AS telefone,
    c.uf,
    c.municipio_descricao AS municipio,
    c.situacao_cadastral_desc AS situacao,
    c.natureza_id AS natureza_juridica
  FROM public.company_links l
  JOIN public.companies c ON c.id = l.company_id
  WHERE l.public_token = _token
    AND l.active = true
    AND (l.expires_at IS NULL OR l.expires_at > now())
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.resolve_company_link(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_company_link(text) TO anon, authenticated;
