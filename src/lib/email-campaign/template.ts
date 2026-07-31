import govbrAvatarAsset from '@/assets/govbr-logo-avatar.png.asset.json';

export type CampaignDesign = {
  // Marca / cabeçalho
  logoText: string;
  logoUrl?: string;
  logoSize: number;
  heroImageUrl?: string;
  headerBg: string;
  headerText: string;
  headerPadding: number;

  // Cores base
  bodyBg: string;
  pageBg: string;
  cardBg: string;
  textColor: string;
  mutedColor: string;

  // Botão
  buttonBg: string;
  buttonText: string;
  buttonRadius: number;
  buttonPaddingY: number;
  buttonPaddingX: number;
  buttonSize: number;

  // Layout
  align: 'left' | 'center';
  containerWidth: number;
  contentPaddingX: number;

  // Tipografia
  titleSize: number;
  subtitleSize: number;
  bodySize: number;
  heroTitleSize: number;
  heroTitleColor: string;
  cardTitleSize?: number;
  cardBodySize?: number;
  warningTitleSize?: number;
  warningItemsSize?: number;
  signatureSize?: number;
  disclaimerSize?: number;


  // Textos principais
  title: string;
  subtitle: string;
  heroTitle: string;
  showHero: boolean;
  intro: string;
  cardTitle: string;
  showCard: boolean;
  buttonLabel: string;
  buttonHref: string;

  // Bloco de aviso
  showWarning: boolean;
  warningTitle: string;
  warningItems: string; // uma linha por item
  warningBg: string;
  warningBorder: string;
  warningTitleColor: string;
  warningTextColor: string;

  // Assinatura
  showSignature: boolean;
  signature: string;

  // Rodapé
  footer: string;
  disclaimer: string;
  showFooter: boolean;
  unsubText: string;
  unsubHref: string;

  // Avatar (topo, círculo)
  showAvatar?: boolean;
  avatarUrl?: string;
  avatarSize?: number;

  // Faixa gov.br (texto acima do cabeçalho)
  showGovBar?: boolean;
  govBarText?: string;
  govBarBg?: string;
  govBarColor?: string;

  // Selos de confiança (rodapé)
  showBadges?: boolean;
  badgesText?: string; // separado por "·"

  // Faixa de status (vermelha) — "SITUAÇÃO: PENDENTE"
  showStatusBar?: boolean;
  statusLabel?: string;
  statusValue?: string;
  statusNote?: string;
};



const AVATAR_URL = govbrAvatarAsset.url.startsWith('http')
  ? govbrAvatarAsset.url
  : `https://seu-certificado-mei-digital.online${govbrAvatarAsset.url}`;

/**
 * Padrão visual único das campanhas: mesmo estilo institucional dos e-mails
 * automáticos (faixa dourada, cabeçalho azul, protocolo, quadro de dados e selos).
 */
