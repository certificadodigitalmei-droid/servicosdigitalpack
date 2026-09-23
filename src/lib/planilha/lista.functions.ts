import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { resolveCompanyMobile } from '@/lib/whatsapp/ready-queue.server';
import { cleanCompanyName } from '@/lib/format';

export type PlanilhaRow = {
  razaoSocial: string;
  cnpj: string;
  celular: string;
  link: string;
};

function nextDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function formatPhoneBR(e164: string): string {
  const d = e164.replace(/\D/g, '').replace(/^55/, '');
  if (d.length !== 11) return e164;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function firstWordName(name?: string | null): string {
  const clean = cleanCompanyName(name);
  if (!clean || clean === '—') return '—';
  const first = clean.split(/\s+/)[0] ?? '';
  return first ? first : '—';
}

export const listPlanilhaLista = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(data))
  .handler(async ({ data }): Promise<{ date: string; rows: PlanilhaRow[] }> => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { ensurePublicBaseUrl } = await import('@/lib/public-base-url.server');
    const db = supabaseAdmin as any;

    const from = `${data.date}T03:00:00.000Z`;
    const to = `${nextDay(data.date)}T02:59:59.999Z`;
    // Links curtos saem sempre pelo domínio pequeno (meu-pj-mei.online);
    // ao clicar, /s/:code leva para o site normal.
    const { SHORT_LINK_BASE_URL } = await import('@/lib/public-base-url');
    const base = SHORT_LINK_BASE_URL;

    const { data: companies } = await db
      .from('companies')
      .select('id,cnpj,razao_social_original,nome_titular_exibicao,nome_fantasia,ddd,telefones,whatsapp_phone_e164')
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at', { ascending: true })
      .limit(5000);

    const list = (companies ?? []) as any[];
    if (!list.length) return { date: data.date, rows: [] };

    const ids = list.map((c) => String(c.id));
    const tokenByCompany = new Map<string, string>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data: links } = await db
        .from('company_links')
        .select('company_id,public_token,active,created_at')
        .in('company_id', ids.slice(i, i + 200))
        .eq('active', true)
        .order('created_at', { ascending: false });
      for (const l of ((links ?? []) as any[])) {
        const cid = String(l.company_id);
        if (l.public_token && !tokenByCompany.has(cid)) tokenByCompany.set(cid, String(l.public_token).trim());
      }
    }

    const rows: PlanilhaRow[] = [];
    for (const c of list) {
      const phone = resolveCompanyMobile(c);
      if (!phone) continue; // somente celular válido
      const token = tokenByCompany.get(String(c.id));
      rows.push({
        razaoSocial: firstWordName(c.razao_social_original ?? c.nome_titular_exibicao ?? c.nome_fantasia),
        cnpj: String(c.cnpj ?? '').replace(/\D/g, ''),
        celular: formatPhoneBR(phone),
        link: token ? `${base}/s/${token.slice(0, 8)}` : '',
      });
    }

    return { date: data.date, rows };
  });
