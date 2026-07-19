export type CampaignDesign = {
  logoText: string;
  logoUrl?: string;
  headerBg: string;
  headerText: string;
  bodyBg: string;
  cardBg: string;
  textColor: string;
  mutedColor: string;
  buttonBg: string;
  buttonText: string;
  align: 'left' | 'center';
  titleSize: number;
  bodySize: number;
  title: string;
  subtitle: string;
  intro: string;
  cardTitle: string;
  buttonLabel: string;
  buttonHref: string;
  footer: string;
  disclaimer: string;
  unsubText: string;
  unsubHref: string;
};

export const DEFAULT_DESIGN: CampaignDesign = {
  logoText: 'CERTIFICADO DIGITAL MEI',
  headerBg: '#0b1e3f',
  headerText: '#ffffff',
  bodyBg: '#ffffff',
  cardBg: '#f5f7fb',
  textColor: '#1f2937',
  mutedColor: '#6b7280',
  buttonBg: '#0b1e3f',
  buttonText: '#ffffff',
  align: 'left',
  titleSize: 22,
  bodySize: 15,
  title: 'Informação cadastral - {{NOME_EMPRESARIAL}}',
  subtitle: 'Referência: {{REFERENCIA}}',
  intro:
    '{{NOME_TITULAR}},\n\nIdentificamos que seu CNPJ está em nossa base de cadastros MEI. Verifique abaixo os dados e finalize a atualização, se necessário.',
  cardTitle: 'Dados do cadastro',
  buttonLabel: 'Finalizar Certificado Digital MEI',
  buttonHref: '{{LINK_PUBLICO}}',
  footer: 'Central de Atendimento — Certificado Digital MEI',
  disclaimer:
    'Serviço privado e opcional. Não somos vinculados a órgãos públicos. Você recebeu este e-mail pois seu CNPJ consta em nossa base de cadastros MEI.',
  unsubText: 'clique aqui',
  unsubHref: '#',
};

export const DEFAULT_SUBJECT = '{{NOME_TITULAR}}, atualização pendente do seu CNPJ';
export const DEFAULT_PREHEADER =
  'Verifique os dados do CNPJ {{CNPJ}} e finalize seu Certificado Digital MEI.';

export type Vars = Record<string, string>;

