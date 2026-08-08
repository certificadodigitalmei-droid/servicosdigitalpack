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
  logoText: 'Portal Certificado Digital MEI',
  logoSize: 12,
  headerBg: '#ffffff',
  headerText: '#111827',
  headerPadding: 24,

  bodyBg: '#ffffff',
  pageBg: '#ffffff',
  cardBg: '#ffffff',
  textColor: '#1f2937',
  mutedColor: '#6b7280',

  buttonBg: '#ffffff',
  buttonText: '#1a4a8a',
  buttonRadius: 0,
  buttonPaddingY: 0,
  buttonPaddingX: 0,
  buttonSize: 14,

  align: 'left',
  containerWidth: 600,
  contentPaddingX: 28,

  titleSize: 17,
  subtitleSize: 12,
  bodySize: 14,
  heroTitleSize: 16,
  heroTitleColor: '#111827',
  cardTitleSize: 11,
  cardBodySize: 13,
  warningTitleSize: 13,
  warningItemsSize: 13,

  signatureSize: 12,
  disclaimerSize: 11,

  title: 'Situação do CNPJ {{CNPJ}} — Certificado Digital',
  subtitle: 'Central de Emissão · MEI',
  heroTitle: '',
  showHero: false,
  intro:
    'Prezado(a) {{NOME_TITULAR}},\n\nNa consulta ao CNPJ {{CNPJ}}, não localizamos um Certificado Digital ativo.\n\nAbaixo estão os dados do cadastro:',
  cardTitle: 'Dados do requerente',
  showCard: true,
  buttonLabel: 'Ver a situação do meu CNPJ',
  buttonHref: '{{LINK_PUBLICO}}',

  showWarning: true,
  warningTitle: 'Pontos em aberto no cadastro',
  warningItems:
    'A emissão de nota fiscal pode ficar limitada sem o certificado ativo.\nA assinatura de contratos digitais com CNPJ pode ter validade limitada.\nO acesso a alguns sistemas do governo pode exigir o certificado digital.\nConsultas cadastrais podem apresentar o CNPJ com situação incompleta.',
  warningBg: '#f8fafc',
  warningBorder: '#e5e7eb',
  warningTitleColor: '#374151',
  warningTextColor: '#374151',

  showSignature: false,
  signature: '',

  footer: '',
  disclaimer:
    'Portal Certificado Digital MEI. Serviço privado de apoio ao MEI.\nMensagem automática — não responda a este e-mail.',
  showFooter: true,
  unsubText: 'Cancelar o recebimento destes avisos',
  unsubHref: '{{LINK_PUBLICO}}?unsubscribe=1',


  // Sem logo no topo: a imagem fica apenas na foto de perfil do remetente.
  showAvatar: false,
  avatarUrl: AVATAR_URL,
  avatarSize: 58,

  showGovBar: false,
  govBarText: 'Central de emissão · Protocolo {{REFERENCIA}}',
  govBarBg: '#f3f4f6',
  govBarColor: '#374151',

  showBadges: false,
  badgesText: '',

  showStatusBar: true,
  statusLabel: 'Situação do cadastro',
  statusValue: 'Pendente',
  statusNote: 'Certificado e-CNPJ não localizado.',

};




export const DEFAULT_SUBJECT = 'Situação do CNPJ {{CNPJ}} — Certificado Digital';
export const DEFAULT_PREHEADER =
  'Consulta ao CNPJ {{CNPJ}}: certificado digital não localizado.';


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

const EMAIL_SITE_ORIGIN = 'https://seu-certificado-mei-digital.online';
function toAbsoluteUrl(u?: string): string {
  if (!u) return '';
  const s = String(u).trim();
  if (!s) return '';
  if (/^(https?:|data:|cid:)/i.test(s)) return s;
  if (s.startsWith('//')) return `https:${s}`;
  if (s.startsWith('/')) return `${EMAIL_SITE_ORIGIN}${s}`;
  return `${EMAIL_SITE_ORIGIN}/${s}`;
}

