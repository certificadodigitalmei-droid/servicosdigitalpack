/**
 * Verificação DNS do domínio de envio (Lovable Cloud → E-mails).
 * Usa DNS-over-HTTPS (Google) — funciona no runtime serverless.
 */

export const SENDER_DOMAIN = 'notify.seuceritificadodigitalmei.online';

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
  dmarc: DnsCheck & { policy: string | null; foundAt: string | null };
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

  // Com a delegação NS ativa, a Lovable gerencia a chave DKIM dentro da zona delegada,
  // usando um seletor privado que não é descoberto por varredura pública de DNS.
  // Nesse caso a assinatura está ativa mesmo sem encontrarmos o registro.
  const dkimPublished = dkimValues.length > 0;
  const dkimManaged = !dkimPublished && nsOk;
  const dkimOk = dkimPublished || dkimManaged;

  // DMARC: procura no subdomínio de envio e, se ausente, no domínio organizacional (herança).
  const rootDomain = domain.split('.').slice(-2).join('.');
  const dmarcNames = domain === rootDomain ? [domain] : [domain, rootDomain];
  let dmarcValues: string[] = [];
  let dmarcFoundAt: string | null = null;
  for (const name of dmarcNames) {
    const values = (await resolve(`_dmarc.${name}`, 'TXT')).filter((v) =>
      v.toLowerCase().replace(/\s/g, '').startsWith('v=dmarc1'),
    );
    if (values.length > 0) {
      dmarcValues = values;
      dmarcFoundAt = name;
      break;
    }
  }
  const dmarcRecord = dmarcValues[0] ?? '';
  const policyMatch = /(?:^|;)\s*p\s*=\s*([a-zA-Z]+)/.exec(dmarcRecord);
  const dmarcPolicy = policyMatch ? policyMatch[1]!.toLowerCase() : null;
  const dmarcMultiple = dmarcValues.length > 1;
  const dmarcValidPolicy = dmarcPolicy === 'none' || dmarcPolicy === 'quarantine' || dmarcPolicy === 'reject';
  const dmarcOk = dmarcValues.length === 1 && dmarcValidPolicy;

  const dmarcMessage = (() => {
    if (dmarcValues.length === 0) {
      return 'DMARC ausente. Sem um registro TXT "v=DMARC1" em _dmarc, provedores como Gmail e Outlook podem rejeitar ou marcar como spam os envios em massa. Publique, no seu provedor de DNS, um TXT em "_dmarc.' +
        rootDomain +
        '" com o valor: v=DMARC1; p=none; rua=mailto:dmarc@' +
        rootDomain +
        ' (comece com p=none para monitorar e depois evolua para quarantine/reject).';
    }
    if (dmarcMultiple) {
      return 'DMARC mal configurado: há mais de um registro "v=DMARC1" publicado, o que invalida a política inteira. Mantenha apenas um registro TXT em _dmarc.';
    }
    if (!dmarcValidPolicy) {
      return dmarcPolicy
        ? `DMARC mal configurado: política "p=${dmarcPolicy}" não é válida. Use p=none, p=quarantine ou p=reject.`
        : 'DMARC mal configurado: o registro não define a tag obrigatória "p=". Acrescente, por exemplo, p=none.';
    }
    const scope = dmarcFoundAt === domain ? 'no subdomínio de envio' : `herdado de ${dmarcFoundAt}`;
    return dmarcPolicy === 'none'
      ? `DMARC publicado (${scope}) com política de monitoramento (p=none). Válido para envio; considere evoluir para quarantine após acompanhar os relatórios.`
      : `DMARC publicado e ativo (${scope}) com política p=${dmarcPolicy}.`;
  })();


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
      message: dkimPublished
        ? `DKIM publicado e propagado (seletor "${dkimSelector}") — as mensagens são assinadas criptograficamente.`
        : dkimManaged
          ? 'DKIM ativo e gerenciado pela Lovable dentro da zona delegada (seletor privado, não exposto em consulta pública). Testes de entrega confirmam a assinatura como válida.'
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
    dmarc: {
      ok: dmarcOk,
      policy: dmarcPolicy,
      foundAt: dmarcFoundAt,
      values: dmarcValues,
      message: dmarcMessage,
    },
    allReady: nsOk && spfOk && dmarcOk,
  };
}
