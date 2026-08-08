import { DEFAULT_DESIGN, type CampaignDesign } from './template';

/**
 * Modelos de campanha prontos para rotação no envio em massa.
 *
 * Todos seguem boas práticas anti-spam:
 * - assunto informativo (sem caixa alta agressiva, sem "URGENTE"/"RESTRIÇÃO")
 * - paleta sóbria (azul, verde, âmbar, grafite) — sem vermelho de alarme
 * - aviso focado em situação cadastral / reputação, sem ameaça
 * - um único link, rodapé com identificação e descadastro
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

const commonFooter = {
  showFooter: true,
  disclaimer:
    'Portal Certificado Digital MEI — serviço privado de apoio ao microempreendedor.\nVocê recebeu este aviso porque o CNPJ {{CNPJ}} consta em nossa base pública de acompanhamento.',
  unsubText: 'Não desejo mais receber estes avisos',
  unsubHref: '{{LINK_PUBLICO}}?unsub=1',
  showBadges: true,
};

export const CAMPAIGN_VARIANTS: CampaignVariant[] = [
  {
    id: 'azul-cadastral',
    name: 'Azul Cadastral',
    description: 'Tom institucional azul, aviso em âmbar e foco na verificação do cadastro.',
    accent: '#0e3a70',
    subject: 'Situação cadastral do CNPJ {{CNPJ}}',
    preheader: 'Consulte a situação do certificado digital vinculado ao seu CNPJ.',
    design: {
      ...base,
      ...commonFooter,
      showGovBar: true,
      govBarBg: '#e8eef7',
      govBarColor: '#0e3a70',
      govBarText: 'CENTRAL DE ACOMPANHAMENTO MEI · PROTOCOLO {{REFERENCIA}}',
      headerBg: '#0e3a70',
      headerText: '#ffffff',
      title: 'Verificação de cadastro do MEI',
      subtitle: 'Consulta nº {{REFERENCIA}}',
      showHero: true,
      heroTitle: 'Confira a situação do seu CNPJ',
      heroTitleColor: '#0e3a70',
      intro:
        'Olá, *{{NOME_TITULAR}}*.\n\nEm nossa verificação, o CNPJ *{{CNPJ}}* aparece sem certificado digital ativo vinculado.\n\nIsso pode afetar a reputação cadastral da sua empresa. Confira os dados abaixo e acompanhe a situação:',
      showCard: true,
      cardTitle: 'DADOS DO CADASTRO',
      showWarning: true,
      warningTitle: 'Pontos que dependem do certificado ativo',
      warningItems:
        'Emissão de nota fiscal de serviço (NFS-e).\nAssinatura digital de contratos em nome do CNPJ.\nAnálise de crédito empresarial em bancos e financeiras.\nAtendimento a exigências da Receita Federal.',
      warningBg: '#fffbeb',
      warningBorder: '#f59e0b',
      warningTitleColor: '#92400e',
      warningTextColor: '#78350f',
      buttonBg: '#1a4a8a',
      buttonLabel: 'Consultar situação do meu CNPJ',
      badgesText: 'Conexão segura SSL · LGPD · Consulta gratuita',
      showStatusBar: true,
      statusLabel: 'SITUAÇÃO DO CADASTRO',
      statusValue: 'PENDENTE DE VERIFICAÇÃO',
      statusNote: 'Certificado e-CNPJ não localizado na consulta.',
    },
  },
  {
    id: 'verde-conformidade',
    name: 'Verde Conformidade',
    description: 'Paleta verde de conformidade, linguagem calma e orientativa.',
    accent: '#15803d',
    subject: 'Consulta de conformidade do seu MEI',
    preheader: 'Um ponto do seu cadastro precisa de atenção.',
    design: {
      ...base,
      ...commonFooter,
      showGovBar: true,
      govBarBg: '#ecfdf5',
      govBarColor: '#14532d',
      govBarText: 'ACOMPANHAMENTO DE CONFORMIDADE · {{REFERENCIA}}',
      headerBg: '#14532d',
      title: 'Relatório de conformidade do MEI',
      subtitle: 'Referência {{REFERENCIA}}',
      showHero: true,
      heroTitle: 'Um item do seu cadastro precisa de atenção',
      heroTitleColor: '#14532d',
      intro:
        'Olá, *{{NOME_TITULAR}}*.\n\nNa última consulta ao CNPJ *{{CNPJ}}*, identificamos que não há certificado digital ativo vinculado à empresa.\n\nVeja abaixo o resumo e o que isso representa hoje:',
      cardTitle: 'RESUMO DA CONSULTA',
      showWarning: true,
      warningTitle: 'O que fica limitado sem o certificado',
      warningItems:
        'Emissão de notas fiscais eletrônicas.\nAssinatura digital com validade jurídica.\nProcessos que exigem identificação do CNPJ.\nComprovação de regularidade junto a parceiros.',
      warningBg: '#f0fdf4',
      warningBorder: '#16a34a',
      warningTitleColor: '#166534',
      warningTextColor: '#15803d',
      buttonBg: '#15803d',
      buttonLabel: 'Ver relatório completo',
      badgesText: 'SSL 256-bits · LGPD · Dados públicos',
      showStatusBar: true,
      statusLabel: 'CONFORMIDADE',
      statusValue: 'ATENÇÃO',
      statusNote: 'Certificado digital não identificado.',
    },
  },
  {
    id: 'grafite-relatorio',
    name: 'Grafite Relatório',
    description: 'Visual sóbrio grafite, formato de relatório objetivo.',
    accent: '#1f2937',
    subject: 'Relatório do CNPJ {{CNPJ}} disponível',
    preheader: 'Resumo da verificação cadastral da sua empresa.',
    design: {
      ...base,
      ...commonFooter,
      showGovBar: true,
      govBarBg: '#f1f5f9',
      govBarColor: '#334155',
      govBarText: 'RELATÓRIO CADASTRAL · {{REFERENCIA}}',
      headerBg: '#1f2937',
      title: 'Relatório cadastral do MEI',
      subtitle: 'Emitido em nome de {{NOME_TITULAR}}',
      showHero: true,
      heroTitle: 'Resumo da verificação',
      heroTitleColor: '#1f2937',
      intro:
        '*{{NOME_TITULAR}}*, seu relatório de verificação já está disponível.\n\nO CNPJ *{{CNPJ}}* consta sem certificado digital ativo, item que influencia a reputação cadastral da empresa.\n\nConfira os dados apurados:',
      cardTitle: 'DADOS APURADOS',
      cardBg: '#f8fafc',
      showWarning: true,
      warningTitle: 'Observações da verificação',
      warningItems:
        'Certificado e-CNPJ não localizado.\nEmissão de NFS-e indisponível sem certificado.\nAssinaturas digitais em nome da empresa ficam bloqueadas.\nRecomenda-se regularizar o quanto antes.',
      warningBg: '#f8fafc',
      warningBorder: '#64748b',
      warningTitleColor: '#334155',
      warningTextColor: '#475569',
      buttonBg: '#0f172a',
      buttonLabel: 'Abrir meu relatório',
      badgesText: 'SSL · LGPD · Documento informativo',
      showStatusBar: true,
      statusLabel: 'RESULTADO',
      statusValue: 'PENDENTE',
      statusNote: 'Item pendente identificado na consulta.',
    },
  },
  {
    id: 'ambar-reputacao',
    name: 'Âmbar Reputação',
    description: 'Destaque em âmbar, foco na reputação cadastral da empresa.',
    accent: '#b45309',
    subject: 'Reputação cadastral: um ponto em aberto no seu CNPJ',
    preheader: 'Verifique agora o que está pendente no cadastro da sua empresa.',
    design: {
      ...base,
      ...commonFooter,
      showGovBar: true,
      govBarBg: '#fef3c7',
      govBarColor: '#78350f',
      govBarText: 'MONITORAMENTO CADASTRAL · {{REFERENCIA}}',
      headerBg: '#78350f',
      title: 'Monitoramento do seu CNPJ',
      subtitle: 'Protocolo {{REFERENCIA}}',
      showHero: true,
      heroTitle: 'Um ponto em aberto no seu cadastro',
      heroTitleColor: '#b45309',
      intro:
        'Olá, *{{NOME_TITULAR}}*.\n\nO monitoramento do CNPJ *{{CNPJ}}* apontou ausência de certificado digital ativo.\n\nEsse item entra na avaliação de reputação cadastral da empresa. Veja o detalhamento:',
      cardTitle: 'DETALHAMENTO',
      showWarning: true,
      warningTitle: 'Impactos na reputação cadastral',
      warningItems:
        'Cadastro considerado incompleto por parceiros e instituições.\nEmissão de nota fiscal eletrônica indisponível.\nContratos digitais em nome do CNPJ não podem ser assinados.\nAnálises de crédito PJ podem ser prejudicadas.',
      warningBg: '#fffbeb',
      warningBorder: '#d97706',
      warningTitleColor: '#92400e',
      warningTextColor: '#78350f',
      buttonBg: '#b45309',
      buttonLabel: 'Verificar meu cadastro',
      badgesText: 'SSL 256-bits · LGPD · Consulta imediata',
      showStatusBar: true,
      statusLabel: 'REPUTAÇÃO CADASTRAL',
      statusValue: 'PONTO EM ABERTO',
      statusNote: 'Certificado digital ausente.',
    },
  },
  {
    id: 'clean-minimal',
    name: 'Clean Minimal',
    description: 'Layout limpo, tipografia grande, sem faixas — ótimo para caixa de entrada.',
    accent: '#111827',
    subject: 'Seu CNPJ está sem certificado digital ativo',
    preheader: 'Leva 2 minutos para consultar a situação.',
    design: {
      ...base,
      ...commonFooter,
      showGovBar: false,
      showStatusBar: false,
      headerBg: '#111827',
      title: 'Certificado Digital MEI',
      subtitle: 'Consulta {{REFERENCIA}}',
      showHero: true,
      heroTitle: 'Seu CNPJ está sem certificado ativo',
      heroTitleColor: '#111827',
      heroTitleSize: 22,
      intro:
        'Olá, *{{NOME_TITULAR}}*.\n\nAo consultar o CNPJ *{{CNPJ}}*, não localizamos um certificado digital ativo vinculado à empresa.\n\nVocê pode conferir a situação completa em poucos segundos:',
      cardTitle: 'DADOS DA EMPRESA',
      cardBg: '#f8fafc',
      showWarning: true,
      warningTitle: 'Por que isso importa',
      warningItems:
        'Sem certificado, a emissão de NFS-e fica indisponível.\nContratos digitais em nome do CNPJ não podem ser assinados.\nO cadastro segue como incompleto em consultas de terceiros.',
      warningBg: '#f1f5f9',
      warningBorder: '#94a3b8',
      warningTitleColor: '#0f172a',
      warningTextColor: '#334155',
      buttonBg: '#111827',
      buttonRadius: 999,
      buttonPaddingY: 16,
      buttonPaddingX: 44,
      buttonLabel: 'Consultar situação',
      badgesText: 'Site seguro · LGPD',
    },
  },
  {
    id: 'teal-atualizacao',
    name: 'Teal Atualização',
    description: 'Tom verde-azulado moderno, linguagem de atualização de cadastro.',
    accent: '#0f766e',
    subject: 'Atualização do cadastro do CNPJ {{CNPJ}}',
    preheader: 'Há uma pendência simples de resolver no seu cadastro.',
    design: {
      ...base,
      ...commonFooter,
      showGovBar: true,
      govBarBg: '#ccfbf1',
      govBarColor: '#134e4a',
      govBarText: 'ATUALIZAÇÃO CADASTRAL · {{REFERENCIA}}',
      headerBg: '#134e4a',
      title: 'Atualização de cadastro',
      subtitle: 'Referência {{REFERENCIA}}',
      showHero: true,
      heroTitle: 'Pendência simples de resolver',
      heroTitleColor: '#0f766e',
      intro:
        'Olá, *{{NOME_TITULAR}}*.\n\nO cadastro do CNPJ *{{CNPJ}}* está quase completo: falta apenas o certificado digital ativo.\n\nVeja o que consta hoje na consulta:',
      cardTitle: 'SITUAÇÃO ATUAL',
      showWarning: true,
      warningTitle: 'O que ainda está pendente',
      warningItems:
        'Certificado digital e-CNPJ não vinculado.\nEmissão de NFS-e indisponível.\nAssinatura digital com validade jurídica indisponível.',
      warningBg: '#f0fdfa',
      warningBorder: '#14b8a6',
      warningTitleColor: '#115e59',
      warningTextColor: '#0f766e',
      buttonBg: '#0f766e',
      buttonLabel: 'Atualizar meu cadastro',
      badgesText: 'SSL 256-bits · LGPD',
      showStatusBar: true,
      statusLabel: 'CADASTRO',
      statusValue: 'INCOMPLETO',
      statusNote: 'Falta o certificado digital ativo.',
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
