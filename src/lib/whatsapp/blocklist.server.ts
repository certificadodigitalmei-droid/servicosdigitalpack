// Lista permanente de rejeição de números + quarentena de empresas.
// Server-only: usa o cliente admin do backend.

import { canonicalPhoneKey, validateBrazilianMobile } from '@/lib/phone/brazilian-mobile';

export type BlockInput = {
  phone: string | null | undefined;
  reason: string;
  source?: string;
  cnpj?: string | null;
  companyId?: string | null;
  providerStatus?: number | null;
  providerCode?: string | null;
};

async function admin() {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  return supabaseAdmin as any;
}

export async function loadBlockedPhones(limit = 5000): Promise<Set<string>> {
  const db = await admin();
  const { data } = await db
    .from('blocked_contact_numbers')
    .select('phone_e164, phone_canonical')
    .order('created_at', { ascending: false })
    .limit(limit);
  const set = new Set<string>();
  for (const r of (data ?? []) as any[]) {
    if (r.phone_e164) set.add(String(r.phone_e164));
    if (r.phone_canonical) set.add(String(r.phone_canonical));
  }
  return set;
}

export async function loadBlockedCnpjs(limit = 200): Promise<string[]> {
  const db = await admin();
  const { data } = await db
    .from('blocked_contact_numbers')
    .select('cnpj_snapshot')
    .not('cnpj_snapshot', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  return Array.from(
    new Set(
      ((data ?? []) as any[])
        .map((r) => String(r.cnpj_snapshot ?? '').replace(/\D+/g, ''))
        .filter((c) => c.length === 14),
    ),
  );
}

export async function isPhoneBlocked(phone: string): Promise<boolean> {
  const db = await admin();
  const canonical = canonicalPhoneKey(phone);
  const { data } = await db
    .from('blocked_contact_numbers')
    .select('id')
    .or(`phone_e164.eq.${phone},phone_canonical.eq.${canonical ?? phone}`)
    .limit(1)
    .maybeSingle();
  return !!data;
}

export async function countBlockedNumbers(): Promise<number> {
  const db = await admin();
  const { count } = await db
    .from('blocked_contact_numbers')
    .select('id', { count: 'exact', head: true });
  return count ?? 0;
}

/**
 * Falha PERMANENTE do destinatário: bloqueia telefone + CNPJ e remove tudo em
 * uma única transação no banco (função admin-only security definer).
 * Vendas pagas nunca são apagadas — nesse caso a empresa vai para quarentena.
 */
export async function blockPhoneAndQuarantine(input: BlockInput): Promise<{
  blocked: boolean;
  companyRemoved: boolean;
  companyQuarantined: boolean;
}> {
  const db = await admin();
  const validated = validateBrazilianMobile(input.phone ?? '');
  const e164 = validated.valid ? validated.e164 : null;
  const canonical = canonicalPhoneKey(input.phone) ?? null;
  const phone = e164 ?? canonical;
  if (!phone && !input.cnpj && !input.companyId) {
    return { blocked: false, companyRemoved: false, companyQuarantined: false };
  }

  const { data, error } = await db.rpc('admin_purge_company_permanent', {
    _company_id: input.companyId ?? null,
    _cnpj: input.cnpj ?? null,
    _phone: phone,
    _reason: input.reason,
    _source: input.source ?? 'whatsapp',
  });
  if (error) throw new Error(error.message);

  const r = (data ?? {}) as any;
  return {
    blocked: !!r.blocked,
    companyRemoved: !!r.company_removed,
    companyQuarantined: !!r.company_quarantined,
  };
}

