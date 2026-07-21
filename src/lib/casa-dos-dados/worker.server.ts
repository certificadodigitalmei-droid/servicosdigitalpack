// Worker that executes a single automation "run".
// Called by the internal server route (via pg_cron) OR from the "run now" server fn.

import { searchOpeningsToday, type CasaFilters } from './client.server';

type Automation = {
  id: string;
  owner_user_id: string;
  mode: string;
  quantity_per_run: number;
  interval_minutes: number;
  filters: CasaFilters;
};

export type RunOutcome = {
  runId: string | null;
  status: 'ok' | 'error' | 'noop';
  apiStatus?: number;
  apiTotal?: number | null;
  requested: number;
  imported: number;
  duplicated: number;
  linksCreated: number;
  linksReused: number;
  error?: string;
  sample?: {
    cnpj: string | null;
    nome: string | null;
    token: string | null;
    linkPublico: string | null;
    linkCheckout: string | null;
  } | null;
};

function digitsOnly(v: unknown): string {
  return typeof v === 'string' ? v.replace(/\D+/g, '') : '';
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return null;
}

function pickNestedEmail(obj: Record<string, unknown>): string | null {
  const direct = pickString(obj, ['email', 'email_contato']);
  if (direct) return direct;
  const emails = (obj as any).emails;
  if (Array.isArray(emails) && emails.length > 0) {
    const first = emails[0];
    if (typeof first === 'string') return first;
    if (first && typeof first === 'object') return pickString(first as Record<string, unknown>, ['email', 'endereco']);
  }
  return null;
}

function toDate(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null;
  // Accept YYYY-MM-DD or DD/MM/YYYY
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return null;
}

