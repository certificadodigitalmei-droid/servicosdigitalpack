import { DEFAULT_DESIGN, type CampaignDesign } from './template';

export type Preset = {
  id: string;
  name: string;
  description: string;
  accent: string;
  subject: string;
  preheader: string;
  design: CampaignDesign;
};

const base = DEFAULT_DESIGN;

/**
 * Presets de e-mail — TODOS de assessoria particular (Central MEI Digital).
 * Não usar nomes, logos, selos ou expressões de órgãos públicos
 * (gov.br, Receita Federal, Governo Federal, Portal do Empreendedor, etc.).
 */
export const PRESETS: Preset[] = [
  {
    id: 'clean-moderno',
    name: 'Clean Moderno',
    description: 'Visual minimalista com tipografia grande e botão arredondado.',
    accent: '#0f172a',
    subject: 'Olá {{NOME_TITULAR}}, resumo do seu atendimento MEI',
    preheader: 'Central MEI Digital — assessoria particular para {{CNPJ}}.',
    design: {
      ...base,
      headerBg: '#0f172a',
      buttonBg: '#0f172a',
      buttonRadius: 999,
      buttonPaddingY: 18,
      buttonPaddingX: 52,
      heroTitleColor: '#0f172a',
      heroTitleSize: 30,
      title: 'Central MEI Digital',
      subtitle: 'Ref. atendimento {{REFERENCIA}}',
      heroTitle: 'Tudo pronto para\ncontinuar seu atendimento.',
      buttonLabel: 'Acessar meu atendimento',
      showBadges: true,
      badgesText: 'Atendimento humano  ·  Conexão segura  ·  Dados protegidos',
    },
  },
  {
    id: 'azul-consultoria',
    name: 'Azul Consultoria',
    description: 'Tom profissional, ideal para consultoria e acompanhamento contábil.',
    accent: '#1d4ed8',
    subject: '{{NOME_TITULAR}}, sua consultoria MEI está disponível',
    preheader: 'Veja o resumo da consultoria para o CNPJ {{CNPJ}}.',
    design: {
      ...base,
      headerBg: '#1e3a8a',
      buttonBg: '#1d4ed8',
      heroTitleColor: '#1e3a8a',
      title: 'Consultoria MEI - {{NOME_TITULAR}}',
      heroTitle: 'Sua consultoria\nparticular está pronta',
      intro:
        '{{NOME_TITULAR}},\n\nPreparamos um resumo particular do seu MEI **{{CNPJ}}** com as próximas ações recomendadas pela nossa equipe.',
      warningTitle: 'O que está incluso:',
      warningItems:
        'Análise particular da situação do MEI\nOrientação sobre guias e obrigações mensais\nSuporte humano por WhatsApp\nRelatório enviado por e-mail',
      buttonLabel: 'Ver minha consultoria',
      showBadges: true,
      badgesText: 'Assessoria particular  ·  Atendimento humano  ·  LGPD',
    },
  },
  {
    id: 'verde-suporte',
    name: 'Verde Suporte',
    description: 'Paleta verde, sensação de confiança e continuidade do atendimento.',
    accent: '#15803d',
    subject: '{{NOME_TITULAR}}, próximos passos do seu MEI',
    preheader: 'Central MEI Digital — próximos passos para o CNPJ {{CNPJ}}.',
    design: {
      ...base,
      headerBg: '#14532d',
      buttonBg: '#15803d',
      heroTitleColor: '#14532d',
      title: 'Próximos passos - {{NOME_TITULAR}}',
      heroTitle: 'Seu atendimento MEI\ntem novidades',
      intro:
        '{{NOME_TITULAR}},\n\nOrganizamos os próximos passos do seu MEI. Nossa equipe fica à disposição para te acompanhar de forma particular.',
      warningTitle: 'O que a Central MEI Digital faz por você:',
      warningItems:
        'Organiza a papelada mensal do MEI\nLembra você das guias e prazos\nResponde suas dúvidas de forma humana\nMantém seu histórico em um só lugar',
      buttonLabel: 'Continuar meu atendimento',
      showBadges: true,
      badgesText: 'Atendimento particular  ·  Suporte humano  ·  Dados protegidos',
    },
  },
  {
    id: 'formal-cinza',
    name: 'Formal Cinza',
    description: 'Estética sóbria em cinza-grafite, para comunicações formais da assessoria.',
    accent: '#334155',
    subject: 'Comunicado - atendimento MEI {{REFERENCIA}}',
    preheader: 'Prezado(a) {{NOME_TITULAR}}, resumo do seu atendimento particular.',
    design: {
      ...base,
      headerBg: '#1f2937',
      buttonBg: '#0f172a',
      cardBg: '#f8fafc',
      title: 'Comunicado - {{NOME_TITULAR}}',
      heroTitle: 'Atualização do seu\natendimento particular',
      buttonLabel: 'Acessar atendimento',
      showBadges: true,
      badgesText: 'Central MEI Digital  ·  Conexão segura  ·  LGPD',
    },
  },
];
