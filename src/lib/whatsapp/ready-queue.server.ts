// Fila de prontidão do WhatsApp — server-only.
// Uma empresa só entra aqui quando tem celular brasileiro válido, link ativo
// e nenhum bloqueio permanente (telefone ou CNPJ). É a única fonte da qual as
// campanhas consomem destinatários.

import {
  canonicalPhoneKey,
  extractValidBrazilianMobile,
  validateBrazilianMobile,
} from '@/lib/phone/brazilian-mobile';

async function admin() {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  return supabaseAdmin as any;
}

export type ReadyEnqueueInput = {
  companyId: string;
  cnpj: string;
  companyName?: string | null;
  phone: string | null | undefined;
  /** DDD separado, quando o telefone vier sem ele. */
  ddd?: string | null;
  companyLinkId?: string | null;
  token?: string | null;
  source?: string;
};

export type ReadyEnqueueResult =
  | { ok: true; status: 'ready'; phone: string }
  | { ok: false; reason: 'invalid_mobile' | 'blocked' | 'no_link' | 'error'; detail?: string };

/** Verifica se o CNPJ está permanentemente bloqueado (antes de gastar crédito). */
export async function isCnpjBlocked(cnpj: string): Promise<boolean> {
  const digits = String(cnpj ?? '').replace(/\D/g, '');
  if (digits.length !== 14) return false;
  const db = await admin();
  const { data } = await db
    .from('blocked_import_cnpjs')
    .select('cnpj')
    .eq('cnpj', digits)
    .maybeSingle();
  return !!data;
}

export async function loadBlockedCnpjSet(limit = 5000): Promise<Set<string>> {
  const db = await admin();
  const { data } = await db.from('blocked_import_cnpjs').select('cnpj').limit(limit);
  return new Set(((data ?? []) as any[]).map((r) => String(r.cnpj)));
}

/** Registro mínimo permanente de rejeição por CNPJ (nunca reimportar). */
export async function blockCnpjForImport(input: {
  cnpj: string;
  reason: string;
  source?: string;
  phoneRaw?: string | null;
}): Promise<void> {
  const digits = String(input.cnpj ?? '').replace(/\D/g, '');
  if (digits.length !== 14) return;
  const db = await admin();
  await db.from('blocked_import_cnpjs').upsert(
    {
      cnpj: digits,
      reason: input.reason,
      source: input.source ?? 'import',
      phone_raw: input.phoneRaw ?? null,
      phone_canonical: canonicalPhoneKey(input.phoneRaw ?? null),
    },
    { onConflict: 'cnpj', ignoreDuplicates: true },
  );
}

async function findActiveLink(companyId: string): Promise<{ id: string; token: string } | null> {
  const db = await admin();
  const { data } = await db
    .from('company_links')
    .select('id, public_token')
    .eq('company_id', companyId)
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.public_token) return null;
  return { id: String(data.id), token: String(data.public_token).trim() };
}

/**
 * Insere/atualiza a empresa na fila de prontidão. Idempotente por empresa e
 * por telefone. Nunca inventa telefone: só aceita celular já validado.
 */
export async function enqueueReadyCompany(input: ReadyEnqueueInput): Promise<ReadyEnqueueResult> {
  const validated = validateBrazilianMobile(input.phone ?? '', input.ddd ?? null);
  if (!validated.valid) return { ok: false, reason: 'invalid_mobile', detail: validated.reason };
  const phone = validated.e164;
  const canonical = canonicalPhoneKey(phone);
  const db = await admin();

  const { data: blockedPhone } = await db
    .from('blocked_contact_numbers')
    .select('id')
    .or(`phone_e164.eq.${phone},phone_canonical.eq.${canonical ?? phone}`)
    .limit(1)
    .maybeSingle();
  if (blockedPhone) return { ok: false, reason: 'blocked', detail: 'telefone bloqueado' };
  if (await isCnpjBlocked(input.cnpj)) return { ok: false, reason: 'blocked', detail: 'CNPJ bloqueado' };

  let linkId = input.companyLinkId ?? null;
  let token = input.token ?? null;
  if (!linkId || !token) {
    const link = await findActiveLink(input.companyId);
    if (!link) return { ok: false, reason: 'no_link', detail: 'sem link ativo' };
    linkId = link.id;
    token = link.token;
  }

  const { error } = await db.from('whatsapp_ready_queue').upsert(
    {
      company_id: input.companyId,
      cnpj: String(input.cnpj ?? '').replace(/\D/g, ''),
      company_name: input.companyName ?? null,
      phone_e164: phone,
      phone_canonical: canonical,
      company_link_id: linkId,
      token,
      status: 'ready',
      source: input.source ?? 'import',
    },
    { onConflict: 'company_id' },
  );
  if (error) {
    // Colisão por telefone: mesma pessoa em dois CNPJs — não duplicar contato.
    if (String(error.message ?? '').includes('whatsapp_ready_queue_phone_uidx')) {
      return { ok: false, reason: 'blocked', detail: 'telefone já na fila' };
    }
    return { ok: false, reason: 'error', detail: error.message };
  }
  return { ok: true, status: 'ready', phone };
}

