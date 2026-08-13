// Varredura ANTES de qualquer envio.
// Objetivo: reduzir bounces ao máximo. Quando o endereço apresenta risco,
// o e-mail NÃO é enviado, a importação e os links daquela empresa são
// apagados e o endereço/CNPJ entra na lista de supressão para nunca mais
// ser importado ou enviado novamente.

import { validateEmailForSending } from '@/lib/email-validation';

export type RiskVerdict = {
  ok: boolean;
  email: string;
  reason?: string;
  code?: 'invalid' | 'disposable' | 'typo' | 'no_mx' | 'suppressed' | 'role' | 'dead_mx';
};

/** Domínios digitados errado com frequência (bounce garantido). */
const TYPO_DOMAINS: Record<string, string> = {
  'gmail.con': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.cm': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gmail.com.br': 'gmail.com',
  'hotmai.com': 'hotmail.com',
  'hotmail.con': 'hotmail.com',
  'hotmial.com': 'hotmail.com',
  'hotmail.co': 'hotmail.com',
  'outlok.com': 'outlook.com',
  'outlook.con': 'outlook.com',
  'yaho.com': 'yahoo.com',
  'yahoo.con': 'yahoo.com',
  'bol.com': 'bol.com.br',
  'uol.com': 'uol.com.br',
  'terra.com': 'terra.com.br',
  'iclod.com': 'icloud.com',
  'icloud.con': 'icloud.com',
};

/** Provedores conhecidos — dispensam consulta de DNS. */
const TRUSTED_DOMAINS = new Set([
  'gmail.com',
  'hotmail.com',
  'outlook.com',
  'outlook.com.br',
  'live.com',
  'msn.com',
  'yahoo.com',
  'yahoo.com.br',
  'icloud.com',
  'me.com',
  'bol.com.br',
  'uol.com.br',
  'terra.com.br',
  'globo.com',
  'ig.com.br',
  'r7.com',
  'zipmail.com.br',
]);

/**
 * Caixas genéricas/automáticas: ninguém lê, muitas rejeitam por política e
 * várias são armadilhas de spam (spam traps). Bounce e reclamação altíssimos.
 */
const ROLE_LOCALPARTS = new Set([
  'noreply',
  'no-reply',
  'nao-responda',
  'naoresponda',
  'postmaster',
  'abuse',
  'spam',
  'devnull',
  'nobody',
  'root',
  'webmaster',
  'hostmaster',
  'mailer-daemon',
  'bounce',
  'bounces',
  'undisclosed',
  'test',
  'teste',
  'exemplo',
  'example',
  'sem',
  'semmail',
  'sememail',
  'naotem',
]);

const mxCache = new Map<string, boolean>();
const mxHostCache = new Map<string, boolean>();

/** O host de MX responde em DNS? MX apontando para host morto = bounce certo. */
async function mxHostResolves(domain: string): Promise<boolean> {
  const cached = mxHostCache.get(domain);
  if (cached !== undefined) return cached;
  try {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`,
      { headers: { accept: 'application/dns-json' } },
    );
    if (!res.ok) return true;
    const json = (await res.json()) as { Answer?: Array<{ data?: string }> };
    const hosts = (json.Answer ?? [])
      .map((a) => (a.data ?? '').split(' ').pop()?.replace(/\.$/, '') ?? '')
      .filter(Boolean);
    if (hosts.length === 0) return true;

    for (const host of hosts.slice(0, 3)) {
      for (const type of ['A', 'AAAA'] as const) {
        const r = await fetch(
          `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`,
          { headers: { accept: 'application/dns-json' } },
        );
        if (!r.ok) return true;
        const j = (await r.json()) as { Answer?: unknown[] };
        if ((j.Answer ?? []).length > 0) {
          mxHostCache.set(domain, true);
          return true;
        }
      }
    }
    mxHostCache.set(domain, false);
    return false;
  } catch {
    return true; // falha de rede não penaliza o endereço
  }
}

/** Consulta MX/A por DNS-over-HTTPS (compatível com o runtime do servidor). */
async function domainHasMx(domain: string): Promise<boolean> {
  const cached = mxCache.get(domain);
  if (cached !== undefined) return cached;

  const query = async (type: 'MX' | 'A') => {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`,
      { headers: { accept: 'application/dns-json' } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { Status?: number; Answer?: Array<{ type: number }> };
    if (json.Status !== 0) return false;
    return (json.Answer ?? []).length > 0;
  };

  try {
    const mx = await query('MX');
    let has = mx === true;
    if (mx === false) {
      // sem MX: alguns domínios ainda recebem por registro A
      has = (await query('A')) === true;
    }
    if (mx === null) has = true; // DNS indisponível: não penaliza o endereço
    mxCache.set(domain, has);
    return has;
  } catch {
    return true; // falha de rede não deve bloquear o envio
  }
}

/** Avalia o risco de bounce de um endereço, incluindo checagem de DNS. */
export async function assessBounceRisk(rawEmail: string): Promise<RiskVerdict> {
  const validation = validateEmailForSending(rawEmail ?? '');
  const email = (validation.normalized ?? String(rawEmail ?? '').trim().toLowerCase());

  if (!validation.valid) {
    return { ok: false, email, code: 'invalid', reason: validation.reason ?? 'e-mail inválido' };
  }

  const domain = email.split('@')[1] ?? '';
  const localPart = (email.split('@')[0] ?? '').replace(/[._-]/g, '');

  if (ROLE_LOCALPARTS.has(localPart) || ROLE_LOCALPARTS.has(email.split('@')[0] ?? '')) {
    return {
      ok: false,
      email,
      code: 'role',
      reason: 'caixa genérica/automática (alto risco de bounce e spam trap)',
    };
  }

  if (TYPO_DOMAINS[domain]) {
    return {
      ok: false,
      email,
      code: 'typo',
      reason: `domínio digitado incorretamente (${domain} → ${TYPO_DOMAINS[domain]})`,
    };
  }

  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data: sup } = await supabaseAdmin
    .from('suppression_list')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (sup) {
    return { ok: false, email, code: 'suppressed', reason: 'endereço na lista de supressão' };
  }

  if (TRUSTED_DOMAINS.has(domain)) return { ok: true, email };

  const hasMx = await domainHasMx(domain);
  if (!hasMx) {
    return { ok: false, email, code: 'no_mx', reason: `domínio sem servidor de e-mail (${domain})` };
  }

  // Verificação profunda: o servidor de e-mail apontado pelo MX existe mesmo?
  const mxAlive = await mxHostResolves(domain);
  if (!mxAlive) {
    return {
      ok: false,
      email,
      code: 'dead_mx',
      reason: `servidor de e-mail do domínio não responde (${domain})`,
    };
  }

  return { ok: true, email };
}