function minifyHtml(html: string): string {
  return html
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\n\s*/g, '')
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ');
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
  const warningItemsList = String(S(D.warningItems) || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const warningItems = inlineFormat(S(D.warningItems));


  const align = D.align;
  const px = D.contentPaddingX;

  // Título: no desktop encolhe um pouco para caber bem; no celular quebra em linhas
  // (nunca corta com "..." e nunca estoura a largura da tela).
  const longestTitleLine = String(rawTitle || '')
    .split(/\r?\n/)
    .reduce((m, l) => (l.length > m.length ? l : m), '');
  const availableTitleWidth = Math.max(120, D.containerWidth - 2 * px);
  // Arial bold: ~0.58em por caractere. Deixa uma folga de 4px.
  const fitTitleSize = Math.floor((availableTitleWidth - 4) / Math.max(1, longestTitleLine.length * 0.58));
  const effectiveTitleSize = Math.max(15, Math.min(D.titleSize, fitTitleSize));
  const mobileTitleSize = Math.max(15, Math.min(20, effectiveTitleSize));


  const cardRows: Array<[string, string]> = ([
    ['Razão Social', vars.NOME_EMPRESARIAL || vars.NOME_TITULAR],
    ['CNPJ', formatCnpj(vars.CNPJ || '')],
    ['Protocolo', vars.REFERENCIA],
    ['Data de Abertura', vars.DATA_ABERTURA],
    ['Validade', 'Expirado'],
    ['Situação', vars.SITUACAO || 'Certificado Digital não localizado'],
  ] as Array<[string, string]>).filter(([, v]) => !!v);

  const keySize = (D.cardBodySize || D.bodySize) - 0.5;
  const rowsHtml = cardRows
    .map(([k, v], i) => {
      const last = i === cardRows.length - 1;
      const border = last ? '' : 'border-bottom:1px solid #e6eaef;';
      const isAlert = k === 'Situação' || k === 'Validade';
      const valStyle = isAlert
        ? `color:#d97706;font-weight:700;`
        : `color:${D.textColor};font-weight:700;`;
      const icon = isAlert
        ? `<span style="color:#d97706;font-weight:700;font-size:15px;">&#10007;</span>`
        : '<span style="color:#16a34a;font-weight:700;font-size:15px;">&#10003;</span>';
      return `<tr>
        <td class="rowKey" style="${border}padding:10px 16px;width:34%;font-family:Arial,sans-serif;font-size:${keySize}px;color:#64748b;vertical-align:top;line-height:1.45;">${esc(String(k))}</td>
        <td class="rowVal" style="${border}padding:10px 8px 10px 16px;font-family:Arial,sans-serif;font-size:${D.cardBodySize || D.bodySize}px;${valStyle}line-height:1.45;">${esc(String(v))}</td>
        <td style="${border}padding:10px 16px 10px 0;width:28px;text-align:right;vertical-align:middle;font-family:Arial,sans-serif;">${icon}</td>
      </tr>`;
    })
    .join('');




  return minifyHtml(`<!doctype html>
<html lang="pt-BR" dir="ltr"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light"/>
<meta name="supported-color-schemes" content="light"/>
<meta name="x-apple-disable-message-reformatting"/>
<meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no"/>
<title>${title}</title>
<style>
  :root { color-scheme: light; supported-color-schemes: light; }
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
  /* Celular: nada de texto cortado ou estourando a largura */
  @media only screen and (max-width:600px) {
    .l-title { font-size:${mobileTitleSize}px !important; line-height:1.3 !important; white-space:normal !important; }
    .l-logo { font-size:11px !important; letter-spacing:1px !important; }
    .l-sub { font-size:13px !important; }
    .l-pad { padding-left:18px !important; padding-right:18px !important; }
    .rowKey, .rowVal { display:block !important; width:auto !important; }
    .rowKey { padding:10px 14px 0 14px !important; border-bottom:0 !important; }
    .rowVal { padding:2px 14px 10px 14px !important; }
    .l-btn { display:block !important; width:auto !important; white-space:normal !important; font-size:15px !important; padding:14px 18px !important; }
  }
</style>
</head>
<body id="body" class="body l-page" style="margin:0;padding:0;background:${D.pageBg};font-family:Arial,Helvetica,sans-serif;color:${D.textColor};word-break:break-word;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="l-page" bgcolor="${D.pageBg}" style="background:${D.pageBg};padding:24px 0;"><tr><td align="center">
  <table role="presentation" width="${D.containerWidth}" cellpadding="0" cellspacing="0" class="l-card" bgcolor="${D.bodyBg}" style="max-width:${D.containerWidth}px;width:100%;background:${D.bodyBg};">

    ${D.showGovBar ? `
    <tr><td class="l-pad" style="background:${D.govBarBg};color:${D.govBarColor};padding:10px ${px}px;font-size:12px;font-family:Arial,sans-serif;">
      ${nl2br(S(D.govBarText || ''))}
    </td></tr>` : ''}
    <!-- Header -->
    <tr><td class="l-pad" style="background:${D.headerBg};color:${D.headerText};padding:${D.headerPadding}px ${px}px 12px ${px}px;text-align:left;border-bottom:1px solid #e5e7eb;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font-family:Arial,sans-serif;vertical-align:top;">
          <div class="l-logo" style="font-size:${D.logoSize}px;font-weight:700;color:${D.mutedColor};">${logo}</div>
        </td>
        ${vars.REFERENCIA ? `<td align="right" style="font-family:Arial,sans-serif;vertical-align:top;white-space:nowrap;">
          <div style="font-size:11px;color:${D.mutedColor};">Protocolo ${esc(String(vars.REFERENCIA))}</div>
        </td>` : ''}
      </tr></table>
      <div class="l-title" style="font-size:${effectiveTitleSize}px;font-weight:700;line-height:1.35;margin:12px 0 0 0;white-space:normal;word-break:break-word;color:${D.headerText};">${title}</div>
      <div class="l-sub" style="font-size:${D.subtitleSize}px;color:${D.mutedColor};margin:6px 0 12px 0;">${subtitle}</div>
    </td></tr>

    ${D.showStatusBar !== false ? `
    <tr><td class="l-pad" style="padding:16px ${px}px 0 ${px}px;font-family:Arial,sans-serif;">
      <div style="font-size:12px;color:${D.mutedColor};margin-bottom:4px;">${esc(S(D.statusLabel || 'Situação do cadastro'))}</div>
      <div style="font-size:14px;font-weight:700;color:${D.textColor};">${esc(S(D.statusValue || 'Pendente'))}</div>
      ${D.statusNote ? `<div style="font-size:12px;color:${D.mutedColor};margin-top:4px;line-height:1.5;">${esc(S(D.statusNote))}</div>` : ''}
    </td></tr>` : ''}




    ${D.showHero && String(heroTitle).trim() ? `
    <tr><td class="l-pad" style="padding:20px ${px}px 0 ${px}px;text-align:left;">
      <h2 style="font-size:${D.heroTitleSize}px;font-weight:700;color:${D.heroTitleColor};margin:0;line-height:1.35;">${heroTitle}</h2>
    </td></tr>` : ''}

    <tr><td class="l-pad" style="padding:20px ${px}px 20px ${px}px;text-align:${align};font-size:${D.bodySize}px;line-height:1.65;color:${D.textColor};">
      ${intro}
    </td></tr>

    ${D.showCard ? `
    <tr><td class="l-pad" style="padding:0 ${px}px 24px ${px}px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="background:#ffffff;border:1px solid #e5e7eb;border-collapse:separate;">
        <tr><td colspan="3" bgcolor="#f9fafb" style="background:#f9fafb;border-bottom:1px solid #e5e7eb;padding:9px 16px;font-family:Arial,sans-serif;font-size:12px;font-weight:700;color:#4b5563;">${cardTitle}</td></tr>
        ${rowsHtml}
      </table>
    </td></tr>` : ''}

    ${D.showWarning ? `
    <tr><td class="l-pad" style="padding:0 ${px}px 24px ${px}px;">
      <div style="font-family:Arial,sans-serif;font-size:${D.warningTitleSize || 13}px;font-weight:700;color:${D.textColor};margin-bottom:8px;">${warningTitle}</div>
      ${warningItemsList.map((item) => `
        <div style="font-family:Arial,sans-serif;color:${D.textColor};font-size:${D.warningItemsSize || 13}px;line-height:1.6;padding:2px 0;">&#8226;&nbsp;${inlineFormat(item)}</div>`).join('')}
    </td></tr>` : ''}


    <tr><td class="l-pad" style="padding:0 ${px}px 28px ${px}px;font-family:Arial,sans-serif;font-size:${D.bodySize}px;line-height:1.6;color:${D.textColor};">
      ${buttonLabel}:<br/>
      <a href="${buttonHref}" class="l-btn" style="color:#1a4a8a;text-decoration:underline;word-break:break-all;">${buttonHref}</a>
    </td></tr>

    ${D.showSignature ? `
    <tr><td class="l-pad" style="padding:0 ${px}px 28px ${px}px;color:${D.mutedColor};font-size:${D.signatureSize || Math.max(13, D.bodySize - 2)}px;line-height:1.6;">
      ${signature}
    </td></tr>` : ''}



    ${D.showFooter ? `
    <tr><td class="l-pad" style="padding:24px 32px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
      <div style="color:${D.mutedColor};font-size:${D.disclaimerSize || 11}px;line-height:1.6;">
        ${disclaimer}
      </div>
      ${D.unsubText ? `<div style="margin-top:10px;font-size:${(D.disclaimerSize || 11)}px;line-height:1.6;">
        <a href="${esc(S(D.unsubHref || '#'))}" style="color:${D.mutedColor};text-decoration:underline;">${esc(S(D.unsubText))}</a>
      </div>` : ''}
    </td></tr>` : ''}

  </table>
</td></tr></table>
</body></html>`);
}