// ---------------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------------

export type ReadyCounts = {
  ready: number;
  reserved: number;
  sent: number;
  awaitingLink: number;
  rejectedNoMobile: number;
  blocked: number;
  companies: number;
};

export async function getReadyCounts(): Promise<ReadyCounts> {
  const db = await admin();
  const countOf = async (status?: string) => {
    let q = db.from('whatsapp_ready_queue').select('id', { count: 'exact', head: true });
    if (status) q = q.eq('status', status);
    const { count } = await q;
    return count ?? 0;
  };

  const [ready, reserved, sent] = await Promise.all([countOf('ready'), countOf('reserved'), countOf('sent')]);

  const { count: companies } = await db.from('companies').select('id', { count: 'exact', head: true });
  const { count: blocked } = await db
    .from('blocked_contact_numbers')
    .select('id', { count: 'exact', head: true });

  // Empresas fora da fila: classifica por celular válido x link ativo.
  const { data: outside } = await db
    .from('companies')
    .select('id,cnpj,ddd,telefones,whatsapp_phone_e164')
    .limit(5000);
  const inQueue = new Set<string>();
  const { data: queued } = await db.from('whatsapp_ready_queue').select('company_id').limit(5000);
  for (const r of ((queued ?? []) as any[])) inQueue.add(String(r.company_id));

  const candidates = ((outside ?? []) as any[]).filter((c) => !inQueue.has(String(c.id)));
  const withMobile: string[] = [];
  let rejectedNoMobile = 0;
  for (const c of candidates) {
    const v = resolveCompanyMobile(c);
    if (v) withMobile.push(String(c.id));
    else rejectedNoMobile += 1;
  }

  let awaitingLink = 0;
  for (let i = 0; i < withMobile.length; i += 200) {
    const slice = withMobile.slice(i, i + 200);
    const { data: links } = await db
      .from('company_links')
      .select('company_id')
      .in('company_id', slice)
      .eq('active', true);
    const withLink = new Set(((links ?? []) as any[]).map((l) => String(l.company_id)));
    awaitingLink += slice.filter((id) => !withLink.has(id)).length;
  }

  return {
    ready,
    reserved,
    sent,
    awaitingLink,
    rejectedNoMobile,
    blocked: blocked ?? 0,
    companies: companies ?? 0,
  };
}

/** Normaliza o celular de uma empresa a partir de todos os campos disponíveis. */
export function resolveCompanyMobile(company: {
  whatsapp_phone_e164?: string | null;
  telefones?: unknown;
  ddd?: string | null;
}): string | null {
  const direct = validateBrazilianMobile(company.whatsapp_phone_e164 ?? '');
  if (direct.valid) return direct.e164;
  const list = Array.isArray(company.telefones) ? (company.telefones as unknown[]) : [];
  const r = extractValidBrazilianMobile(list as any, company.ddd ?? null);
  return r.valid ? r.e164 : null;
}

export async function listReadyQueue(input: { page: number; pageSize: number; status?: string }) {
  const db = await admin();
  const from = (input.page - 1) * input.pageSize;
  let q = db
    .from('whatsapp_ready_queue')
    .select('id,company_id,cnpj,company_name,phone_e164,status,source,campaign_id,created_at', {
      count: 'exact',
    })
    .order('created_at', { ascending: true })
    .range(from, from + input.pageSize - 1);
  if (input.status) q = q.eq('status', input.status);
  const { data, count } = await q;
  return { items: (data ?? []) as any[], total: count ?? 0 };
}

