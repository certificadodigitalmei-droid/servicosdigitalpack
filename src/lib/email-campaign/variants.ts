import { DEFAULT_DESIGN, type CampaignDesign } from './template';

/**
 * Modelos de campanha para rotação no envio em massa.
 *
 * Mesma mensagem do modelo principal (CNPJ sem Certificado Digital ativo),
 * porém com redação diferente em cada modelo e paleta em tons de azul escuro.
 * Vocabulário cuidadoso para evitar filtros de spam.
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

/** Paletas só em tons de azul — navy, royal, denim, midnight, cobalt.
 *  Nenhum tom puxa para verde, petróleo ou ciano. */
const BLUE_PALETTES = {
  navy: {
    headerBg: '#0b1f3a',
    heroTitleColor: '#0b1f3a',
    buttonBg: '#1e3a5f',
    govBarBg: '#e3eaf5',
    govBarColor: '#0b1f3a',
    warningBg: '#f0f5fb',
    warningBorder: '#2563eb',
    warningTitleColor: '#0b1f3a',
    warningTextColor: '#1e40af',
  },
  royal: {
    headerBg: '#1e3a8a',
    heroTitleColor: '#1e3a8a',
    buttonBg: '#2563eb',
    govBarBg: '#dbeafe',
    govBarColor: '#1e3a8a',
    warningBg: '#eff6ff',
    warningBorder: '#3b82f6',
    warningTitleColor: '#1e3a8a',
    warningTextColor: '#2563eb',
  },
  denim: {
    headerBg: '#1d4ed8',
    heroTitleColor: '#1e40af',
    buttonBg: '#2563eb',
    govBarBg: '#dbeafe',
    govBarColor: '#1e40af',
    warningBg: '#eff6ff',
    warningBorder: '#60a5fa',
    warningTitleColor: '#1e3a8a',
    warningTextColor: '#2563eb',
  },
  midnight: {
    headerBg: '#172554',
    heroTitleColor: '#172554',
    buttonBg: '#1e40af',
    govBarBg: '#e0e7ff',
    govBarColor: '#172554',
    warningBg: '#eef2ff',
    warningBorder: '#818cf8',
    warningTitleColor: '#312e81',
    warningTextColor: '#4f46e5',
  },
  cobalt: {
    headerBg: '#1e40af',
    heroTitleColor: '#1e40af',
    buttonBg: '#3b82f6',
    govBarBg: '#dbeafe',
    govBarColor: '#1e40af',
    warningBg: '#eff6ff',
    warningBorder: '#93c5fd',
    warningTitleColor: '#1e3a8a',
    warningTextColor: '#2563eb',
  },
  slateBlue: {
    headerBg: '#334155',
    heroTitleColor: '#334155',
    buttonBg: '#3b82f6',
    govBarBg: '#f1f5f9',
    govBarColor: '#334155',
    warningBg: '#f8fafc',
    warningBorder: '#60a5fa',
    warningTitleColor: '#334155',
    warningTextColor: '#3b82f6',
  },
} as const;

const IMPACTO_NFE = 'A emissão de nota fiscal pode ficar limitada sem o certificado ativo.';
const IMPACTO_CONTRATOS = 'Contratos digitais assinados em nome do CNPJ podem ter validade limitada.';
const IMPACTO_CREDITO = 'Bancos e financeiras podem restringir linhas de crédito empresarial.';
const IMPACTO_ACESSO_GOV = 'O acesso a alguns sistemas do governo pode exigir o certificado digital.';
const IMPACTO_CONSULTAS = 'Consultas cadastrais podem mostrar o CNPJ com situação incompleta.';
const IMPACTO_RECEITA = 'A Receita Federal recomenda manter o certificado digital atualizado.';
const IMPACTO_REGULARIDADE = 'A regularidade da empresa pode ser prejudicada em situações que exigem o certificado.';

