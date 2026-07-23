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
};


export const DEFAULT_DESIGN: CampaignDesign = {
  logoText: 'CERTIFICADO DIGITAL MEI',
  logoSize: 13,
  headerBg: '#0b1e3f',
  headerText: '#ffffff',
  headerPadding: 36,

  bodyBg: '#ffffff',
  pageBg: '#f3f4f6',
  cardBg: '#f8fafc',
  textColor: '#1f2937',
  mutedColor: '#64748b',

  buttonBg: '#0b1e3f',
  buttonText: '#ffffff',
  buttonRadius: 999,
  buttonPaddingY: 16,
  buttonPaddingX: 44,
  buttonSize: 17,

  align: 'left',
  containerWidth: 640,
  contentPaddingX: 36,

  titleSize: 28,
  subtitleSize: 14,
  bodySize: 17,
  heroTitleSize: 26,
  heroTitleColor: '#0b1e3f',

  title: 'Informação cadastral - {{NOME_TITULAR}}',
  subtitle: 'Referência: {{REFERENCIA}}',
  heroTitle: 'Certificado Digital\ndisponível para seu CNPJ',
  showHero: true,
  intro: '{{NOME_TITULAR}},\n\nDados do cadastro:',
  cardTitle: 'Dados do cadastro:',
  showCard: true,
  buttonLabel: 'Finalizar Certificado Digital MEI',
  buttonHref: '{{LINK_PUBLICO}}',

  showWarning: true,
  warningTitle: 'MEIs sem Certificado Digital:',
  warningItems:
    'Não conseguem emitir Nota Fiscal Eletrônica (NF-e)\nFicam impedidos de assinar contratos digitais\nEstão sujeitos a penalidades e restrições da Receita Federal',
  warningBg: '#fef2f2',
  warningBorder: '#ef4444',
  warningTitleColor: '#b91c1c',
  warningTextColor: '#4b5563',

  showSignature: true,
  signature:
    'Atenciosamente,\n**Central de Atendimento**\nCertificado Digital MEI',

  footer: 'Atenciosamente,\nCentral de Atendimento\nCertificado Digital MEI',
  disclaimer:
    'Você recebeu este e-mail pois seu CNPJ consta em nossa base de cadastros MEI.',
  showFooter: true,
  unsubText: '',
  unsubHref: '#',

  showAvatar: true,
  avatarUrl: govbrAvatarAsset.url,
  avatarSize: 68,

  showGovBar: false,
  govBarText: 'gov.br  ›  Portal do Empreendedor  ›  Certificado Digital MEI',
  govBarBg: '#071d40',
  govBarColor: '#c9d5ec',

  showBadges: true,
  badgesText: 'Portal gov.br  ·  Site Seguro (SSL)  ·  Receita Federal  ·  Dados Protegidos (LGPD)',
};


export const DEFAULT_SUBJECT = '{{NOME_TITULAR}}, atualização pendente do seu CNPJ';
export const DEFAULT_PREHEADER =
  'Verifique os dados do CNPJ {{CNPJ}} e finalize seu Certificado Digital MEI.';

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

export function renderHtml(d: CampaignDesign, vars: Vars): string {
  // Merge com defaults para não quebrar quando o design salvo estiver antigo.
  const D: CampaignDesign = { ...DEFAULT_DESIGN, ...d };
  // Normaliza URLs de imagem para absolutas (clientes de e-mail não resolvem caminhos relativos).
  D.heroImageUrl = toAbsoluteUrl(D.heroImageUrl);
  D.avatarUrl = toAbsoluteUrl(D.avatarUrl);
  const S = (t: string) => substitute(t, vars);
  const title = esc(S(D.title));
  const subtitle = esc(S(D.subtitle));
  const intro = inlineFormat(S(D.intro));
  const cardTitle = esc(S(D.cardTitle));
  const buttonLabel = esc(S(D.buttonLabel));
  const buttonHref = esc(S(D.buttonHref));
  const disclaimer = inlineFormat(S(D.disclaimer));
  const signature = inlineFormat(S(D.signature));
  const logo = esc(S(D.logoText));
  const heroTitle = inlineFormat(S(D.heroTitle));
  const warningTitle = esc(S(D.warningTitle));
  const warningItems = inlineFormat(S(D.warningItems));
  const align = D.align;
  const px = D.contentPaddingX;

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
      return `<tr><td style="padding:8px 0;color:${D.textColor};font-size:${D.bodySize}px;line-height:1.5;font-family:Arial,sans-serif;"><strong>&bull; ${esc(String(k))}:</strong> <span style="${valueStyle}">${esc(String(v))}</span></td></tr>`;
    })
    .join('');

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title></head>
<body style="margin:0;padding:0;background:${D.pageBg};font-family:Arial,Helvetica,sans-serif;color:${D.textColor};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${D.pageBg};padding:40px 0;"><tr><td align="center">
  <table role="presentation" width="${D.containerWidth}" cellpadding="0" cellspacing="0" style="max-width:${D.containerWidth}px;width:100%;background:${D.bodyBg};box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
    ${D.showGovBar ? `
    <tr><td style="background:${D.govBarBg};color:${D.govBarColor};padding:10px ${px}px;font-size:12px;letter-spacing:0.5px;font-family:Arial,sans-serif;">
      ${esc(S(D.govBarText || ''))}
    </td></tr>` : ''}
    <!-- Header -->
    <tr><td style="background:${D.headerBg};color:${D.headerText};padding:${D.headerPadding}px ${px}px;text-align:left;">
      ${D.showAvatar && D.avatarUrl ? `<div style="margin-bottom:16px;"><img src="${esc(D.avatarUrl)}" alt="" width="${D.avatarSize}" height="${D.avatarSize}" style="width:${D.avatarSize}px;height:${D.avatarSize}px;border-radius:50%;border:3px solid rgba(255,255,255,0.9);display:block;" /></div>` : ''}
      <div style="font-size:${D.logoSize}px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;opacity:0.95;margin-bottom:14px;">${logo}</div>
      <div style="font-size:${D.titleSize}px;font-weight:800;line-height:1.2;margin:0;">${title}</div>
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
        <tr><td style="color:${D.warningTitleColor};font-size:${D.bodySize}px;font-weight:700;padding-bottom:10px;">${warningTitle}</td></tr>
        <tr><td style="color:${D.warningTextColor};font-size:${Math.max(13, D.bodySize - 2)}px;line-height:1.65;">${warningItems}</td></tr>
      </table>
    </td></tr>` : ''}

    <tr><td align="center" style="padding:0 ${px}px 44px ${px}px;">
      <a href="${buttonHref}" style="display:inline-block;background:${D.buttonBg};color:${D.buttonText};text-decoration:none;padding:${D.buttonPaddingY}px ${D.buttonPaddingX}px;border-radius:${D.buttonRadius}px;font-weight:700;font-size:${D.buttonSize}px;box-shadow:0 4px 6px -1px rgba(11,30,63,0.25);white-space:nowrap;mso-padding-alt:0;line-height:1.2;">${buttonLabel}</a>
    </td></tr>

    ${D.showSignature ? `
    <tr><td style="padding:0 ${px}px 36px ${px}px;color:${D.mutedColor};font-size:${Math.max(13, D.bodySize - 2)}px;line-height:1.6;">
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
      <div style="color:${D.mutedColor};font-size:11px;line-height:1.6;">
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
