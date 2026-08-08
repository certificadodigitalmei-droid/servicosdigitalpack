CREATE OR REPLACE FUNCTION public.resolve_company_link(_token text)
 RETURNS TABLE(cnpj text, nome text, razao_social text, nome_fantasia text, abertura date, email text, telefone text, uf text, municipio text, situacao text, natureza_juridica text, amount_cents integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    c.cnpj,
    COALESCE(c.nome_titular_exibicao, c.razao_social_original) AS nome,
    c.razao_social_original AS razao_social,
    c.nome_fantasia,
    c.inicio_atividade AS abertura,
    c.email,
    COALESCE(NULLIF(c.telefones->0->>'numero', ''), c.ddd) AS telefone,
    c.uf,
    c.municipio_descricao AS municipio,
    c.situacao_cadastral_desc AS situacao,
    c.natureza_id AS natureza_juridica,
    l.amount_cents
  FROM public.company_links l
  JOIN public.companies c ON c.id = l.company_id
  WHERE (l.public_token = _token OR (length(_token) >= 8 AND l.public_token LIKE _token || '%'))
    AND l.active = true
    AND (l.expires_at IS NULL OR l.expires_at > now())
  LIMIT 1;
$function$;