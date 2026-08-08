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

/** Paletas em tons de azul — variam entre azul escuro, royal, índigo,
 *  petróleo e acinzentado, sempre dentro da família azul. */
const BLUE_PALETTES = {
  azulEscuro: {
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
  azulRoyal: {
    headerBg: '#1e40af',
    heroTitleColor: '#1e40af',
    buttonBg: '#2563eb',
    govBarBg: '#dbeafe',
    govBarColor: '#1e40af',
    warningBg: '#eff6ff',
    warningBorder: '#3b82f6',
    warningTitleColor: '#1e3a8a',
    warningTextColor: '#2563eb',
  },
  azulPetroleo: {
    headerBg: '#164e63',
    heroTitleColor: '#155e75',
    buttonBg: '#0e7490',
    govBarBg: '#cffafe',
    govBarColor: '#164e63',
    warningBg: '#ecfeff',
    warningBorder: '#06b6d4',
    warningTitleColor: '#155e75',
    warningTextColor: '#0891b2',
  },
  azulAcinzentado: {
    headerBg: '#334155',
    heroTitleColor: '#475569',
    buttonBg: '#3b82f6',
    govBarBg: '#f1f5f9',
    govBarColor: '#334155',
    warningBg: '#f8fafc',
    warningBorder: '#60a5fa',
    warningTitleColor: '#334155',
    warningTextColor: '#3b82f6',
  },
  azulSlate: {
    headerBg: '#1e3a8a',
    heroTitleColor: '#1e3a8a',
    buttonBg: '#2563eb',
    govBarBg: '#dbeafe',
    govBarColor: '#1e3a8a',
    warningBg: '#eff6ff',
    warningBorder: '#60a5fa',
    warningTitleColor: '#1e3a8a',
    warningTextColor: '#2563eb',
  },
  azulIndigo: {
    headerBg: '#312e81',
    heroTitleColor: '#3730a3',
    buttonBg: '#4f46e5',
    govBarBg: '#e0e7ff',
    govBarColor: '#312e81',
    warningBg: '#eef2ff',
    warningBorder: '#818cf8',
    warningTitleColor: '#3730a3',
    warningTextColor: '#4f46e5',
  },
  azulAlerta: {
    headerBg: '#1e3a8a',
    heroTitleColor: '#1e3a8a',
    buttonBg: '#1e40af',
    govBarBg: '#dbeafe',
    govBarColor: '#1e3a8a',
    warningBg: '#fffbeb',
    warningBorder: '#d97706',
    warningTitleColor: '#92400e',
    warningTextColor: '#78350f',
  },
} as const;

export const CAMPAIGN_VARIANTS: CampaignVariant[] = [
  {
    id: 'azul-alerta',
    name: 'Alerta — Riscos ativos no CNPJ',
    description: 'Tom de alerta institucional. Destaca riscos sem cair em spam.',
    accent: BLUE_PALETTES.azulAlerta.headerBg,
    subject: 'Riscos ativos no CNPJ {{CNPJ}} — regularize agora',
    preheader: 'Seu CNPJ está sem Certificado Digital ativo e pode ter operações limitadas.',
    design: {
      ...base,
      ...BLUE_PALETTES.azulAlerta,
      govBarText: 'ALERTA CADASTRAL · PROTOCOLO {{REFERENCIA}}',
      title: 'Riscos ativos no seu CNPJ',
      subtitle: 'Central de Emissão · MEI',
      heroTitle: 'Sua empresa pode estar impedida de operar regularmente',
      intro:
        'Prezado(a) *{{NOME_TITULAR}}*,\n\nIdentificamos que o CNPJ *{{CNPJ}}* está *sem Certificado Digital ativo*. Essa pendência pode limitar operações importantes do seu negócio.\n\nVeja abaixo o que está em risco enquanto a situação não for regularizada:',
      warningTitle: 'O que pode estar comprometido no seu CNPJ',
      warningItems:
        'Emissão de nota fiscal (NFS-e) pode ficar indisponível.\nAssinatura de contratos digitais com validade jurídica pode ser bloqueada.\nAcesso a linhas de crédito empresarial pode ser limitado por bancos.\nO cadastro pode ser considerado incompleto em consultas oficiais.',
      buttonLabel: 'REGULARIZAR MEU CNPJ AGORA',
      statusValue: 'PENDENTE',
      statusNote: 'Certificado e-CNPJ não localizado. Regularização recomendada.',
    },
  },
  {
    id: 'azul-cadastral',
    name: 'Redação 1 — Azul institucional',
    description: 'Mesma mensagem, redação direta. Cabeçalho azul escuro.',
    accent: BLUE_PALETTES.azulEscuro.headerBg,
    subject: 'Pendência no CNPJ {{CNPJ}} — Certificado Digital',
    preheader: 'Seu CNPJ está sem Certificado Digital ativo.',
    design: {
      ...base,
      ...BLUE_PALETTES.azulEscuro,
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
    id: 'azul-royal',
    name: 'Redação 2 — Azul royal',
    description: 'Mesma mensagem em tom de comunicado formal. Cabeçalho azul royal.',
    accent: BLUE_PALETTES.azulRoyal.headerBg,
    subject: 'Comunicado: certificado do CNPJ {{CNPJ}} não localizado',
    preheader: 'Comunicado sobre a situação do seu cadastro MEI.',
    design: {
      ...base,
      ...BLUE_PALETTES.azulRoyal,
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
    id: 'azul-relatorio',
    name: 'Redação 3 — Azul acinzentado',
    description: 'Mesma mensagem no formato de resultado de consulta. Azul acinzentado.',
    accent: BLUE_PALETTES.azulAcinzentado.headerBg,
    subject: 'Resultado da consulta {{REFERENCIA}} — CNPJ {{CNPJ}}',
    preheader: 'Resultado da verificação do seu CNPJ.',
    design: {
      ...base,
      ...BLUE_PALETTES.azulAcinzentado,
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
    id: 'azul-reputacao',
    name: 'Redação 4 — Azul petróleo',
    description: 'Mesma mensagem com foco em reputação cadastral. Azul petróleo.',
    accent: BLUE_PALETTES.azulPetroleo.headerBg,
    subject: 'Um ponto em aberto no cadastro do seu CNPJ',
    preheader: 'A ausência do certificado afeta a reputação cadastral.',
    design: {
      ...base,
      ...BLUE_PALETTES.azulPetroleo,
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
    id: 'azul-slate',
    name: 'Redação 5 — Azul slate',
    description: 'Mesma mensagem em linguagem simples e direta. Azul slate.',
    accent: BLUE_PALETTES.azulSlate.headerBg,
    subject: 'Seu CNPJ está sem Certificado Digital ativo',
    preheader: 'Leva poucos minutos para verificar a situação.',
    design: {
      ...base,
      ...BLUE_PALETTES.azulSlate,
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
    id: 'azul-indigo',
    name: 'Redação 6 — Azul índigo',
    description: 'Mesma mensagem escrita como atualização de cadastro. Azul índigo.',
    accent: BLUE_PALETTES.azulIndigo.headerBg,
    subject: 'Atualização do cadastro do CNPJ {{CNPJ}}',
    preheader: 'Falta apenas o Certificado Digital ativo.',
    design: {
      ...base,
      ...BLUE_PALETTES.azulIndigo,
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