const RAW_VARIANTS: CampaignVariant[] = [
  {
    id: 'azul-alerta',
    name: 'Aviso — Regularidade do CNPJ',
    description: 'Tom de aviso institucional. Destaca a importância sem cair em spam.',
    accent: BLUE_PALETTES.navy.headerBg,
    subject: 'Aviso sobre a regularidade do CNPJ {{CNPJ}}',
    preheader: 'Seu CNPJ está sem Certificado Digital ativo. Regularize para evitar limitações.',
    design: {
      ...base,
      ...BLUE_PALETTES.navy,
      showGovBar: false,
      govBarText: 'Aviso cadastral · Protocolo {{REFERENCIA}}',
      title: 'Aviso sobre a regularidade do seu CNPJ',
      subtitle: 'Central de Emissão · MEI',
      heroTitle: 'Mantenha seu CNPJ regular',
      intro:
        'Prezado(a) *{{NOME_TITULAR}}*,\n\nNa última verificação do CNPJ *{{CNPJ}}*, não localizamos um Certificado Digital ativo. Isso pode gerar limitações na rotina da empresa.\n\nVeja o que pode acontecer enquanto a situação não for regularizada:',
      warningTitle: 'Pontos de atenção para o seu CNPJ',
      warningItems: [
        IMPACTO_NFE,
        IMPACTO_CONTRATOS,
        IMPACTO_CREDITO,
        IMPACTO_ACESSO_GOV,
        IMPACTO_CONSULTAS,
        IMPACTO_REGULARIDADE,
        IMPACTO_RECEITA,
      ].join('\n'),
      buttonLabel: 'Verificar situação do CNPJ',
      statusValue: 'Em aberto',
      statusNote: 'Certificado e-CNPJ não localizado. Regularização recomendada.',
    },
  },
  {
    id: 'azul-cadastral',
    name: 'Redação 1 — Azul navy',
    description: 'Redação direta e institucional. Cabeçalho azul navy escuro.',
    accent: BLUE_PALETTES.navy.headerBg,
    subject: 'Situação do CNPJ {{CNPJ}} — Certificado Digital',
    preheader: 'Seu CNPJ está sem Certificado Digital ativo.',
    design: {
      ...base,
      ...BLUE_PALETTES.navy,
      govBarText: 'Central de emissão · Protocolo {{REFERENCIA}}',
      title: 'Situação do CNPJ — Certificado não ativo',
      subtitle: 'Central de Emissão · MEI',
      heroTitle: 'Certificado Digital não localizado',
      intro:
        'Prezado(a) *{{NOME_TITULAR}}*,\n\nO CNPJ *{{CNPJ}}* consta com o Certificado Digital inativo. Para manter a regularidade, especialmente junto à Receita Federal, é importante atualizar essa pendência.\n\nConfira abaixo os detalhes do cadastro e as orientações para concluir a atualização com segurança, sem sair do computador ou do celular:',
      warningTitle: 'Pontos que precisam de atenção',
      warningItems: [
        IMPACTO_NFE,
        IMPACTO_CONTRATOS,
        IMPACTO_CREDITO,
        IMPACTO_ACESSO_GOV,
        IMPACTO_CONSULTAS,
        IMPACTO_RECEITA,
      ].join('\n'),
      buttonLabel: 'Consultar dados do CNPJ',
      statusValue: 'Em aberto',
      statusNote: 'Certificado e-CNPJ não localizado.',
    },
  },
  {
    id: 'azul-royal',
    name: 'Redação 2 — Azul royal',
    description: 'Tom de comunicado formal. Cabeçalho azul royal.',
    accent: BLUE_PALETTES.royal.headerBg,
    subject: 'Comunicado: certificado do CNPJ {{CNPJ}} não localizado',
    preheader: 'Comunicado sobre a situação do seu cadastro MEI.',
    design: {
      ...base,
      ...BLUE_PALETTES.royal,
      govBarText: 'Acompanhamento cadastral · {{REFERENCIA}}',
      title: 'Comunicado sobre o cadastro do MEI',
      subtitle: 'Referência {{REFERENCIA}}',
      heroTitle: 'Certificado Digital não localizado',
      intro:
        'Prezado(a) *{{NOME_TITULAR}}*,\n\nComunicamos que, na consulta ao CNPJ *{{CNPJ}}*, não foi localizado Certificado Digital ativo. A Receita Federal e outros órgãos recomendam manter esse documento em dia.\n\nAbaixo estão os dados do cadastro:',
      warningTitle: 'O que pode ficar limitado sem o certificado',
      warningItems: [
        IMPACTO_NFE,
        IMPACTO_CONTRATOS,
        IMPACTO_CREDITO,
        IMPACTO_ACESSO_GOV,
        IMPACTO_REGULARIDADE,
        IMPACTO_RECEITA,
      ].join('\n'),
      buttonLabel: 'Acessar página de regularização',
      statusValue: 'Em aberto',
      statusNote: 'Certificado digital não identificado.',
    },
  },
  {
    id: 'azul-relatorio',
    name: 'Redação 3 — Azul denim',
    description: 'Formato de resultado de consulta. Azul denim.',
    accent: BLUE_PALETTES.denim.headerBg,
    subject: 'Resultado da consulta cadastral do CNPJ {{CNPJ}}',
    preheader: 'Resultado da verificação do seu CNPJ.',
    design: {
      ...base,
      ...BLUE_PALETTES.denim,
      cardBg: '#f8fafc',
      govBarText: 'Relatório cadastral · {{REFERENCIA}}',
      title: 'Resultado da consulta cadastral',
      subtitle: 'Consulta nº {{REFERENCIA}}',
      heroTitle: 'Resumo da verificação',
      intro:
        '*{{NOME_TITULAR}}*, o resultado da consulta ao CNPJ *{{CNPJ}}* já está disponível.\n\nA situação está em aberto por ausência de Certificado Digital ativo. A Receita Federal orienta a regularização para evitar limitações.\n\nVeja os dados apurados:',
      warningTitle: 'Observações da verificação',
      warningItems: [
        'Certificado e-CNPJ não localizado.',
        IMPACTO_NFE,
        IMPACTO_CONTRATOS,
        IMPACTO_CREDITO,
        IMPACTO_CONSULTAS,
        IMPACTO_REGULARIDADE,
        IMPACTO_RECEITA,
        'Recomenda-se resolver o quanto antes.',
      ].join('\n'),
      buttonLabel: 'Conferir situação cadastral',
      statusValue: 'Em aberto',
      statusNote: 'Item em aberto identificado na consulta.',
    },
  },
  {
    id: 'azul-reputacao',
    name: 'Redação 4 — Azul midnight',
    description: 'Foco em reputação cadastral. Azul midnight.',
    accent: BLUE_PALETTES.midnight.headerBg,
    subject: 'Um ponto em aberto no cadastro do seu CNPJ',
    preheader: 'A ausência do certificado afeta a regularidade cadastral.',
    design: {
      ...base,
      ...BLUE_PALETTES.midnight,
      govBarText: 'Monitoramento cadastral · {{REFERENCIA}}',
      title: 'Ponto em aberto no cadastro do MEI',
      subtitle: 'Protocolo {{REFERENCIA}}',
      heroTitle: 'Um ponto em aberto no seu cadastro',
      intro:
        'Prezado(a) *{{NOME_TITULAR}}*,\n\nO acompanhamento do CNPJ *{{CNPJ}}* apontou ausência de Certificado Digital ativo. Esse item é considerado pela Receita Federal na análise da regularidade da empresa.\n\nVeja o detalhamento abaixo:',
      warningTitle: 'Impactos enquanto a situação estiver em aberto',
      warningItems: [
        IMPACTO_CONSULTAS,
        IMPACTO_NFE,
        IMPACTO_CONTRATOS,
        IMPACTO_CREDITO,
        IMPACTO_ACESSO_GOV,
        IMPACTO_REGULARIDADE,
        IMPACTO_RECEITA,
      ].join('\n'),
      buttonLabel: 'Ver detalhes do CNPJ',
      statusValue: 'Em aberto',
      statusNote: 'Certificado digital ausente.',
    },
  },
  {
    id: 'azul-slate',
    name: 'Redação 5 — Azul cobalt',
    description: 'Linguagem simples e direta. Azul cobalt.',
    accent: BLUE_PALETTES.cobalt.headerBg,
    subject: 'Seu CNPJ está sem Certificado Digital ativo',
    preheader: 'Leva poucos minutos para verificar a situação.',
    design: {
      ...base,
      ...BLUE_PALETTES.cobalt,
      showGovBar: false,
      cardBg: '#f8fafc',
      title: 'Digital Certifica A1',
      subtitle: 'Consulta {{REFERENCIA}}',
      heroTitle: 'Seu CNPJ está sem certificado ativo',
      heroTitleSize: 22,
      intro:
        'Prezado(a) *{{NOME_TITULAR}}*,\n\nAo verificar o CNPJ *{{CNPJ}}*, não encontramos um Certificado Digital ativo vinculado à empresa. A Receita Federal orienta que o certificado esteja sempre em dia.\n\nVocê pode conferir a situação completa em poucos segundos e, se preferir, salvar o resumo do cadastro para consultar depois com calma:',
      warningTitle: 'Por que isso importa',
      warningItems: [
        IMPACTO_NFE,
        IMPACTO_CONTRATOS,
        IMPACTO_CONSULTAS,
        IMPACTO_CREDITO,
        IMPACTO_ACESSO_GOV,
        IMPACTO_RECEITA,
      ].join('\n'),
      buttonLabel: 'Acompanhar CNPJ',
      statusValue: 'Em aberto',
      statusNote: 'Certificado e-CNPJ não localizado.',
    },
  },
  {
    id: 'azul-indigo',
    name: 'Redação 6 — Azul slate',
    description: 'Escrito como atualização de cadastro. Azul slate.',
    accent: BLUE_PALETTES.slateBlue.headerBg,
    subject: 'Atualização do cadastro do CNPJ {{CNPJ}}',
    preheader: 'Falta apenas o Certificado Digital ativo.',
    design: {
      ...base,
      ...BLUE_PALETTES.slateBlue,
      govBarText: 'Atualização cadastral · {{REFERENCIA}}',
      title: 'Atualização de cadastro — MEI',
      subtitle: 'Referência {{REFERENCIA}}',
      heroTitle: 'Falta apenas o Certificado Digital',
      intro:
        'Prezado(a) *{{NOME_TITULAR}}*,\n\nO cadastro do CNPJ *{{CNPJ}}* está quase completo: falta apenas o Certificado Digital ativo. A Receita Federal considera esse item essencial para a regularidade.\n\nVeja o que consta hoje na consulta:',
      warningTitle: 'O que ainda está em aberto',
      warningItems: [
        'Certificado digital e-CNPJ não vinculado.',
        IMPACTO_NFE,
        IMPACTO_CONTRATOS,
        IMPACTO_ACESSO_GOV,
        IMPACTO_CREDITO,
        IMPACTO_REGULARIDADE,
        IMPACTO_RECEITA,
      ].join('\n'),
      buttonLabel: 'Consultar situação do MEI',
      statusValue: 'Em aberto',
      statusNote: 'Falta o Certificado Digital ativo.',
    },
  },
];

