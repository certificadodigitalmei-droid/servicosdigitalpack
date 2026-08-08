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
  warningTitleSize: 14,
  warningItemsSize: 13,

  signatureSize: 12,
  disclaimerSize: 11,

  title: 'CNPJ com restrição · pendente',
  subtitle: 'Central de Emissão · MEI',
  heroTitle: 'Certificado Digital pendente',
  showHero: true,
  intro:
    'Prezado(a) *{{NOME_TITULAR}}*,\n\nSeu CNPJ consta como *pendente*: sem Certificado Digital ativo.\n\nVerifique a situação do cadastro abaixo:',
  cardTitle: 'Dados do requerente',
  showCard: true,
  buttonLabel: 'Regularizar meu CNPJ',
  buttonHref: '{{LINK_PUBLICO}}',

  showWarning: true,
  warningTitle: 'Atenção · pontos em aberto no seu CNPJ',
  warningItems:
    'Impossibilitado de emitir nota fiscal (NFS-e).\nImpossibilitado de assinar contratos digitais e físicos com CNPJ.\nLimites de crédito empresarial podem ficar restritos em bancos e financeiras PJ.\nA regularidade do CNPJ perante a Receita Federal pode ser afetada.\nO acesso a alguns sistemas do governo pode exigir o certificado digital.\nConsultas cadastrais podem apresentar o CNPJ com situação incompleta.',
  warningBg: '#fff8ed',
  warningBorder: '#b45309',
  warningTitleColor: '#7c2d12',
  warningTextColor: '#78350f',

  showSignature: false,
  signature: '',

  footer: '',
  disclaimer:
    'Portal Certificado Digital MEI. Serviço privado de apoio ao MEI.\nAutomated message — do not reply.\nIf you no longer wish to receive these notices, unsubscribe below.',
  showFooter: true,
  unsubText: 'unsubscribe',
  unsubHref: '{{LINK_PUBLICO}}?unsubscribe=1',


  // Sem logo no topo: a imagem fica apenas na foto de perfil do remetente.
  showAvatar: false,
  avatarUrl: AVATAR_URL,
  avatarSize: 58,

  showGovBar: true,
  govBarText: 'Central de emissão · Protocolo {{REFERENCIA}}',
  govBarBg: '#f2c200',
  govBarColor: '#4a3800',

  showBadges: true,
  badgesText: 'SSL 256-bits · LGPD · Validade 12 meses',

  showStatusBar: true,
  statusLabel: 'Situação do cadastro',
  statusValue: 'Pendente',
  statusNote: 'Certificado e-CNPJ não localizado.',

};



