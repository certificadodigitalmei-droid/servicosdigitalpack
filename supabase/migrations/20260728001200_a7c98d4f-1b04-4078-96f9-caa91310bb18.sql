INSERT INTO public.company_links (public_token, active, amount_cents, company_data, status, data_quality_status, is_test_record, public_url)
VALUES (
  'teste10reais',
  true,
  1000,
  jsonb_build_object(
    'cnpj', '00000000000000',
    'nome', 'Empresa Teste 10 Reais',
    'razao_social', 'EMPRESA TESTE LTDA',
    'nome_fantasia', 'Teste',
    'email', 'teste@teste.com',
    'uf', 'SP',
    'municipio', 'São Paulo',
    'situacao', 'ATIVA'
  ),
  'ativo',
  'complete',
  true,
  'https://certificadodigitalccmei.online/c/teste10reais'
);