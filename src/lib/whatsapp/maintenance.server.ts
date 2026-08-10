// Manutenção da base voltada ao WhatsApp — server-only.
// Remove empresas que nunca poderão ser contatadas (sem celular válido) e
// empresas cujo envio falhou de forma definitiva. Vendas pagas nunca são
// apagadas: nesses casos a empresa apenas sai das filas de marketing.

import { resolveCompanyMobile } from './ready-queue.server';

async function admin() {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  return supabaseAdmin as any;
}

export type PurgeReport = {
  analyzed: number;
  removed: number;
  keptPaid: number;
  samples: Array<{ cnpj: string; reason: string }>;
};

async function paidCompanyIds(ids: string[]): Promise<Set<string>> {
  const db = await admin();
  const paid = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db
      .from('orders')
      .select('company_id')
      .eq('status', 'paid')
      .in('company_id', ids.slice(i, i + 200));
    for (const r of ((data ?? []) as any[])) if (r.company_id) paid.add(String(r.company_id));
  }
  return paid;
}

/** Apaga a empresa e tudo que depende dela (exceto histórico financeiro). */
export async function deleteCompanyCascade(companyId: string): Promise<void> {
  const db = await admin();

  const { data: links } = await db.from('company_links').select('id').eq('company_id', companyId);
  const linkIds = ((links ?? []) as any[]).map((l) => String(l.id));

  await db.from('whatsapp_ready_queue').delete().eq('company_id', companyId);
  await db.from('whatsapp_campaign_items').delete().eq('company_id', companyId);
  await db.from('whatsapp_queue').delete().eq('company_id', companyId);
  await db.from('contact_queue').delete().eq('company_id', companyId);
  await db.from('automatic_company_queue').delete().eq('company_id', companyId);
  await db.from('automation_audit_logs').delete().eq('company_id', companyId);
  if (linkIds.length) {
    await db.from('link_events').delete().in('company_link_id', linkIds);
    await db.from('company_links').delete().in('id', linkIds);
  }
  await db.from('companies').delete().eq('id', companyId);
}

/** Empresas importadas (e seus links) que não têm celular brasileiro válido. */
export async function purgeCompaniesWithoutMobile(limit = 5000): Promise<PurgeReport> {
  const db = await admin();
  const { data } = await db
    .from('companies')
    .select('id,cnpj,ddd,telefones,whatsapp_phone_e164')
    .limit(limit);

  const rows = (data ?? []) as any[];
  const report: PurgeReport = { analyzed: rows.length, removed: 0, keptPaid: 0, samples: [] };
  const targets = rows.filter((c) => !resolveCompanyMobile(c));
  if (!targets.length) return report;

  const paid = await paidCompanyIds(targets.map((c) => String(c.id)));

  for (const c of targets) {
    const id = String(c.id);
    const cnpj = String(c.cnpj ?? '');
    if (paid.has(id)) {
      report.keptPaid += 1;
      continue;
    }
    await deleteCompanyCascade(id);
    report.removed += 1;
    if (report.samples.length < 10) report.samples.push({ cnpj, reason: 'sem celular válido' });
  }
  return report;
}

/** Empresas cujo envio de WhatsApp falhou de forma definitiva. */
export async function purgeFailedCompanies(limit = 5000): Promise<PurgeReport> {
  const db = await admin();

  const failedIds = new Set<string>();
  const { data: items } = await db
    .from('whatsapp_campaign_items')
    .select('company_id,status')
    .eq('status', 'failed')
    .limit(limit);
  for (const r of ((items ?? []) as any[])) if (r.company_id) failedIds.add(String(r.company_id));

  const { data: queued } = await db
    .from('whatsapp_queue')
    .select('company_id,status')
    .eq('status', 'failed')
    .limit(limit);
  for (const r of ((queued ?? []) as any[])) if (r.company_id) failedIds.add(String(r.company_id));

  const report: PurgeReport = { analyzed: failedIds.size, removed: 0, keptPaid: 0, samples: [] };
  if (!failedIds.size) return report;

  const ids = [...failedIds];

  // Nunca apagar quem já enviou com sucesso em alguma campanha.
  const sent = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db
      .from('whatsapp_campaign_items')
      .select('company_id')
      .eq('status', 'sent')
      .in('company_id', ids.slice(i, i + 200));
    for (const r of ((data ?? []) as any[])) if (r.company_id) sent.add(String(r.company_id));
  }

  const candidates = ids.filter((id) => !sent.has(id));
  const paid = await paidCompanyIds(candidates);

  for (const id of candidates) {
    if (paid.has(id)) {
      report.keptPaid += 1;
      continue;
    }
    const { data: company } = await db.from('companies').select('cnpj').eq('id', id).maybeSingle();
    await deleteCompanyCascade(id);
    report.removed += 1;
    if (report.samples.length < 10) {
      report.samples.push({ cnpj: String(company?.cnpj ?? ''), reason: 'falha de envio' });
    }
  }
  return report;
}
