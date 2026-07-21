import avatarAsset from '@/assets/modelo-avatar.png.asset.json';
import heroAsset from '@/assets/modelo-hero.png.asset.json';
import { DEFAULT_DESIGN, type CampaignDesign } from './template';

// E-mails são abertos em clientes externos (Gmail, Outlook), então precisam de URL absoluta.
const SITE_ORIGIN = 'https://seu-certificado-mei-digital.online';
const toAbs = (u: string) => (u.startsWith('http') ? u : `${SITE_ORIGIN}${u}`);
const AVATAR = toAbs(avatarAsset.url);
const HERO = toAbs(heroAsset.url);

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

export const PRESETS: Preset[] = [
  {
    id: 'gov-institucional',
    name: 'Gov Institucional',
    description: 'Cabeçalho azul-marinho estilo Portal gov.br com faixa superior e selos de confiança.',
    accent: '#0b1e3f',
    subject: '{{NOME_TITULAR}}, seu CNPJ está sem Certificado Digital ativo',
    preheader: 'Regularize seu CNPJ {{CNPJ}} e evite penalidades da Receita Federal.',
    design: {
      ...base,
      showGovBar: true,
      govBarText: 'gov.br  ›  Portal do Empreendedor  ›  Certificado Digital MEI',
      govBarBg: '#071633',
      govBarColor: '#c9d5ec',
      showAvatar: true,
      avatarUrl: AVATAR,
      avatarSize: 64,
      showBadges: true,
      badgesText: 'Portal gov.br  ·  Site Seguro (SSL)  ·  Receita Federal  ·  LGPD',
      headerBg: '#0b1e3f',
      buttonBg: '#0b1e3f',
      title: 'Informação cadastral - {{NOME_TITULAR}}',
      heroTitle: 'Certificado Digital\nobrigatório para seu CNPJ',
      buttonLabel: 'Emitir Certificado Digital MEI',
    },
  },
  {
    id: 'alerta-vermelho',
    name: 'Alerta Vermelho',
    description: 'Tom de urgência: destaque em vermelho para CNPJ com restrições.',
    accent: '#b91c1c',
    subject: 'URGENTE — CNPJ {{CNPJ}} com restrições na Receita Federal',
    preheader: '{{NOME_TITULAR}}, seu MEI corre risco de suspensão. Emita o Certificado Digital.',
    design: {
      ...base,
      showGovBar: true,
      govBarBg: '#7f1d1d',
      govBarColor: '#fecaca',
      govBarText: 'ATENÇÃO  ›  Notificação de pendência cadastral MEI',
      showAvatar: true,
      avatarUrl: AVATAR,
      avatarSize: 60,
      headerBg: '#991b1b',
      buttonBg: '#dc2626',
      heroTitleColor: '#991b1b',
      title: 'Notificação de pendência - {{NOME_TITULAR}}',
      heroTitle: 'Seu CNPJ está\ncom restrições ativas',
      intro:
        '{{NOME_TITULAR}},\n\nIdentificamos que o seu CNPJ **{{CNPJ}}** está **sem Certificado Digital ativo** e apresenta restrições que impedem operações fiscais.\n\nRegularize agora para evitar bloqueios:',
      warningTitle: 'Consequências para MEIs irregulares:',
      warningItems:
        'Impedimento de emissão de Nota Fiscal Eletrônica (NF-e)\nBloqueio para assinar contratos e propostas digitais\nMulta e suspensão do CNPJ pela Receita Federal\nExclusão do Simples Nacional após 90 dias',
      buttonLabel: 'REGULARIZAR AGORA',
      showBadges: true,
      badgesText: 'Portal gov.br  ·  Receita Federal  ·  Site Seguro SSL',
    },
  },
  {
    id: 'verde-institucional',
    name: 'Verde Confiança',
    description: 'Paleta verde institucional (Receita Federal), sensação de conformidade.',
    accent: '#15803d',
    subject: '{{NOME_TITULAR}}, atualização do cadastro MEI - CNPJ {{CNPJ}}',
    preheader: 'Confirme os dados do CNPJ e emita seu Certificado Digital MEI.',
    design: {
      ...base,
      headerBg: '#14532d',
      buttonBg: '#15803d',
      heroTitleColor: '#14532d',
      showAvatar: true,
      avatarUrl: AVATAR,
      avatarSize: 62,
      showGovBar: true,
      govBarBg: '#052e16',
      govBarColor: '#bbf7d0',
      govBarText: 'gov.br  ›  Receita Federal do Brasil  ›  Portal MEI',
      title: 'Atualização cadastral - {{NOME_TITULAR}}',
      heroTitle: 'Certificado Digital\ndisponível para seu CNPJ',
      buttonLabel: 'Emitir meu Certificado',
      showBadges: true,
      badgesText: 'gov.br  ·  Receita Federal  ·  SSL 256-bits  ·  LGPD',
    },
  },
  {
    id: 'clean-moderno',
    name: 'Clean Moderno',
    description: 'Fundo branco, tipografia grande, botão arredondado, visual minimalista premium.',
    accent: '#111827',
    subject: 'Olá {{NOME_TITULAR}}, seu Certificado Digital MEI está pronto',
    preheader: 'Basta finalizar em 2 minutos. CNPJ {{CNPJ}}.',
    design: {
      ...base,
      headerBg: '#111827',
      buttonBg: '#111827',
      buttonRadius: 999,
      buttonPaddingY: 18,
      buttonPaddingX: 52,
      heroTitleColor: '#111827',
      heroTitleSize: 30,
      showAvatar: true,
      avatarUrl: AVATAR,
      avatarSize: 72,
      showGovBar: false,
      title: 'Certificado Digital MEI',
      subtitle: 'Ref. {{REFERENCIA}}',
      heroTitle: 'Tudo pronto para\nemitir seu certificado.',
      buttonLabel: 'Finalizar emissão',
      showBadges: true,
      badgesText: 'Portal gov.br  ·  Site Seguro  ·  LGPD',
    },
  },
  {
    id: 'hero-image',
    name: 'Com Imagem Hero',
    description: 'Banner de destaque no topo (imagem enviada) + card de dados abaixo.',
    accent: '#1e3a8a',
    subject: '{{NOME_TITULAR}}, Certificado Digital disponível para {{CNPJ}}',
    preheader: 'Regularize seu MEI com o Certificado Digital oficial.',
    design: {
      ...base,
      heroImageUrl: HERO,
      showHero: false,
      headerBg: '#1e3a8a',
      buttonBg: '#1e3a8a',
      showAvatar: true,
      avatarUrl: AVATAR,
      avatarSize: 60,
      title: 'Certificado Digital MEI - {{NOME_TITULAR}}',
      buttonLabel: 'Emitir Certificado Digital',
      showBadges: true,
      badgesText: 'gov.br  ·  Site Seguro  ·  Receita Federal',
    },
  },
  {
    id: 'formal-cinza',
    name: 'Formal Cinza',
    description: 'Estética formal cinza-grafite, ideal para tom de notificação oficial sóbria.',
    accent: '#334155',
    subject: 'Notificação - CNPJ {{CNPJ}} sem Certificado Digital',
    preheader: 'Prezado(a) {{NOME_TITULAR}}, atualização do seu cadastro MEI.',
    design: {
      ...base,
      headerBg: '#1f2937',
      buttonBg: '#0f172a',
      cardBg: '#f8fafc',
      showAvatar: true,
      avatarUrl: AVATAR,
      avatarSize: 58,
      showGovBar: true,
      govBarBg: '#0f172a',
      govBarColor: '#cbd5e1',
      govBarText: 'Notificação oficial  ›  Cadastro MEI',
      title: 'Notificação ao MEI - {{NOME_TITULAR}}',
      heroTitle: 'Emissão do Certificado\nDigital pendente',
      buttonLabel: 'Prosseguir com a emissão',
      showBadges: true,
      badgesText: 'Portal gov.br  ·  SSL 256-bits  ·  Dados protegidos LGPD',
    },
  },
];
