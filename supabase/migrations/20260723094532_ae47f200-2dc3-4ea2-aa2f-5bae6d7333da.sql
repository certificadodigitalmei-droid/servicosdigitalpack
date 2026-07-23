
CREATE TABLE IF NOT EXISTS public.site_popup_settings (
  id INT PRIMARY KEY DEFAULT 1,
  enabled BOOLEAN NOT NULL DEFAULT true,
  badge_text TEXT NOT NULL DEFAULT 'COMUNICADO',
  title TEXT NOT NULL DEFAULT 'Seu CNPJ foi Aberto ou Atualizado Recentemente no Nosso Banco de Dados',
  highlight_text TEXT NOT NULL DEFAULT 'Porém encontra-se pendente Certificado Digital',
  law_title TEXT NOT NULL DEFAULT 'QUE É OBRIGATÓRIO POR LEI',
  law_text TEXT NOT NULL DEFAULT 'Conforme determinação da Receita Federal, todas as empresas devem possuir um Certificado Digital ativo.',
  provider_text TEXT NOT NULL DEFAULT 'Emita direto conosco por empresas parceiras credenciadas pelo ICP-Brasil e pela AC INCP SP.',
  risks_title TEXT NOT NULL DEFAULT 'Sua empresa pode sofrer caso fique pendente:',
  risks JSONB NOT NULL DEFAULT '["Não consegue emitir Nota Fiscal Eletrônica (NF-e)","Fica impedida de assinar contratos digitais","Sujeita a multas e penalidades da Receita Federal","Bloqueio em licitações e contratos públicos","Restrição no acesso a crédito e financiamentos"]'::jsonb,
  price_main TEXT NOT NULL DEFAULT 'R$ 97,00',
  price_main_label TEXT NOT NULL DEFAULT 'Valor único',
  price_main_note TEXT NOT NULL DEFAULT 'equivalente a 12 meses',
  price_installment TEXT NOT NULL DEFAULT 'R$ 8,08',
  price_installment_label TEXT NOT NULL DEFAULT 'Isso dá apenas',
  price_installment_note TEXT NOT NULL DEFAULT 'por mês',
  validity_title TEXT NOT NULL DEFAULT 'Validade de 12 meses',
  validity_subtitle TEXT NOT NULL DEFAULT '100% seguro e dentro da lei',
  footer_items JSONB NOT NULL DEFAULT '[{"icon":"lock","text":"Processo 100% online e seguro"},{"icon":"key","text":"Credenciados pelo ICP-Brasil e AC INCP SP"},{"icon":"headset","text":"Suporte especializado em todo o processo"}]'::jsonb,
  continue_button_text TEXT NOT NULL DEFAULT 'Continuar para emissão',
  cancel_button_text TEXT NOT NULL DEFAULT 'Voltar',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT site_popup_settings_singleton CHECK (id = 1)
);

GRANT SELECT ON public.site_popup_settings TO anon, authenticated;
GRANT ALL ON public.site_popup_settings TO service_role;

ALTER TABLE public.site_popup_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read popup" ON public.site_popup_settings;
CREATE POLICY "public read popup" ON public.site_popup_settings FOR SELECT USING (true);

INSERT INTO public.site_popup_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
