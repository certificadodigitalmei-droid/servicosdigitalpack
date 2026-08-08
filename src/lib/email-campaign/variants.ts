import { DEFAULT_DESIGN, type CampaignDesign } from './template';

/**
 * Modelos de campanha para rotação no envio em massa.
 *
 * IMPORTANTE: todos usam EXATAMENTE o mesmo visual do modelo principal
 * (`DEFAULT_DESIGN`) e dizem EXATAMENTE a mesma coisa — muda apenas a
 * redação (assunto, título, texto e itens de risco). Isso evita que
 * milhares de e-mails idênticos sejam classificados como campanha em massa,
 * sem alterar a mensagem que o usuário aprovou.
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
const accent = base.headerBg;

export const CAMPAIGN_VARIANTS: CampaignVariant[] = [
  {
    id: 'azul-cadastral',
    name: 'Redação 1 — Direta',
    description: 'Mesma mensagem do modelo principal, com redação direta e objetiva.',
    accent,
    subject: 'RESTRIÇÃO NO SEU CNPJ MEI',
    preheader: 'Seu CNPJ está sem Certificado Digital ativo.',
    design: {
      ...base,
      title: 'CNPJ COM RESTRIÇÃO - PENDENTE',
      heroTitle: 'Certificado Digital pendente',
      intro:
        'Prezado(a) *{{NOME_TITULAR}}*,\n\nSeu CNPJ consta como *PENDENTE*: sem Certificado Digital ativo.\n\nVerifique a situação do cadastro abaixo:',
      warningTitle: 'ATENÇÃO · RISCOS ATIVOS NO SEU CNPJ',
      warningItems:
        'Impossibilitado de emitir nota fiscal (NFS-e).\nImpossibilitado de assinar contratos digitais e físicos com CNPJ.\nBloqueio de limites de crédito empresarial em bancos e financeiras PJ.\nSujeito a multa e restrição perante a Receita Federal.',
      buttonLabel: 'REGULARIZAR MEU CNPJ',
    },
  },
  {
    id: 'verde-conformidade',
    name: 'Redação 2 — Formal',
    description: 'Mesmo conteúdo, escrito em tom formal de comunicado.',
    accent,
    subject: 'PENDÊNCIA NO CNPJ {{CNPJ}} - CERTIFICADO DIGITAL',
    preheader: 'Comunicado sobre a pendência do seu Certificado Digital.',
    design: {
      ...base,
      title: 'CNPJ PENDENTE - CERTIFICADO NÃO ATIVO',
      heroTitle: 'Pendência de Certificado Digital',
      intro:
        'Prezado(a) *{{NOME_TITULAR}}*,\n\nComunicamos que o CNPJ *{{CNPJ}}* encontra-se em situação *PENDENTE*, por não possuir Certificado Digital ativo vinculado.\n\nConfira abaixo os dados do cadastro:',
      warningTitle: 'ATENÇÃO · CONSEQUÊNCIAS DA PENDÊNCIA',
      warningItems:
        'Sem condição de emitir nota fiscal (NFS-e).\nSem condição de assinar contratos digitais e físicos em nome do CNPJ.\nLimites de crédito empresarial bloqueados em bancos e financeiras PJ.\nExposição a multas e restrições perante a Receita Federal.',
      buttonLabel: 'REGULARIZAR AGORA MEU CNPJ',
    },
  },
  {
    id: 'grafite-relatorio',
    name: 'Redação 3 — Resultado da consulta',
    description: 'Mesmo conteúdo, apresentado como resultado de consulta.',
    accent,
    subject: 'CONSULTA {{REFERENCIA}}: CNPJ MEI COM RESTRIÇÃO',
    preheader: 'Resultado da consulta ao seu CNPJ.',
    design: {
      ...base,
      title: 'RESULTADO: CNPJ COM RESTRIÇÃO',
      heroTitle: 'Certificado Digital não localizado',
      intro:
        'Prezado(a) *{{NOME_TITULAR}}*,\n\nNa consulta nº *{{REFERENCIA}}*, o CNPJ *{{CNPJ}}* retornou como *PENDENTE*: nenhum Certificado Digital ativo foi localizado.\n\nVeja abaixo o que consta no cadastro:',
      warningTitle: 'ATENÇÃO · O QUE ESTÁ RESTRITO HOJE',
      warningItems:
        'Emissão de nota fiscal (NFS-e) impossibilitada.\nAssinatura de contratos digitais e físicos com CNPJ impossibilitada.\nCrédito empresarial bloqueado em bancos e financeiras PJ.\nRisco de multa e restrição perante a Receita Federal.',
      buttonLabel: 'REGULARIZAR MEU CNPJ',
    },
  },
  {
    id: 'ambar-reputacao',
    name: 'Redação 4 — Alerta',
    description: 'Mesmo conteúdo, com abertura em forma de alerta.',
    accent,
    subject: 'ALERTA: CNPJ MEI SEM CERTIFICADO DIGITAL ATIVO',
    preheader: 'Existe uma restrição ativa no seu CNPJ.',
    design: {
      ...base,
      title: 'ALERTA · CNPJ PENDENTE',
      heroTitle: 'Restrição ativa no seu CNPJ',
      intro:
        'Prezado(a) *{{NOME_TITULAR}}*,\n\nExiste uma restrição ativa no seu CNPJ: ele está *PENDENTE*, sem Certificado Digital ativo.\n\nConfira a situação do cadastro abaixo:',
      warningTitle: 'ATENÇÃO · ENQUANTO A PENDÊNCIA CONTINUAR',
      warningItems:
        'Impossibilitado de emitir nota fiscal (NFS-e).\nImpossibilitado de assinar contratos digitais e físicos com CNPJ.\nLimites de crédito empresarial bloqueados em bancos e financeiras PJ.\nSujeito a multa e restrição perante a Receita Federal.',
      buttonLabel: 'QUERO REGULARIZAR MEU CNPJ',
    },
  },
  {
    id: 'clean-minimal',
    name: 'Redação 5 — Simples',
    description: 'Mesmo conteúdo, com frases curtas e linguagem simples.',
    accent,
    subject: 'SEU CNPJ MEI ESTÁ COM RESTRIÇÃO',
    preheader: 'Falta o Certificado Digital ativo no seu CNPJ.',
    design: {
      ...base,
      title: 'CNPJ COM RESTRIÇÃO',
      heroTitle: 'Falta o Certificado Digital',
      intro:
        'Prezado(a) *{{NOME_TITULAR}}*,\n\nO seu CNPJ *{{CNPJ}}* está *PENDENTE*. O motivo é simples: não há Certificado Digital ativo.\n\nVeja abaixo como está o seu cadastro:',
      warningTitle: 'ATENÇÃO · RISCOS ATIVOS NO SEU CNPJ',
      warningItems:
        'Você não consegue emitir nota fiscal (NFS-e).\nVocê não consegue assinar contratos digitais e físicos com o CNPJ.\nSeu crédito empresarial fica bloqueado em bancos e financeiras PJ.\nVocê fica sujeito a multa e restrição na Receita Federal.',
      buttonLabel: 'REGULARIZAR MEU CNPJ',
    },
  },
  {
    id: 'teal-atualizacao',
    name: 'Redação 6 — Cadastro',
    description: 'Mesmo conteúdo, escrito a partir da situação do cadastro.',
    accent,
    subject: 'CADASTRO DO CNPJ {{CNPJ}} COM PENDÊNCIA',
    preheader: 'Seu cadastro está pendente por falta do Certificado Digital.',
    design: {
      ...base,
      title: 'CADASTRO PENDENTE - CNPJ MEI',
      heroTitle: 'Cadastro pendente de Certificado',
      intro:
        'Prezado(a) *{{NOME_TITULAR}}*,\n\nO cadastro do CNPJ *{{CNPJ}}* permanece *PENDENTE* porque o Certificado Digital não está ativo.\n\nConfira os dados registrados abaixo:',
      warningTitle: 'ATENÇÃO · RESTRIÇÕES ENQUANTO ESTIVER PENDENTE',
      warningItems:
        'Nota fiscal (NFS-e) não pode ser emitida.\nContratos digitais e físicos com CNPJ não podem ser assinados.\nCrédito empresarial bloqueado em bancos e financeiras PJ.\nSujeito a multa e restrição perante a Receita Federal.',
      buttonLabel: 'REGULARIZAR MEU CNPJ',
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