/** Todos os modelos seguem o mesmo padrão "lite": quadro de dados
 *  (nome, CNPJ, data da abertura, validade, situação em amarelo),
 *  sem hero, sem lista de impactos, sem selos e sem faixa de status. */
const LITE_INTRO =
  'Prezado(a) *{{NOME_TITULAR}}*,\n\nNa consulta ao CNPJ *{{CNPJ}}* não localizamos um Certificado Digital ativo. Confira os dados abaixo:';

export const CAMPAIGN_VARIANTS: CampaignVariant[] = RAW_VARIANTS.map((v) => ({
  ...v,
  design: {
    ...v.design,
    intro: LITE_INTRO,
    cardTitle: 'Dados do cadastro',
    showHero: false,
    showWarning: false,
    showBadges: false,
    showStatusBar: false,
    showGovBar: false,
    showSignature: false,
  },
}));

export function getVariant(id: string): CampaignVariant | undefined {
  return CAMPAIGN_VARIANTS.find((v) => v.id === id);
}

/** Remove modelos com assunto vazio ou repetido, para a rotação nunca
 *  enviar dois e-mails com o mesmo assunto. */
function dedupeBySubject(pool: CampaignVariant[]): CampaignVariant[] {
  const seen = new Set<string>();
  const out: CampaignVariant[] = [];
  for (const v of pool) {
    const key = (v.subject ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

/** Hash FNV-1a — distribui melhor sementes numéricas sequenciais (ids). */
function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Escolhe o modelo da rotação de forma estável por destinatário. */
export function pickVariant(activeIds: string[], seed: string): CampaignVariant | null {
  const pool = dedupeBySubject(
    activeIds.map(getVariant).filter(Boolean) as CampaignVariant[],
  );
  if (pool.length === 0) return null;
  return pool[hashSeed(seed) % pool.length];
}

/** Igual ao pickVariant, porém nunca retorna null: sem seleção salva,
 *  a rotação considera todos os modelos de campanha disponíveis. */
export function pickVariantOrDefault(activeIds: string[], seed: string): CampaignVariant {
  return (
    pickVariant(activeIds, seed) ??
    pickVariant(CAMPAIGN_VARIANTS.map((v) => v.id), seed)!
  );
}