export function substitute(tpl: string, vars: Vars): string {
  return String(tpl || '').replace(/\{\{\s*([A-Z_]+)\s*\}\}/g, (_, k) => {
    const v = vars[k];
    return v == null || v === '' ? '' : String(v);
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

export function renderHtml(d: CampaignDesign, vars: Vars): string {
  const S = (t: string) => substitute(t, vars);
  const title = esc(S(d.title));
  const subtitle = esc(S(d.subtitle));
  const intro = nl2br(S(d.intro));
  const cardTitle = esc(S(d.cardTitle));
  const buttonLabel = esc(S(d.buttonLabel));
  const buttonHref = esc(S(d.buttonHref));
  const footer = nl2br(S(d.footer));
  const disclaimer = nl2br(S(d.disclaimer));
  const logo = esc(S(d.logoText));
  const align = d.align;

  const rowsHtml = [
    ['Nome', vars.NOME_TITULAR || vars.NOME_EMPRESARIAL],
    ['CNPJ', vars.CNPJ],
    ['Situação', vars.SITUACAO || 'CNPJ sem certificado ativo'],
  ]
    .filter(([, v]) => v)
    .map(
      ([k, v]) => {
        const isSituacao = k === 'Situação';
        const valueStyle = isSituacao && String(v).toLowerCase().includes('sem certificado') 
          ? 'color:#dc2626;font-weight:700;' 
          : `color:${d.textColor};`;
        return `<tr><td style="padding:6px 0;color:${d.textColor};font-size:${d.bodySize}px;font-family:Arial,sans-serif;"><strong>&bull; ${esc(String(k))}:</strong> <span style="${valueStyle}">${esc(String(v))}</span></td></tr>`;
      }
    )
    .join('');

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:${d.textColor};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 0;"><tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
    <!-- Header -->
    <tr><td style="background:${d.headerBg};color:${d.headerText};padding:32px;text-align:left;">
      <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;opacity:0.9;margin-bottom:8px;">${logo}</div>
      <div style="font-size:${d.titleSize}px;font-weight:700;line-height:1.2;margin:0;">${title}</div>
      <div style="font-size:12px;opacity:0.8;margin-top:8px;">${subtitle}</div>
    </td></tr>
    
    <!-- Hero Title -->
    <tr><td style="padding:40px 32px 20px 32px;text-align:center;">
      <h2 style="font-size:20px;font-weight:700;color:${d.headerBg};margin:0;">Certificado Digital<br/>disponível para seu CNPJ</h2>
      <div style="width:40px;height:1px;background:#e5e7eb;margin:24px auto;"></div>
    </td></tr>

    <!-- Intro Body -->
    <tr><td style="padding:0 32px 24px 32px;text-align:${align};font-size:${d.bodySize}px;line-height:1.6;color:${d.textColor};">
      ${intro}
    </td></tr>

    <!-- Data Card -->
    <tr><td style="padding:0 32px 24px 32px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${d.cardBg};border-radius:6px;padding:24px;border:1px solid #e5e7eb;">
        <tr><td style="font-weight:700;color:${d.mutedColor};font-size:13px;text-transform:uppercase;letter-spacing:0.5px;padding-bottom:12px;">${cardTitle}</td></tr>
        ${rowsHtml}
      </table>
    </td></tr>

    <!-- Warning Box -->
    <tr><td style="padding:0 32px 32px 32px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border-left:4px solid #ef4444;padding:16px;">
        <tr><td style="color:#b91c1c;font-size:14px;font-weight:700;padding-bottom:8px;">MEIs sem Certificado Digital:</td></tr>
        <tr><td style="color:#4b5563;font-size:13px;line-height:1.5;">
          Não conseguem emitir Nota Fiscal Eletrônica (NF-e)<br/>
          Ficam impedidos de assinar contratos digitais<br/>
          Estão sujeitos a penalidades e restrições da Receita Federal
        </td></tr>
      </table>
    </td></tr>

    <!-- Button -->
    <tr><td align="center" style="padding:0 32px 40px 32px;">
      <a href="${buttonHref}" style="display:inline-block;background:${d.buttonBg};color:${d.buttonText};text-decoration:none;padding:14px 40px;border-radius:999px;font-weight:700;font-size:15px;box-shadow:0 4px 6px -1px rgba(11,30,63,0.2);">${buttonLabel}</a>
    </td></tr>

    <!-- Signature -->
    <tr><td style="padding:0 32px 32px 32px;color:#4b5563;font-size:14px;line-height:1.5;">
      Atenciosamente,<br/>
      <strong>Central de Atendimento</strong><br/>
      Certificado Digital MEI
    </td></tr>

    <!-- Footer -->
    <tr><td style="padding:32px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
      <div style="color:${d.mutedColor};font-size:11px;line-height:1.6;margin-bottom:12px;">
        ${disclaimer}
      </div>
      <div style="color:${d.mutedColor};font-size:11px;">
        Para não receber mais comunicações, <a href="${esc(S(d.unsubHref))}" style="color:${d.headerBg};text-decoration:underline;">${esc(S(d.unsubText))}</a>.
      </div>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

export function renderText(d: CampaignDesign, vars: Vars): string {
  const S = (t: string) => substitute(t, vars);
  return [
    S(d.title),
    S(d.subtitle),
    '',
    S(d.intro),
    '',
    S(d.cardTitle),
    vars.NOME_TITULAR ? `- Nome: ${vars.NOME_TITULAR}` : '',
    vars.CNPJ ? `- CNPJ: ${vars.CNPJ}` : '',
    vars.SITUACAO ? `- Situação: ${vars.SITUACAO}` : '',
    '',
    `${S(d.buttonLabel)}: ${S(d.buttonHref)}`,
    '',
    S(d.footer),
    '',
    S(d.disclaimer),
  ]
    .filter(Boolean)
    .join('\n');
}

export function rowToVars(row: Record<string, any>, sender: { name: string; company: string; reference: string }): Vars {
  return {
    NOME_EMPRESARIAL: row.NOME_EMPRESARIAL || row.RAZAO_SOCIAL || '',
    RAZAO_SOCIAL: row.RAZAO_SOCIAL || '',
    NOME_TITULAR: row.NOME_TITULAR || row.NOME_EMPRESARIAL || '',
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