// ---------------------------------------------------------------------------
// Reconciliação / backfill das empresas já importadas
// ---------------------------------------------------------------------------

export type ReconcileReport = {
  analyzed: number;
  ready: number;
  noMobile: number;
  noLink: number;
  blocked: number;
  alreadyQueued: number;
  applied: boolean;
  samples: Array<{ cnpj: string; phone: string | null; reason: string }>;
};

/**
 * Percorre as empresas existentes e calcula quem realmente pode entrar na fila.
 * `apply=false` devolve apenas a prévia; nada é gravado.
 */
export async function reconcileReadyQueue(opts: { apply: boolean; limit?: number }): Promise<ReconcileReport> {
  const db = await admin();
  const limit = opts.limit ?? 2000;
  const { data: companies } = await db
    .from('companies')
    .select('id,cnpj,razao_social_original,nome_titular_exibicao,ddd,telefones,whatsapp_phone_e164,status')
    .order('created_at', { ascending: true })
    .limit(limit);

  const rows = (companies ?? []) as any[];
  const report: ReconcileReport = {
    analyzed: rows.length,
    ready: 0,
    noMobile: 0,
    noLink: 0,
    blocked: 0,
    alreadyQueued: 0,
    applied: opts.apply,
    samples: [],
  };
  if (!rows.length) return report;

  const { data: queued } = await db.from('whatsapp_ready_queue').select('company_id').limit(10000);
  const inQueue = new Set(((queued ?? []) as any[]).map((r) => String(r.company_id)));

  const { loadBlockedPhones } = await import('./blocklist.server');
  const blockedPhones = await loadBlockedPhones();
  const blockedCnpjs = await loadBlockedCnpjSet();

  const ids = rows.map((c) => String(c.id));
  const linkByCompany = new Map<string, { id: string; token: string }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: links } = await db
      .from('company_links')
      .select('id,company_id,public_token')
      .in('company_id', ids.slice(i, i + 200))
      .eq('active', true);
    for (const l of ((links ?? []) as any[])) {
      if (l.public_token && !linkByCompany.has(String(l.company_id))) {
        linkByCompany.set(String(l.company_id), { id: String(l.id), token: String(l.public_token).trim() });
      }
    }
  }

  for (const c of rows) {
    const id = String(c.id);
    const cnpj = String(c.cnpj ?? '').replace(/\D/g, '');
    if (inQueue.has(id)) {
      report.alreadyQueued += 1;
      continue;
    }
    const phone = resolveCompanyMobile(c);
    if (!phone) {
      report.noMobile += 1;
      if (report.samples.length < 10) report.samples.push({ cnpj, phone: null, reason: 'sem celular válido' });
      continue;
    }
    if (blockedPhones.has(phone) || blockedCnpjs.has(cnpj) || c.status === 'bloqueada') {
      report.blocked += 1;
      continue;
    }
    const link = linkByCompany.get(id);
    if (!link) {
      report.noLink += 1;
      if (report.samples.length < 10) report.samples.push({ cnpj, phone, reason: 'sem link ativo' });
      continue;
    }
    report.ready += 1;

    if (opts.apply) {
      // Persiste o celular normalizado na empresa (sem inventar número).
      if (c.whatsapp_phone_e164 !== phone) {
        await db
          .from('companies')
          .update({ whatsapp_phone_e164: phone, possui_telefone: true, ddd: phone.slice(2, 4) })
          .eq('id', id);
      }
      await enqueueReadyCompany({
        companyId: id,
        cnpj,
        companyName: c.nome_titular_exibicao ?? c.razao_social_original ?? null,
        phone,
        companyLinkId: link.id,
        token: link.token,
        source: 'reconcile',
      });
    }
  }

  return report;
}

/** Remove da fila as empresas que deixaram de ser elegíveis. */
export async function markReadySent(companyId: string) {
  const db = await admin();
  await db
    .from('whatsapp_ready_queue')
    .update({ status: 'sent', updated_at: new Date().toISOString() })
    .eq('company_id', companyId);
}
