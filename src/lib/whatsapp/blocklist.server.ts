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
 * Bloqueia permanentemente um número: registra na lista, cancela filas,
 * desativa links e coloca a empresa em quarentena (delete quando possível).
 * Nunca apaga pedidos/pagamentos — histórico financeiro é preservado.
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
  if (!e164 && !canonical) return { blocked: false, companyRemoved: false, companyQuarantined: false };

  await db
    .from('blocked_contact_numbers')
    .upsert(
      {
        phone_e164: e164,
        phone_canonical: canonical,
        reason: input.reason,
        source: input.source ?? 'whatsapp',
        cnpj_snapshot: input.cnpj ?? null,
        company_id: input.companyId ?? null,
        provider_status: input.providerStatus ?? null,
        provider_code: input.providerCode ?? null,
      },
      { onConflict: 'phone_e164', ignoreDuplicates: true },
    );

  // Remove qualquer fila pendente/erro para este telefone (nunca reenviar).
  if (e164) await db.from('whatsapp_queue').delete().eq('phone', e164).neq('status', 'sent');
  if (canonical && canonical !== e164) {
    await db.from('whatsapp_queue').delete().eq('phone', canonical).neq('status', 'sent');
  }

  let companyId = input.companyId ?? null;
  if (!companyId && input.cnpj) {
    const { data } = await db.from('companies').select('id').eq('cnpj', input.cnpj).maybeSingle();
    companyId = (data as any)?.id ?? null;
  }
  if (!companyId) return { blocked: true, companyRemoved: false, companyQuarantined: false };

  await db.from('company_links').update({ active: false }).eq('company_id', companyId);
  await db.from('automatic_company_queue').delete().eq('company_id', companyId);

  const { count: orders } = await db
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId);

  if (!orders) {
    const { error: delErr } = await db.from('companies').delete().eq('id', companyId);
    if (!delErr) return { blocked: true, companyRemoved: true, companyQuarantined: false };
  }

  // FK/pagamento impede delete físico → quarentena: sem telefone, fora das buscas.
  await db
    .from('companies')
    .update({
      status: 'bloqueada',
      possui_telefone: false,
      whatsapp_phone_e164: null,
      telefones: [],
      ddd: null,
    })
    .eq('id', companyId);
  return { blocked: true, companyRemoved: false, companyQuarantined: true };
}