export function renderText(d: CampaignDesign, vars: Vars): string {
  const D: CampaignDesign = { ...DEFAULT_DESIGN, ...d };
  const S = (t: string) => substitute(t, vars);
  return [
    S(D.title),
    S(D.subtitle),
    '',
    `${S(D.statusLabel || 'SITUAÇÃO DO CADASTRO')}: ${S(D.statusValue || 'PENDENTE')}`,

    '',
    S(D.intro),
    '',
    S(D.heroTitle),
    '',
    S(D.cardTitle),
    vars.NOME_EMPRESARIAL ? `- Razão Social: ${vars.NOME_EMPRESARIAL}` : '',
    vars.NOME_TITULAR ? `- Nome: ${vars.NOME_TITULAR}` : '',
    vars.REFERENCIA ? `- Protocolo: ${vars.REFERENCIA}` : '',
    vars.CNPJ ? `- CNPJ: ${formatCnpj(vars.CNPJ)}` : '',
    vars.DATA_ABERTURA ? `- Data de Abertura: ${vars.DATA_ABERTURA}` : '',
    vars.SITUACAO ? `- Situação: ${vars.SITUACAO}` : '',
    '',
    S(D.warningTitle),
    ...String(S(D.warningItems) || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => `- ${l}`),
    '',
    `${S(D.buttonLabel)}: ${S(D.buttonHref)}`,
    '',
    S(D.badgesText || ''),
    '',
    S(D.signature).replace(/\*\*/g, '').replace(/[*_~]/g, ''),
    '',
    S(D.disclaimer),
    D.unsubText ? `${S(D.unsubText)}: ${S(D.unsubHref || '')}` : '',
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