export type DiscardResult = {
  email: string;
  reason: string;
  companiesDeleted: number;
  linksDeleted: number;
  queueRemoved: number;
};

/**
 * Descarta definitivamente a empresa de risco: apaga links, fila de
 * importação e o próprio registro (exceto se já houver pagamento),
 * e registra e-mail + CNPJ na supressão para nunca mais importar.
 */
export async function discardRiskyCompany(
  email: string,
  reason: string,
  companyId?: string | null,
): Promise<DiscardResult> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const out: DiscardResult = {
    email,
    reason,
    companiesDeleted: 0,
    linksDeleted: 0,
    queueRemoved: 0,
  };

  // 1) empresas alvo (por id e/ou por e-mail)
  const ids = new Set<string>();
  if (companyId) ids.add(companyId);
  if (email && email.includes('@')) {
    const { data } = await supabaseAdmin.from('companies').select('id').ilike('email', email);
    for (const c of (data ?? []) as any[]) ids.add(c.id);
  }
  const companyIds = [...ids];

  // 2) nunca apagar empresa com pagamento confirmado
  let removable = companyIds;
  if (companyIds.length) {
    const { data: paid } = await supabaseAdmin
      .from('orders')
      .select('company_id')
      .in('company_id', companyIds)
      .eq('status', 'paid');
    const paidIds = new Set((paid ?? []).map((o: any) => o.company_id).filter(Boolean));
    removable = companyIds.filter((id) => !paidIds.has(id));
  }

  // 3) supressão por e-mail e por CNPJ (bloqueia reimportação)
  const cnpjs: string[] = [];
  if (companyIds.length) {
    const { data: rows } = await supabaseAdmin.from('companies').select('cnpj').in('id', companyIds);
    for (const r of (rows ?? []) as any[]) if (r.cnpj) cnpjs.push(r.cnpj);
  }
  const supRows: any[] = [];
  if (email.includes('@')) supRows.push({ email, reason, source: 'pre_send_scan' });
  for (const cnpj of cnpjs) supRows.push({ cnpj, reason, source: 'pre_send_scan' });
  for (const r of supRows) {
    try {
      await supabaseAdmin.from('suppression_list').insert(r as any);
    } catch {
      /* já existe */
    }
  }

  // 4) fila de envio pendente
  if (email.includes('@')) {
    const { data: removedQueue } = await supabaseAdmin
      .from('email_send_queue')
      .delete()
      .ilike('to_email', email)
      .in('status', ['pending', 'queued', 'retry', 'error', 'failed'])
      .select('id');
    out.queueRemoved = (removedQueue ?? []).length;
  }

  if (!removable.length) return out;

  // 5) dependências: fila de importação, auditorias, links
  await supabaseAdmin.from('automatic_company_queue').delete().in('company_id', removable);
  await supabaseAdmin.from('contact_queue').delete().in('company_id', removable);
  await supabaseAdmin.from('automation_audit_logs').delete().in('company_id', removable);

  const { data: delLinks } = await supabaseAdmin
    .from('company_links')
    .delete()
    .in('company_id', removable)
    .select('id');
  out.linksDeleted = (delLinks ?? []).length;

  const { data: delCompanies } = await supabaseAdmin
    .from('companies')
    .delete()
    .in('id', removable)
    .select('id');
  out.companiesDeleted = (delCompanies ?? []).length;

  return out;
}
