import { DEFAULT_DESIGN, type CampaignDesign } from './template';

/**
 * Modelos de campanha para rotação no envio em massa.
 *
 * Mesma mensagem do modelo principal (CNPJ sem Certificado Digital ativo),
 * porém com redação diferente em cada modelo e paleta NEUTRA — sem vermelho
 * de alarme, que é um dos gatilhos de spam. Layout idêntico ao principal.
 */
export type CampaignVariant = {
  id: string;
  name: string;
  description: string;
  accent: string;
  subject: string;
  preheader: string;
  design: CampaignDesign;
};

const base = DEFAULT_DESIGN;

/** Paletas neutras aprovadas (sem vermelho). */
const NEUTRAL = {
  azul: {
    headerBg: '#0e3a70',
    heroTitleColor: '#0e3a70',
    buttonBg: '#1a4a8a',
    govBarBg: '#e8eef7',
    govBarColor: '#0e3a70',
    warningBg: '#eff6ff',
    warningBorder: '#1d4ed8',
    warningTitleColor: '#1e3a8a',
    warningTextColor: '#1d4ed8',
  },
  grafite: {
    headerBg: '#1f2937',
    heroTitleColor: '#1f2937',
    buttonBg: '#0f172a',
    govBarBg: '#f1f5f9',
    govBarColor: '#334155',
    warningBg: '#f8fafc',
    warningBorder: '#64748b',
    warningTitleColor: '#1f2937',
    warningTextColor: '#475569',
  },
  ambar: {
    headerBg: '#78350f',
    heroTitleColor: '#92400e',
    buttonBg: '#b45309',
    govBarBg: '#fef3c7',
    govBarColor: '#78350f',
    warningBg: '#fffbeb',
    warningBorder: '#d97706',
    warningTitleColor: '#92400e',
    warningTextColor: '#78350f',
  },
  teal: {
    headerBg: '#134e4a',
    heroTitleColor: '#0f766e',
    buttonBg: '#0f766e',
    govBarBg: '#ccfbf1',
    govBarColor: '#134e4a',
    warningBg: '#f0fdfa',
    warningBorder: '#14b8a6',
    warningTitleColor: '#115e59',
    warningTextColor: '#0f766e',
  },
  verde: {
    headerBg: '#14532d',
    heroTitleColor: '#15803d',
    buttonBg: '#15803d',
    govBarBg: '#ecfdf5',
    govBarColor: '#14532d',
    warningBg: '#f0fdf4',
    warningBorder: '#16a34a',
    warningTitleColor: '#166534',
    warningTextColor: '#15803d',
  },
  indigo: {
    headerBg: '#312e81',
    heroTitleColor: '#3730a3',
    buttonBg: '#4338ca',
    govBarBg: '#eef2ff',
    govBarColor: '#312e81',
    warningBg: '#eef2ff',
    warningBorder: '#6366f1',
    warningTitleColor: '#3730a3',
    warningTextColor: '#4338ca',
  },
} as const;