export async function runAutomationOnce(
  automation: Automation,
  opts: { trigger: 'cron' | 'manual'; overrideQuantity?: number },
): Promise<RunOutcome> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const publicBaseUrl = (process.env.PUBLIC_APP_URL ?? '').replace(/\/+$/, '');
  if (!publicBaseUrl) throw new Error('PUBLIC_APP_URL não configurado');

  const requested = Math.max(1, opts.overrideQuantity ?? automation.quantity_per_run ?? 1);

  // 1) Create run row
  const { data: runRow, error: runErr } = await supabaseAdmin
    .from('automatic_company_query_runs')
    .insert({
      automation_id: automation.id,
      status: 'running',
      trigger: opts.trigger,
      requested_quantity: requested,
    })
    .select('id')
    .single();
  if (runErr) throw new Error(`run insert: ${runErr.message}`);
  const runId = runRow.id as string;

  const outcome: RunOutcome = {
    runId,
    status: 'ok',
    requested,
    imported: 0,
    duplicated: 0,
    linksCreated: 0,
    linksReused: 0,
    sample: null,
  };

  let apiTotal: number | null = null;
  let apiStatus = 0;
  let apiSummary: unknown = null;
  let sampleSet = false;

  try {
    // 2) Query Casa dos Dados
    const result = await searchOpeningsToday({
      filters: automation.filters ?? {},
      limit: requested,
    });
    apiStatus = result.status;
    apiTotal = result.totalCount;
    apiSummary = { total: result.totalCount, returned: result.items.length, status: result.status };
    outcome.apiStatus = apiStatus;
    outcome.apiTotal = apiTotal;

    if (!result.ok) {
      throw new Error(`API status ${result.status}`);
    }

    const todayBR = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());

    for (const item of result.items) {
      const cnpj = digitsOnly((item as any).cnpj ?? (item as any).cnpj_completo);
      if (!cnpj || cnpj.length !== 14) continue;

      // 3) Deduplicate by (automation, day, cnpj) — insert into queue with ON CONFLICT
      const { data: queueRow, error: qErr } = await supabaseAdmin
        .from('automatic_company_queue')
        .insert({
          automation_id: automation.id,
          query_date: todayBR,
          cnpj,
          run_id: runId,
        })
        .select('id')
        .maybeSingle();

      if (qErr) {
        if (qErr.code === '23505') {
          outcome.duplicated += 1;
          continue;
        }
        throw new Error(`queue insert: ${qErr.message}`);
      }
      const queueId = queueRow!.id as string;

      // 4) Upsert company
      const companyPayload: Record<string, unknown> = {
        cnpj,
        razao_social_original: pickString(item, ['razao_social', 'nome_empresarial']) ?? null,
        nome_fantasia: pickString(item, ['nome_fantasia']),
        nome_titular_exibicao:
          pickString(item, ['nome_titular', 'nome']) ??
          pickString(item, ['razao_social', 'nome_empresarial']),
        email: pickNestedEmail(item),
        uf: pickString(item, ['uf']),
        municipio_descricao: pickString(item, ['municipio', 'cidade']),
        situacao_cadastral_desc: pickString(item, ['situacao_cadastral', 'situacao']),
        inicio_atividade: toDate((item as any).data_abertura ?? (item as any).abertura),
        is_mei: automation.filters?.only_mei ? true : ((item as any).mei === true || (item as any).is_mei === true),
        is_matriz: automation.filters?.only_matriz ? true : undefined,
        fonte: 'casa_dos_dados',
        last_seen_at: new Date().toISOString(),
        possui_email: !!pickNestedEmail(item),
      };
      // clean undefined
      for (const k of Object.keys(companyPayload)) if (companyPayload[k] === undefined) delete companyPayload[k];

      const { data: existing } = await supabaseAdmin
        .from('companies')
        .select('id')
        .eq('cnpj', cnpj)
        .maybeSingle();

      let companyId: string;
      let wasNewCompany = false;
      if (existing?.id) {
        companyId = existing.id;
        const { error: upErr } = await (supabaseAdmin as any)
          .from('companies')
          .update(companyPayload)
          .eq('id', companyId);
        if (upErr) throw new Error(`company update: ${upErr.message}`);
      } else {
        const { data: ins, error: insErr } = await (supabaseAdmin as any)
          .from('companies')
          .insert(companyPayload)
          .select('id')
          .single();
        if (insErr) throw new Error(`company insert: ${insErr.message}`);
        companyId = ins.id as string;
        wasNewCompany = true;
      }

      // 5) Reuse active link, else create new
      const { data: activeLink } = await supabaseAdmin
        .from('company_links')
        .select('id, public_token, public_url, checkout_url')
        .eq('company_id', companyId)
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let linkId: string;
      let publicToken: string;
      let publicUrl: string;
      let checkoutUrl: string;
      let wasNewLink = false;

      if (activeLink) {
        linkId = activeLink.id as string;
        publicToken = (activeLink as any).public_token as string;
        publicUrl = (activeLink as any).public_url ?? `${publicBaseUrl}/c/${publicToken}`;
        checkoutUrl = (activeLink as any).checkout_url ?? `${publicBaseUrl}/checkout/${publicToken}`;
        outcome.linksReused += 1;
      } else {
        publicToken = crypto.randomUUID().replace(/-/g, '');
        publicUrl = `${publicBaseUrl}/c/${publicToken}`;
        checkoutUrl = `${publicBaseUrl}/checkout/${publicToken}`;
        const { data: newLink, error: lErr } = await supabaseAdmin
          .from('company_links')
          .insert({
            company_id: companyId,
            public_token: publicToken,
            token: publicToken,
            public_url: publicUrl,
            checkout_url: checkoutUrl,
            active: true,
            status: 'active',
            company_data: {
              cnpj,
              nome: companyPayload.nome_titular_exibicao ?? companyPayload.razao_social_original,
              origin: 'casa_dos_dados_automation',
            },
          })
          .select('id')
          .single();
        if (lErr) throw new Error(`link insert: ${lErr.message}`);
        linkId = newLink.id as string;
        wasNewLink = true;
        outcome.linksCreated += 1;
      }

      await supabaseAdmin
        .from('automatic_company_queue')
        .update({
          company_id: companyId,
          company_link_id: linkId,
          was_new_company: wasNewCompany,
          was_new_link: wasNewLink,
        })
        .eq('id', queueId);

      outcome.imported += 1;

      if (!sampleSet) {
        outcome.sample = {
          cnpj,
          nome: (companyPayload.nome_titular_exibicao as string) ?? (companyPayload.razao_social_original as string) ?? null,
          token: publicToken,
          linkPublico: publicUrl,
          linkCheckout: checkoutUrl,
        };
        sampleSet = true;
      }
    }

    // 6) Finalize run + automation
    await supabaseAdmin
      .from('automatic_company_query_runs')
      .update({
        status: 'ok',
        api_total: apiTotal,
        imported_count: outcome.imported,
        duplicate_count: outcome.duplicated,
        link_created_count: outcome.linksCreated,
        link_reused_count: outcome.linksReused,
        api_summary: apiSummary as any,
        finished_at: new Date().toISOString(),
      })
      .eq('id', runId);

    const now = new Date();
    const next = new Date(now.getTime() + Math.max(1, automation.interval_minutes) * 60_000);
    await supabaseAdmin
      .from('automatic_company_queries')
      .update({
        status: 'active',
        last_run_at: now.toISOString(),
        next_run_at: next.toISOString(),
        last_error: null,
      })
      .eq('id', automation.id);

    return outcome;
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    await supabaseAdmin
      .from('automatic_company_query_runs')
      .update({
        status: 'error',
        error_message: msg,
        api_total: apiTotal,
        imported_count: outcome.imported,
        duplicate_count: outcome.duplicated,
        link_created_count: outcome.linksCreated,
        link_reused_count: outcome.linksReused,
        api_summary: apiSummary as any,
        finished_at: new Date().toISOString(),
      })
      .eq('id', runId);

    const now = new Date();
    const next = new Date(now.getTime() + Math.max(1, automation.interval_minutes) * 60_000);
    await supabaseAdmin
      .from('automatic_company_queries')
      .update({
        status: 'error',
        last_error: msg,
        last_run_at: now.toISOString(),
        next_run_at: next.toISOString(),
      })
      .eq('id', automation.id);

    outcome.status = 'error';
    outcome.error = msg;
    return outcome;
  }
}
