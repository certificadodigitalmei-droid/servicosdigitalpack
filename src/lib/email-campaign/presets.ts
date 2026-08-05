import avatarAsset from '@/assets/govbr-logo-avatar.png.asset.json';
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
    id: 'protocolo-oficial',
    name: 'Protocolo Oficial (recomendado)',
    description:
      'Mesmo padrão visual dos e-mails automáticos: faixa dourada, cabeçalho azul institucional, protocolo, quadro de dados e selos.',
    accent: '#0e3a70',
    subject: 'RESTRIÇÃO NO SEU CNPJ MEI',
    preheader:
      'Certificado Digital do CNPJ {{CNPJ}} está pendente.',
    design: {
      ...base,
      // faixa dourada superior + linha de protocolo
      showGovBar: true,
      govBarBg: '#f2c200',
      govBarColor: '#4a3800',
      govBarText: 'CENTRAL DE EMISSÃO · PROTOCOLO {{REFERENCIA}}',

      headerBg: '#0e3a70',
      headerText: '#ffffff',
      headerPadding: 28,
      showAvatar: false,
      logoText: 'PORTAL CERTIFICADO DIGITAL MEI',
      logoSize: 12,
      title: 'Emissão e-CNPJ',
      subtitle: 'Central de Emissão · MEI',
      titleSize: 20,
      subtitleSize: 12,

      showHero: true,
      heroTitle: 'Certificado Digital pendente',
      heroTitleColor: '#0e3a70',
      heroTitleSize: 20,

      intro:
        'Prezado(a) *{{NOME_TITULAR}}*,\n\nSeu CNPJ consta como *PENDENTE*: sem Certificado Digital ativo.\n\nVerifique a situação do cadastro abaixo:',

      bodySize: 13.5,

      showCard: true,
      cardBg: '#f4f7f5',
      cardTitle: 'DADOS DO REQUERENTE',
      cardTitleSize: 11,
      cardBodySize: 12,

      showWarning: true,
      warningTitle: 'ENQUANTO A PENDÊNCIA CONTINUAR',
      warningItems:
        'Sem emissão de Nota Fiscal (NF-e)\nSem assinatura de contratos digitais\nRestrições na Receita Federal',
      warningBg: '#fef2f2',
      warningBorder: '#dc2626',
      warningTitleColor: '#991b1b',
      warningTextColor: '#7f1d1d',
      warningTitleSize: 12,
      warningItemsSize: 12,


      buttonBg: '#1a4a8a',
      buttonText: '#ffffff',
      buttonRadius: 6,
      buttonPaddingY: 14,
      buttonPaddingX: 30,
      buttonSize: 14,
      buttonLabel: 'Verificar meu CNPJ',

      showSignature: true,
      signature:
        'Após o pagamento, o certificado é *vinculado automaticamente ao CNPJ*.\n\nAtenciosamente,\n*Central de Emissão*',
      signatureSize: 12,

      showBadges: true,
      badgesText: 'SSL 256-bits · LGPD · Validade 12 meses',

      showFooter: true,
      disclaimer:
        'Portal Certificado Digital MEI. Serviço privado de apoio ao MEI.\nE-mail automático; não responda.',
      disclaimerSize: 11,
    },
  },
  {
    id: 'gov-institucional',
    name: 'Gov Institucional',
    description: 'Cabeçalho azul-marinho estilo Portal gov.br com faixa superior e selos de confiança.',
    accent: '#0b1e3f',
    subject: 'RESTRIÇÃO NO SEU CNPJ MEI',
    preheader: 'Regularize o CNPJ {{CNPJ}} e evite penalidades.',
    design: {
      ...base,
      showGovBar: true,
      govBarText: 'gov.br · Certificado Digital MEI',
      govBarBg: '#071633',
      govBarColor: '#c9d5ec',
      showAvatar: false,
      avatarUrl: AVATAR,
      avatarSize: 64,
      showBadges: true,
      badgesText: 'gov.br · SSL · LGPD',
      headerBg: '#0b1e3f',
      buttonBg: '#0b1e3f',
      title: 'Informação cadastral',
      heroTitle: 'Certificado obrigatório',
      buttonLabel: 'Emitir Certificado',
    },
  },
  {
    id: 'alerta-vermelho',
    name: 'Alerta Vermelho',
    description: 'Tom de urgência: destaque em vermelho para CNPJ com restrições.',
    accent: '#b91c1c',
    subject: 'RESTRIÇÃO NO SEU CNPJ MEI',
    preheader: 'Seu MEI corre risco de suspensão.',
    design: {
      ...base,
      showGovBar: true,
      govBarBg: '#7f1d1d',
      govBarColor: '#fecaca',
      govBarText: 'ATENÇÃO · Pendência cadastral MEI',
      showAvatar: false,
      avatarUrl: AVATAR,
      avatarSize: 60,
      headerBg: '#991b1b',
      buttonBg: '#dc2626',
      heroTitleColor: '#991b1b',
      title: 'Notificação de pendência',
      heroTitle: 'CNPJ com restrições ativas',
      intro:
        '{{NOME_TITULAR}},\n\nO CNPJ *{{CNPJ}}* está *sem Certificado Digital ativo*.\n\nRegularize agora para evitar bloqueios:',
      warningTitle: 'CONSEQUÊNCIAS PARA MEI IRREGULAR',
      warningItems:
        'Sem emissão de Nota Fiscal (NF-e)\nSem assinatura de contratos digitais\nMulta e suspensão do CNPJ\nExclusão do Simples Nacional',
      buttonLabel: 'REGULARIZAR AGORA',
      showBadges: true,
      badgesText: 'gov.br · Receita Federal · SSL',
    },
  },
  {
    id: 'verde-institucional',
    name: 'Verde Confiança',
    description: 'Paleta verde institucional (Receita Federal), sensação de conformidade.',
    accent: '#15803d',
    subject: 'RESTRIÇÃO NO SEU CNPJ MEI',
    preheader: 'Confirme os dados e emita seu certificado.',
    design: {
      ...base,
      headerBg: '#14532d',
      buttonBg: '#15803d',
      heroTitleColor: '#14532d',
      showAvatar: false,
      avatarUrl: AVATAR,
      avatarSize: 62,
      showGovBar: true,
      govBarBg: '#052e16',
      govBarColor: '#bbf7d0',
      govBarText: 'gov.br · Receita Federal · Portal MEI',
      title: 'Atualização cadastral',
      heroTitle: 'Certificado disponível',
      buttonLabel: 'Emitir meu Certificado',
      showBadges: true,
      badgesText: 'gov.br · SSL 256-bits · LGPD',
    },
  },
  {
    id: 'clean-moderno',
    name: 'Clean Moderno',
    description: 'Fundo branco, tipografia grande, botão arredondado, visual minimalista premium.',
    accent: '#111827',
    subject: 'RESTRIÇÃO NO SEU CNPJ MEI',
    preheader: 'Finalize em 2 minutos. CNPJ {{CNPJ}}.',
    design: {
      ...base,
      headerBg: '#111827',
      buttonBg: '#111827',
      buttonRadius: 999,
      buttonPaddingY: 18,
      buttonPaddingX: 52,
      heroTitleColor: '#111827',
      heroTitleSize: 20,
      showAvatar: false,
      avatarUrl: AVATAR,
      avatarSize: 72,
      showGovBar: false,
      title: 'Certificado Digital MEI',
      subtitle: 'Ref. {{REFERENCIA}}',
      heroTitle: 'Tudo pronto para emitir',
      buttonLabel: 'Finalizar emissão',
      showBadges: true,
      badgesText: 'gov.br · Site Seguro · LGPD',
    },
  },
  {
    id: 'hero-image',
    name: 'Com Imagem Hero',
    description: 'Banner de destaque no topo (imagem enviada) + card de dados abaixo.',
    accent: '#1e3a8a',
    subject: 'RESTRIÇÃO NO SEU CNPJ MEI',
    preheader: 'Regularize seu MEI com o certificado oficial.',
    design: {
      ...base,
      heroImageUrl: HERO,
      showHero: false,
      headerBg: '#1e3a8a',
      buttonBg: '#1e3a8a',
      showAvatar: false,
      avatarUrl: AVATAR,
      avatarSize: 60,
      title: 'Certificado Digital MEI',
      buttonLabel: 'Emitir Certificado',
      showBadges: true,
      badgesText: 'gov.br · Site Seguro · Receita Federal',
    },
  },
  {
    id: 'formal-cinza',
    name: 'Formal Cinza',
    description: 'Estética formal cinza-grafite, ideal para tom de notificação oficial sóbria.',
    accent: '#334155',
    subject: 'RESTRIÇÃO NO SEU CNPJ MEI',
    preheader: 'Atualização do seu cadastro MEI.',
    design: {
      ...base,
      headerBg: '#1f2937',
      buttonBg: '#0f172a',
      cardBg: '#f8fafc',
      showAvatar: false,
      avatarUrl: AVATAR,
      avatarSize: 58,
      showGovBar: true,
      govBarBg: '#0f172a',
      govBarColor: '#cbd5e1',
      govBarText: 'Notificação oficial · Cadastro MEI',
      title: 'Notificação ao MEI',
      heroTitle: 'Emissão pendente',
      buttonLabel: 'Prosseguir com a emissão',
      showBadges: true,
      badgesText: 'gov.br · SSL 256-bits · LGPD',
    },
  },
];