export const DEFAULT_DESIGN: CampaignDesign = {
  logoText: 'PORTAL CERTIFICADO DIGITAL MEI',
  logoSize: 12,
  headerBg: '#0e3a70',
  headerText: '#ffffff',
  headerPadding: 28,

  bodyBg: '#ffffff',
  pageBg: '#f3f4f6',
  cardBg: '#f4f7f5',
  textColor: '#1f2937',
  mutedColor: '#64748b',

  buttonBg: '#1a4a8a',
  buttonText: '#ffffff',
  buttonRadius: 6,
  buttonPaddingY: 14,
  buttonPaddingX: 30,
  buttonSize: 14,

  align: 'left',
  containerWidth: 640,
  contentPaddingX: 36,

  titleSize: 20,
  subtitleSize: 12,
  bodySize: 13.5,
  heroTitleSize: 20,
  heroTitleColor: '#0e3a70',
  cardTitleSize: 11,
  cardBodySize: 12,
  warningTitleSize: 12,
  warningItemsSize: 12,
  signatureSize: 12,
  disclaimerSize: 11,

  title: 'Solicitação de emissão — e-CNPJ',
  subtitle: 'Central de Emissão · Microempreendedor Individual',
  heroTitle: 'Seu CNPJ está com\npendência de Certificado Digital',
  showHero: true,
  intro:
    'Prezado(a) *{{NOME_TITULAR}}*,\n\nA inscrição abaixo consta em nosso sistema como *PENDENTE*, por estar *sem Certificado Digital e-CNPJ ativo*.\n\nRecomendamos *verificar agora* a situação do seu cadastro antes que novas restrições sejam aplicadas:',
  cardTitle: 'DADOS DO REQUERENTE',
  showCard: true,
  buttonLabel: 'Verificar situação do meu CNPJ',
  buttonHref: '{{LINK_PUBLICO}}',

  showWarning: true,
  warningTitle: 'O QUE ACONTECE ENQUANTO A PENDÊNCIA NÃO É RESOLVIDA',
  warningItems:
    'Impedimento para emissão de Nota Fiscal Eletrônica (NF-e)\nBloqueio para assinatura de contratos e propostas digitais\nRestrições cadastrais junto à Receita Federal',
  warningBg: '#fef2f2',
  warningBorder: '#dc2626',
  warningTitleColor: '#991b1b',
  warningTextColor: '#7f1d1d',


  showSignature: true,
  signature:
    'Após a confirmação do pagamento, o Certificado Digital é *emitido e vinculado automaticamente ao CNPJ*, sem necessidade de comparecimento presencial.\n\nAtenciosamente,\n*Central de Emissão*\nPortal Certificado Digital MEI',

  footer: 'Atenciosamente,\nCentral de Emissão\nPortal Certificado Digital MEI',
  disclaimer:
    'Portal Certificado Digital MEI — Microempreendedor Individual. Serviço privado de apoio ao MEI. Este e-mail foi enviado automaticamente; não responda.',
  showFooter: true,
  unsubText: '',
  unsubHref: '#',

  // Sem logo no topo: a imagem fica apenas na foto de perfil do remetente.
  showAvatar: false,
  avatarUrl: AVATAR_URL,
  avatarSize: 58,

  showGovBar: true,
  govBarText: 'CENTRAL DE EMISSÃO  ›  MICROEMPREENDEDOR INDIVIDUAL  ›  PROTOCOLO {{REFERENCIA}}',
  govBarBg: '#f2c200',
  govBarColor: '#4a3800',

  showBadges: true,
  badgesText: 'Site Seguro (SSL 256-bits)  ·  Dados Protegidos (LGPD)  ·  Validade 12 meses',
};


export const DEFAULT_SUBJECT = 'Certificado Digital e-CNPJ — pendência de emissão ({{CNPJ}})';
export const DEFAULT_PREHEADER =
  'Prezado(a) {{NOME_TITULAR}}, a emissão do Certificado Digital do CNPJ {{CNPJ}} está pendente.';

export type Vars = Record<string, string>;

export function substitute(tpl: string, vars: Vars): string {
  return String(tpl || '').replace(/\{\{\s*([A-Z_]+)\s*\}\}/g, (_, k) => {
    const v = vars[k];
    if (v == null || v === '') return '';
    if (k === 'CNPJ') return formatCnpj(String(v));
    return String(v);
  });
}

export function findMissingVars(tpl: string, vars: Vars): string[] {
  const out: string[] = [];
  const re = /\{\{\s*([A-Z_]+)\s*\}\}/g;
  let m;
  while ((m = re.exec(String(tpl || '')))) {
    const k = m[1];
    if (!vars[k]) out.push(k);
  }
  return Array.from(new Set(out));
}