export const DEFAULT_SUBJECT = 'Restrição no seu CNPJ MEI — regularização pendente';
export const DEFAULT_PREHEADER =
  'Verificação de restituição e pendências para o CNPJ {{CNPJ}}.';

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
        ? `color:${D.warningTitleColor};font-weight:700;`
        : `color:${D.textColor};font-weight:700;`;
      const icon = isAlert
        ? `<span style="color:${D.warningTitleColor};font-weight:700;font-size:15px;">&#10007;</span>`
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
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="l-page" bgcolor="${D.pageBg}" style="background:${D.pageBg};padding:40px 0;"><tr><td align="center">
  <table role="presentation" width="${D.containerWidth}" cellpadding="0" cellspacing="0" class="l-card" bgcolor="${D.bodyBg}" style="max-width:${D.containerWidth}px;width:100%;background:${D.bodyBg};box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">

    ${D.showGovBar ? `
    <tr><td class="l-pad" style="background:${D.govBarBg};color:${D.govBarColor};padding:10px ${px}px;font-size:12px;letter-spacing:0.5px;text-transform:uppercase;font-family:Arial,sans-serif;">
      ${nl2br(S(D.govBarText || ''))}
    </td></tr>` : ''}
    <!-- Header -->
    <tr><td class="l-pad" style="background:${D.headerBg};color:${D.headerText};padding:${D.headerPadding}px ${px}px;text-align:left;">
      ${D.showAvatar && D.avatarUrl ? `<div style="margin-bottom:16px;"><img src="${esc(D.avatarUrl)}" alt="" width="${D.avatarSize}" height="${D.avatarSize}" bgcolor="#ffffff" style="width:${D.avatarSize}px;height:${D.avatarSize}px;border-radius:50%;border:3px solid #ffffff;display:block;background:#ffffff;background-color:#ffffff;" /></div>` : ''}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font-family:Arial,sans-serif;vertical-align:top;">
          <div class="l-logo" style="font-size:${D.logoSize}px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;opacity:0.95;">${logo}</div>
        </td>
        ${vars.REFERENCIA ? `<td align="right" style="font-family:Arial,sans-serif;vertical-align:top;white-space:nowrap;">
          <div style="font-size:9px;letter-spacing:1.2px;color:#9fbad8;">PROTOCOLO</div>
          <div style="font-size:11.5px;font-weight:700;color:#ffffff;margin-top:2px;">${esc(String(vars.REFERENCIA))}</div>
        </td>` : ''}
      </tr></table>
      <div style="height:1px;background:rgba(255,255,255,0.18);margin:14px 0;line-height:1px;font-size:1px;">&nbsp;</div>
      <div class="l-title" style="text-transform:uppercase;font-size:${effectiveTitleSize}px;font-weight:800;line-height:1.25;margin:0;white-space:normal;word-break:break-word;color:#d97706;">${title}</div>
      <div class="l-sub" style="font-size:${D.subtitleSize}px;opacity:0.85;margin-top:10px;">${subtitle}</div>
    </td></tr>
    ${D.heroImageUrl ? `<tr><td style="padding:0;"><img src="${esc(D.heroImageUrl)}" alt="" style="display:block;width:100%;max-width:${D.containerWidth}px;height:auto;border:0;outline:none;text-decoration:none;" /></td></tr>` : ''}

    ${D.showStatusBar !== false ? `
    <tr><td style="padding:0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#fffbeb" style="background:#fffbeb;border-bottom:1px solid #d97706;">
        <tr><td class="l-pad" style="padding:14px ${px}px;font-family:Arial,sans-serif;">
          <div style="font-size:10px;letter-spacing:1.2px;color:#92400e;font-weight:700;margin-bottom:6px;text-transform:uppercase;">${esc(S(D.statusLabel || 'Situação do cadastro'))}</div>
          <div style="font-size:16px;font-weight:800;color:#92400e;letter-spacing:0.5px;text-transform:uppercase;">
            <span style="display:inline-block;width:9px;height:9px;background:#d97706;border-radius:50%;vertical-align:middle;margin-right:8px;"></span>${esc(S(D.statusValue || 'Pendente'))}
          </div>
          ${D.statusNote ? `<div style="font-size:11.5px;color:#78350f;margin-top:6px;line-height:1.5;">${esc(S(D.statusNote))}</div>` : ''}
        </td></tr>
      </table>
    </td></tr>` : ''}


    ${D.showHero ? `
    <tr><td class="l-pad" style="padding:44px ${px}px 20px ${px}px;text-align:center;">
      <h2 style="font-size:${D.heroTitleSize}px;font-weight:800;color:${D.heroTitleColor};margin:0;line-height:1.25;">${heroTitle}</h2>
      <div style="width:48px;height:1px;background:#e5e7eb;margin:28px auto;"></div>
    </td></tr>` : ''}

    <tr><td class="l-pad" style="padding:0 ${px}px 24px ${px}px;text-align:${align};font-size:${D.bodySize}px;line-height:1.6;color:${D.textColor};font-weight:700;">
      ${intro}
    </td></tr>

    ${D.showCard ? `
    <tr><td class="l-pad" style="padding:0 ${px}px 28px ${px}px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="background:#ffffff;border:1px solid #dfe4ea;border-radius:6px;border-collapse:separate;">
        <tr><td colspan="2" bgcolor="#f4f7f9" style="background:#f4f7f9;border-bottom:1px solid #dfe4ea;padding:9px 16px;font-family:Arial,sans-serif;font-size:10px;letter-spacing:1.2px;text-transform:uppercase;font-weight:700;color:#5b6b7b;border-radius:6px 6px 0 0;">${cardTitle}</td></tr>
        ${rowsHtml}
      </table>
    </td></tr>` : ''}

    ${D.showWarning ? `
    <tr><td class="l-pad" style="padding:0 ${px}px 30px ${px}px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#fffbeb" style="background:#fffbeb;background-color:#fffbeb;border:1px solid #d97706;border-left:5px solid #d97706;border-radius:6px;">
        <tr><td style="padding:16px 22px 8px 22px;font-family:Arial,sans-serif;">
          <div style="color:#92400e;font-size:${D.warningTitleSize || 14}px;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;line-height:1.35;">
            <span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;background:#d97706;color:#ffffff;border-radius:50%;font-size:13px;font-weight:900;margin-right:8px;vertical-align:middle;">!</span>${warningTitle}
          </div>
        </td></tr>
        <tr><td style="padding:6px 22px 18px 22px;font-family:Arial,sans-serif;">
          ${warningItemsList.map((item) => `
            <div style="color:#78350f;font-size:${D.warningItemsSize || 13}px;line-height:1.6;font-weight:700;padding:6px 0;border-top:1px dashed #e5e7eb;">
              <span style="color:#d97706;font-weight:900;margin-right:8px;">✕</span>${inlineFormat(item)}
            </div>`).join('')}
        </td></tr>
      </table>
    </td></tr>` : ''}


    <tr><td align="center" class="l-pad" style="padding:0 ${px}px 44px ${px}px;">
      <a href="${buttonHref}" class="l-btn" style="display:inline-block;background:${D.buttonBg};color:${D.buttonText};text-decoration:none;padding:${D.buttonPaddingY}px ${D.buttonPaddingX}px;border-radius:${D.buttonRadius}px;text-transform:uppercase;font-weight:700;font-size:${D.buttonSize}px;box-shadow:0 4px 6px -1px rgba(11,30,63,0.25);white-space:normal;mso-padding-alt:0;line-height:1.2;">${buttonLabel}</a>
    </td></tr>

    ${D.showSignature ? `
    <tr><td class="l-pad" style="padding:0 ${px}px 36px ${px}px;color:${D.mutedColor};font-size:${D.signatureSize || Math.max(13, D.bodySize - 2)}px;line-height:1.6;">
      ${signature}
    </td></tr>` : ''}

    ${D.showBadges && D.badgesText ? `
    <tr><td class="l-pad" style="padding:20px ${px}px 8px ${px}px;text-align:center;">
      <div style="display:inline-block;font-size:11px;color:${D.mutedColor};letter-spacing:0.6px;text-transform:uppercase;font-weight:700;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:999px;padding:8px 16px;font-family:Arial,sans-serif;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;vertical-align:-2px;margin-right:6px;display:inline-block;color:#16a34a;" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>${esc(S(D.badgesText))}
      </div>
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