export const CAMPAIGN_VARIANTS: CampaignVariant[] = [
  {
    id: 'azul-cadastral',
    name: 'Redação 1 — Azul institucional',
    description: 'Mesma mensagem, redação direta. Alerta em azul, sem vermelho.',
    accent: NEUTRAL.azul.headerBg,
    subject: 'Pendência no CNPJ {{CNPJ}} — Certificado Digital',
    preheader: 'Seu CNPJ está sem Certificado Digital ativo.',
    design: {
      ...base,
      ...NEUTRAL.azul,
      govBarText: 'CENTRAL DE EMISSÃO · PROTOCOLO {{REFERENCIA}}',
      title: 'CNPJ pendente — Certificado não ativo',
      subtitle: 'Central de Emissão · MEI',
      heroTitle: 'Certificado Digital pendente',
      intro:
        'Prezado(a) *{{NOME_TITULAR}}*,\n\nO CNPJ *{{CNPJ}}* consta como *pendente*: não há Certificado Digital ativo vinculado.\n\nConfira abaixo a situação do cadastro:',
      warningTitle: 'Pontos que dependem do certificado ativo',
      warningItems:
        'Emissão de nota fiscal (NFS-e) indisponível.\nAssinatura de contratos digitais em nome do CNPJ indisponível.\nLimites de crédito empresarial em bancos e financeiras PJ limitados.\nExigências da Receita Federal em aberto.',
      buttonLabel: 'REGULARIZAR MEU CNPJ',
      statusValue: 'PENDENTE',
      statusNote: 'Certificado e-CNPJ não localizado.',
    },
  },
  {
    id: 'verde-conformidade',
    name: 'Redação 2 — Verde conformidade',
    description: 'Mesma mensagem em tom de comunicado formal. Paleta verde.',
    accent: NEUTRAL.verde.headerBg,
    subject: 'Comunicado: certificado do CNPJ {{CNPJ}} não localizado',
    preheader: 'Comunicado sobre a situação do seu cadastro MEI.',
    design: {
      ...base,
      ...NEUTRAL.verde,
      govBarText: 'ACOMPANHAMENTO CADASTRAL · {{REFERENCIA}}',
      title: 'Comunicado de pendência cadastral',
      subtitle: 'Referência {{REFERENCIA}}',
      heroTitle: 'Certificado Digital não localizado',
      intro:
        'Prezado(a) *{{NOME_TITULAR}}*,\n\nComunicamos que, na verificação do CNPJ *{{CNPJ}}*, não foi localizado Certificado Digital ativo vinculado à empresa.\n\nAbaixo estão os dados do cadastro:',
      warningTitle: 'O que fica limitado enquanto a pendência existir',
      warningItems:
        'Não é possível emitir nota fiscal (NFS-e).\nNão é possível assinar contratos digitais em nome do CNPJ.\nAnálises de crédito empresarial podem ser prejudicadas.\nObrigações junto à Receita Federal seguem em aberto.',
      buttonLabel: 'REGULARIZAR AGORA MEU CNPJ',
      statusValue: 'PENDENTE',
      statusNote: 'Certificado digital não identificado.',
    },
  },
  {
    id: 'grafite-relatorio',
    name: 'Redação 3 — Grafite relatório',
    description: 'Mesma mensagem no formato de resultado de consulta. Tons grafite.',
    accent: NEUTRAL.grafite.headerBg,
    subject: 'Resultado da consulta {{REFERENCIA}} — CNPJ {{CNPJ}}',
    preheader: 'Resultado da verificação do seu CNPJ.',
    design: {
      ...base,
      ...NEUTRAL.grafite,
      cardBg: '#f8fafc',
      govBarText: 'RELATÓRIO CADASTRAL · {{REFERENCIA}}',
      title: 'Resultado da consulta cadastral',
      subtitle: 'Consulta nº {{REFERENCIA}}',
      heroTitle: 'Resumo da verificação',
      intro:
        '*{{NOME_TITULAR}}*, o resultado da consulta ao CNPJ *{{CNPJ}}* já está disponível.\n\nSituação: *pendente*, por ausência de Certificado Digital ativo.\n\nVeja os dados apurados:',
      warningTitle: 'Observações da verificação',
      warningItems:
        'Certificado e-CNPJ não localizado.\nEmissão de NFS-e indisponível sem o certificado.\nAssinaturas digitais em nome da empresa bloqueadas.\nRecomenda-se regularizar o quanto antes.',
      buttonLabel: 'REGULARIZAR MEU CNPJ',
      statusValue: 'PENDENTE',
      statusNote: 'Item pendente identificado na consulta.',
    },
  },
  {
    id: 'ambar-reputacao',
    name: 'Redação 4 — Âmbar reputação',
    description: 'Mesma mensagem com foco em reputação cadastral. Destaque âmbar.',
    accent: NEUTRAL.ambar.headerBg,
    subject: 'Um ponto em aberto no cadastro do seu CNPJ',
    preheader: 'A ausência do certificado afeta a reputação cadastral.',
    design: {
      ...base,
      ...NEUTRAL.ambar,
      govBarText: 'MONITORAMENTO CADASTRAL · {{REFERENCIA}}',
      title: 'Ponto em aberto no cadastro do MEI',
      subtitle: 'Protocolo {{REFERENCIA}}',
      heroTitle: 'Um ponto em aberto no seu cadastro',
      intro:
        'Prezado(a) *{{NOME_TITULAR}}*,\n\nO acompanhamento do CNPJ *{{CNPJ}}* apontou ausência de Certificado Digital ativo — item que entra na avaliação da reputação cadastral da empresa.\n\nVeja o detalhamento abaixo:',
      warningTitle: 'Impactos enquanto a pendência continuar',
      warningItems:
        'Cadastro considerado incompleto por parceiros e instituições.\nEmissão de nota fiscal (NFS-e) indisponível.\nContratos digitais em nome do CNPJ não podem ser assinados.\nAnálises de crédito PJ podem ser prejudicadas.',
      buttonLabel: 'QUERO REGULARIZAR MEU CNPJ',
      statusValue: 'PENDENTE',
      statusNote: 'Certificado digital ausente.',
    },
  },
  {
    id: 'clean-minimal',
    name: 'Redação 5 — Clean simples',
    description: 'Mesma mensagem em linguagem simples e direta. Visual limpo.',
    accent: NEUTRAL.indigo.headerBg,
    subject: 'Seu CNPJ está sem Certificado Digital ativo',
    preheader: 'Leva poucos minutos para verificar a situação.',
    design: {
      ...base,
      ...NEUTRAL.indigo,
      showGovBar: false,
      cardBg: '#f8fafc',
      title: 'Certificado Digital MEI',
      subtitle: 'Consulta {{REFERENCIA}}',
      heroTitle: 'Seu CNPJ está sem certificado ativo',
      heroTitleSize: 22,
      intro:
        'Prezado(a) *{{NOME_TITULAR}}*,\n\nAo verificar o CNPJ *{{CNPJ}}*, não encontramos um Certificado Digital ativo vinculado à empresa.\n\nVocê pode conferir a situação completa em poucos segundos:',
      warningTitle: 'Por que isso importa',
      warningItems:
        'Sem o certificado, você não emite nota fiscal (NFS-e).\nContratos digitais em nome do CNPJ não podem ser assinados.\nO cadastro segue incompleto em consultas de terceiros.',
      buttonLabel: 'REGULARIZAR MEU CNPJ',
      statusValue: 'PENDENTE',
      statusNote: 'Certificado e-CNPJ não localizado.',
    },
  },
  {
    id: 'teal-atualizacao',
    name: 'Redação 6 — Teal atualização',
    description: 'Mesma mensagem escrita como atualização de cadastro. Paleta teal.',
    accent: NEUTRAL.teal.headerBg,
    subject: 'Atualização do cadastro do CNPJ {{CNPJ}}',
    preheader: 'Falta apenas o Certificado Digital ativo.',
    design: {
      ...base,
      ...NEUTRAL.teal,
      govBarText: 'ATUALIZAÇÃO CADASTRAL · {{REFERENCIA}}',
      title: 'Atualização de cadastro — MEI',
      subtitle: 'Referência {{REFERENCIA}}',
      heroTitle: 'Falta apenas o Certificado Digital',
      intro:
        'Prezado(a) *{{NOME_TITULAR}}*,\n\nO cadastro do CNPJ *{{CNPJ}}* está quase completo: falta apenas o Certificado Digital ativo, e por isso ele segue como *pendente*.\n\nVeja o que consta hoje na consulta:',
      warningTitle: 'O que ainda está pendente',
      warningItems:
        'Certificado digital e-CNPJ não vinculado.\nEmissão de nota fiscal (NFS-e) indisponível.\nAssinatura digital com validade jurídica indisponível.\nCadastro exibido como incompleto em consultas.',
      buttonLabel: 'REGULARIZAR MEU CNPJ',
      statusValue: 'PENDENTE',
      statusNote: 'Falta o Certificado Digital ativo.',
    },
  },
];

export function getVariant(id: string): CampaignVariant | undefined {
  return CAMPAIGN_VARIANTS.find((v) => v.id === id);
}

/** Escolhe o modelo da rotação de forma estável por destinatário. */
export function pickVariant(activeIds: string[], seed: string): CampaignVariant | null {
  const pool = activeIds.map(getVariant).filter(Boolean) as CampaignVariant[];
  if (pool.length === 0) return null;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return pool[h % pool.length];
}