function esc(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function nl2br(s: string): string {
  return esc(s).replace(/\n/g, '<br/>');
}

/** Suporta formatação estilo WhatsApp: *negrito*, _itálico_, ~riscado~ e {color:#hex}cor{/color}. */
function inlineFormat(s: string): string {
  let out = nl2br(s);
  // cor {color:#hex}texto{/color}
  out = out.replace(/\{color:(#[0-9a-fA-F]{3,8})\}([\s\S]+?)\{\/color\}/g,
    (_, c, t) => `<span style="color:${c}">${t}</span>`);
  // **negrito** (legado) e *negrito*
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[\s>(])\*(?!\s)([^*\n]+?)\*(?=[\s<).,!?;:]|$)/g, '$1<strong>$2</strong>');
  // _itálico_
  out = out.replace(/(^|[\s>(])_(?!\s)([^_\n]+?)_(?=[\s<).,!?;:]|$)/g, '$1<em>$2</em>');
  // ~riscado~
  out = out.replace(/(^|[\s>(])~(?!\s)([^~\n]+?)~(?=[\s<).,!?;:]|$)/g, '$1<s>$2</s>');
  return out;
}

function cleanPersonName(v: string): string {
  if (!v) return '';
  return v
    .replace(/\d+/g, '')
    .replace(/[.\-/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatCnpj(cnpj: string): string {
  if (!cnpj) return '';
  const clean = cnpj.replace(/\D/g, '');
  if (clean.length !== 14) return cnpj;
  return clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

const EMAIL_SITE_ORIGIN = 'https://certificadodigitalccmei.online';
function toAbsoluteUrl(u?: string): string {
  if (!u) return '';
  const s = String(u).trim();
  if (!s) return '';
  if (/^(https?:|data:|cid:)/i.test(s)) return s;
  if (s.startsWith('//')) return `https:${s}`;
  if (s.startsWith('/')) return `${EMAIL_SITE_ORIGIN}${s}`;
  return `${EMAIL_SITE_ORIGIN}/${s}`;
}

export function renderHtml(d: CampaignDesign, vars: Vars): string {
  // Merge com defaults para não quebrar quando o design salvo estiver antigo.
  const D: CampaignDesign = { ...DEFAULT_DESIGN, ...d };
  // Normaliza URLs de imagem para absolutas (clientes de e-mail não resolvem caminhos relativos).
  D.heroImageUrl = toAbsoluteUrl(D.heroImageUrl);
  D.avatarUrl = toAbsoluteUrl(D.avatarUrl);
  const S = (t: string) => substitute(t, vars);
  const rawTitle = S(D.title);
  const title = nl2br(rawTitle);
  const subtitle = nl2br(S(D.subtitle));
  const intro = inlineFormat(S(D.intro));
  const cardTitle = nl2br(S(D.cardTitle));
  const buttonLabel = esc(S(D.buttonLabel));
  const buttonHref = esc(S(D.buttonHref));
  const disclaimer = inlineFormat(S(D.disclaimer));
  const signature = inlineFormat(S(D.signature));
  const logo = nl2br(S(D.logoText));
  const heroTitle = inlineFormat(S(D.heroTitle));
  const warningTitle = nl2br(S(D.warningTitle));
  const warningItems = inlineFormat(S(D.warningItems));

  const align = D.align;
  const px = D.contentPaddingX;

  // Auto-shrink do título para caber em UMA linha (nome do titular nunca quebra).
  // Considera a maior linha do título já com variáveis substituídas.
  const longestTitleLine = String(rawTitle || '')
    .split(/\r?\n/)
    .reduce((m, l) => (l.length > m.length ? l : m), '');
  const availableTitleWidth = Math.max(120, D.containerWidth - 2 * px);
  // Arial bold: ~0.58em por caractere. Deixa uma folga de 4px.
  const fitTitleSize = Math.floor((availableTitleWidth - 4) / Math.max(1, longestTitleLine.length * 0.58));
  const effectiveTitleSize = Math.max(12, Math.min(D.titleSize, fitTitleSize));


  const rowsHtml = [
    ['Nome', vars.NOME_TITULAR || vars.NOME_EMPRESARIAL],
    ['CNPJ', formatCnpj(vars.CNPJ || '')],
    ['Data de Abertura', vars.DATA_ABERTURA],
    ['Situação', vars.SITUACAO || 'CNPJ sem certificado ativo'],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => {
      const isSituacao = k === 'Situação';
      const valueStyle =
        isSituacao && String(v).toLowerCase().includes('sem certificado')
          ? 'color:#dc2626;font-weight:700;'
          : `color:${D.textColor};`;
      return `<tr><td style="padding:8px 0;color:${D.textColor};font-size:${D.cardBodySize || D.bodySize}px;line-height:1.5;font-family:Arial,sans-serif;"><strong>&bull; ${esc(String(k))}:</strong> <span style="${valueStyle}">${esc(String(v))}</span></td></tr>`;
    })
    .join('');


  return `<!doctype html>
<html lang="pt-BR" dir="ltr"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light only"/>
<meta name="supported-color-schemes" content="light only"/>
<meta name="x-apple-disable-message-reformatting"/>
<meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no"/>
<title>${title}</title>
<style>
  :root { color-scheme: light only; supported-color-schemes: light only; }
  /* Force light mode on clients that auto-invert (Outlook.com, Yahoo, Gmail iOS) */
  [data-ogsc] body, [data-ogsb] body,
  u + .body, u + #body {
    background:${D.pageBg} !important;
    color:${D.textColor} !important;
  }
  [data-ogsc] .l-page, [data-ogsb] .l-page { background:${D.pageBg} !important; }
  [data-ogsc] .l-card, [data-ogsb] .l-card { background:${D.bodyBg} !important; color:${D.textColor} !important; }
  [data-ogsc] .l-text, [data-ogsb] .l-text { color:${D.textColor} !important; }
  [data-ogsc] .l-muted, [data-ogsb] .l-muted { color:${D.mutedColor} !important; }
  [data-ogsc] .l-btn, [data-ogsb] .l-btn { background:${D.buttonBg} !important; color:${D.buttonText} !important; }
  @media (prefers-color-scheme: dark) {
    body, .l-page { background:${D.pageBg} !important; color:${D.textColor} !important; }
    .l-card { background:${D.bodyBg} !important; color:${D.textColor} !important; }
    .l-text { color:${D.textColor} !important; }
    .l-muted { color:${D.mutedColor} !important; }
    .l-btn { background:${D.buttonBg} !important; color:${D.buttonText} !important; }
  }
</style>
</head>
<body id="body" class="body l-page" style="margin:0;padding:0;background:${D.pageBg};font-family:Arial,Helvetica,sans-serif;color:${D.textColor};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="l-page" bgcolor="${D.pageBg}" style="background:${D.pageBg};padding:40px 0;"><tr><td align="center">
  <table role="presentation" width="${D.containerWidth}" cellpadding="0" cellspacing="0" class="l-card" bgcolor="${D.bodyBg}" style="max-width:${D.containerWidth}px;width:100%;background:${D.bodyBg};box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">

    ${D.showGovBar ? `
    <tr><td style="background:${D.govBarBg};color:${D.govBarColor};padding:10px ${px}px;font-size:12px;letter-spacing:0.5px;font-family:Arial,sans-serif;">
      ${nl2br(S(D.govBarText || ''))}
    </td></tr>` : ''}
    <!-- Header -->
    <tr><td style="background:${D.headerBg};color:${D.headerText};padding:${D.headerPadding}px ${px}px;text-align:left;">
      ${D.showAvatar && D.avatarUrl ? `<div style="margin-bottom:16px;"><img src="${esc(D.avatarUrl)}" alt="" width="${D.avatarSize}" height="${D.avatarSize}" style="width:${D.avatarSize}px;height:${D.avatarSize}px;border-radius:50%;border:3px solid rgba(255,255,255,0.9);display:block;" /></div>` : ''}
      <div style="font-size:${D.logoSize}px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;opacity:0.95;margin-bottom:14px;">${logo}</div>
      <div style="font-size:${effectiveTitleSize}px;font-weight:800;line-height:1.2;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${title}</div>
      <div style="font-size:${D.subtitleSize}px;opacity:0.85;margin-top:12px;">${subtitle}</div>
    </td></tr>
    ${D.heroImageUrl ? `<tr><td style="padding:0;"><img src="${esc(D.heroImageUrl)}" alt="" style="display:block;width:100%;max-width:${D.containerWidth}px;height:auto;border:0;outline:none;text-decoration:none;" /></td></tr>` : ''}


    ${D.showHero ? `
    <tr><td style="padding:44px ${px}px 20px ${px}px;text-align:center;">
      <h2 style="font-size:${D.heroTitleSize}px;font-weight:800;color:${D.heroTitleColor};margin:0;line-height:1.25;">${heroTitle}</h2>
      <div style="width:48px;height:1px;background:#e5e7eb;margin:28px auto;"></div>
    </td></tr>` : ''}

    <tr><td style="padding:0 ${px}px 24px ${px}px;text-align:${align};font-size:${D.bodySize}px;line-height:1.6;color:${D.textColor};font-weight:700;">
      ${intro}
    </td></tr>

    ${D.showCard ? `
    <tr><td style="padding:0 ${px}px 28px ${px}px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${D.cardBg};border-radius:8px;padding:24px 26px;border:1px solid #e5e7eb;">
        ${rowsHtml}
      </table>
    </td></tr>` : ''}

    ${D.showWarning ? `
    <tr><td style="padding:0 ${px}px 32px ${px}px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${D.warningBg};border-left:4px solid ${D.warningBorder};padding:20px 22px;border-radius:4px;">
        <tr><td style="color:${D.warningTitleColor};font-size:${D.warningTitleSize || D.bodySize}px;font-weight:700;padding-bottom:10px;">${warningTitle}</td></tr>
        <tr><td style="color:${D.warningTextColor};font-size:${D.warningItemsSize || Math.max(13, D.bodySize - 2)}px;line-height:1.65;">${warningItems}</td></tr>

      </table>
    </td></tr>` : ''}

    <tr><td align="center" style="padding:0 ${px}px 44px ${px}px;">
      <a href="${buttonHref}" class="l-btn" style="display:inline-block;background:${D.buttonBg};color:${D.buttonText};text-decoration:none;padding:${D.buttonPaddingY}px ${D.buttonPaddingX}px;border-radius:${D.buttonRadius}px;font-weight:700;font-size:${D.buttonSize}px;box-shadow:0 4px 6px -1px rgba(11,30,63,0.25);white-space:nowrap;mso-padding-alt:0;line-height:1.2;">${buttonLabel}</a>
    </td></tr>

    ${D.showSignature ? `
    <tr><td style="padding:0 ${px}px 36px ${px}px;color:${D.mutedColor};font-size:${D.signatureSize || Math.max(13, D.bodySize - 2)}px;line-height:1.6;">
      ${signature}
    </td></tr>` : ''}

    ${D.showBadges && D.badgesText ? `
    <tr><td style="padding:20px ${px}px 8px ${px}px;text-align:center;">
      <div style="display:inline-block;font-size:11px;color:${D.mutedColor};letter-spacing:0.6px;text-transform:uppercase;font-weight:700;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:999px;padding:8px 16px;font-family:Arial,sans-serif;">
        <img src="${toAbsoluteUrl('/__l5e/assets-v1/6bf7fb2f-a72e-4a6e-8271-c7c1572cd687/gov-lock.png')}" alt="" width="14" height="14" style="width:14px;height:14px;vertical-align:-2px;margin-right:6px;border:0;display:inline-block;" />${esc(S(D.badgesText))}
      </div>
    </td></tr>` : ''}

    ${D.showFooter ? `
    <tr><td style="padding:24px 32px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
      <div style="color:${D.mutedColor};font-size:${D.disclaimerSize || 11}px;line-height:1.6;">
        ${disclaimer}
      </div>
    </td></tr>` : ''}

  </table>
</td></tr></table>
</body></html>`;
}

export function renderText(d: CampaignDesign, vars: Vars): string {
  const D: CampaignDesign = { ...DEFAULT_DESIGN, ...d };
  const S = (t: string) => substitute(t, vars);
  return [
    S(D.title),
    S(D.subtitle),
    '',
    S(D.intro),
    '',
    S(D.cardTitle),
    vars.NOME_TITULAR ? `- Nome: ${vars.NOME_TITULAR}` : '',
    vars.CNPJ ? `- CNPJ: ${formatCnpj(vars.CNPJ)}` : '',
    vars.DATA_ABERTURA ? `- Data de Abertura: ${vars.DATA_ABERTURA}` : '',
    vars.SITUACAO ? `- Situação: ${vars.SITUACAO}` : '',
    '',
    `${S(D.buttonLabel)}: ${S(D.buttonHref)}`,
    '',
    S(D.signature).replace(/\*\*/g, ''),
    '',
    S(D.disclaimer),
  ]
    .filter(Boolean)
    .join('\n');
}

export function rowToVars(row: Record<string, any>, sender: { name: string; company: string; reference: string }): Vars {
  const nomeEmpresarial = row.NOME_EMPRESARIAL || row.RAZAO_SOCIAL || '';
  const nomeTitular = row.NOME_TITULAR || nomeEmpresarial;

  return {
    NOME_EMPRESARIAL: cleanPersonName(nomeEmpresarial),
    RAZAO_SOCIAL: cleanPersonName(row.RAZAO_SOCIAL || ''),
    NOME_TITULAR: cleanPersonName(nomeTitular),
    CNPJ: row.CNPJ || '',
    DATA_ABERTURA: row.DATA_ABERTURA || '',
    DATA_SITUACAO: row.DATA_SITUACAO || '',
    SITUACAO: row.SITUACAO || '',
    MUNICIPIO: row.MUNICIPIO || '',
    UF: row.UF || '',
    EMAIL: row.EMAIL || '',
    LINK_PUBLICO: row.LINK_PUBLICO || '',
    LINK_CHECKOUT: row.LINK_CHECKOUT || '',
    TOKEN: row.TOKEN || '',
    REFERENCIA: sender.reference,
    NOME_REMETENTE: sender.name,
    EMPRESA_REMETENTE: sender.company,
  };
}
