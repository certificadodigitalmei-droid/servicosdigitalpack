/**
 * Verificação DNS do domínio de envio (Lovable Cloud → E-mails).
 * Usa DNS-over-HTTPS (Google) — funciona no runtime serverless.
 */

export const SENDER_DOMAIN = 'notify.digitalcertificaa1mei.online';

const DKIM_SELECTORS = [
  'lovable',
  'default',
  'smtp',
  'mailo',
  'k1',
  's1',
  's2',
  'mta',
  'pic',
  'krs',
];

export type DnsCheck = {
  ok: boolean;
  values: string[];
  message: string;
};

export type SenderDnsStatus = {
  domain: string;
  checkedAt: string;
  ns: DnsCheck;
  spf: DnsCheck;
  dkim: DnsCheck & { selector: string | null };
  mx: DnsCheck;
  allReady: boolean;
};

async function resolve(name: string, type: 'TXT' | 'NS' | 'MX'): Promise<string[]> {
  try {
    const res = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`,
      { headers: { accept: 'application/dns-json' } },
    );
    if (!res.ok) return [];
    const json: any = await res.json();
    const answers: any[] = Array.isArray(json?.Answer) ? json.Answer : [];
    return answers
      .map((a) => String(a?.data ?? '').replace(/^"|"$/g, '').replace(/" "/g, ''))
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function checkSenderDns(domain = SENDER_DOMAIN): Promise<SenderDnsStatus> {
  const [nsRecords, txtRecords, mxRecords] = await Promise.all([
    resolve(domain, 'NS'),
    resolve(domain, 'TXT'),
    resolve(domain, 'MX'),
  ]);

  const nsOk = nsRecords.some((r) => r.includes('lovable.cloud'));
  const spfValues = txtRecords.filter((r) => r.toLowerCase().startsWith('v=spf1'));
  const spfOk = spfValues.length > 0;

  let dkimSelector: string | null = null;
  let dkimValues: string[] = [];
  for (const sel of DKIM_SELECTORS) {
    const values = await resolve(`${sel}._domainkey.${domain}`, 'TXT');
    const found = values.filter((v) => v.toLowerCase().includes('p=') || v.toLowerCase().includes('v=dkim1'));
    if (found.length > 0) {
      dkimSelector = sel;
      dkimValues = found;
      break;
    }
  }

  const dkimOk = dkimValues.length > 0;

  return {
    domain,
    checkedAt: new Date().toISOString(),
    ns: {
      ok: nsOk,
      values: nsRecords,
      message: nsOk
        ? 'Delegação NS ativa para os servidores da Lovable.'
        : 'Registros NS da Lovable ainda não encontrados — a delegação pode levar até 72h para propagar.',
    },
    spf: {
      ok: spfOk,
      values: spfValues,
      message: spfOk
        ? 'SPF publicado e propagado — os servidores de envio estão autorizados.'
        : 'SPF ainda não propagado. Nenhum registro TXT "v=spf1" foi encontrado neste domínio; aguarde a propagação (até 72h) ou reveja a configuração em Cloud → E-mails.',
    },
    dkim: {
      ok: dkimOk,
      selector: dkimSelector,
      values: dkimValues,
      message: dkimOk
        ? `DKIM publicado e propagado (seletor "${dkimSelector}") — as mensagens são assinadas criptograficamente.`
        : nsOk
          ? 'Chave DKIM pública não localizada nos seletores conhecidos. Com a delegação NS ativa, a assinatura é gerenciada pela Lovable e normalmente já está ativa; se os e-mails chegarem sem assinatura, confira o status em Cloud → E-mails.'
          : 'DKIM ainda não propagado — a delegação NS precisa concluir antes que a chave apareça no DNS.',
    },
    mx: {
      ok: mxRecords.length > 0,
      values: mxRecords,
      message:
        mxRecords.length > 0
          ? 'MX publicado — retornos (bounces) chegam à infraestrutura de envio.'
          : 'MX ainda não propagado neste subdomínio.',
    },
    allReady: nsOk && spfOk,
  };
}
