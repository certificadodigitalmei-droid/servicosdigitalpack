// Server-only core for the "simple flow" import.
// Reused by:
//   - importBatch server-fn (manual UI)
//   - /api/public/hooks/auto-import-mei cron endpoint (continuous auto-import)
//
// Steps:
//   1. Discovery (free): /v5/cnpj/pesquisa returns a list of CNPJs.
//   2. Dedup: when skipExisting=true, we drop CNPJs already in `companies`
//      BEFORE the paid detail call, so we never spend credits on duplicates.
//   3. Enrichment (paid): for each remaining CNPJ, call /v4/cnpj/{cnpj}.
//   4. Upsert company + create/reuse an active company_links row.

import { searchOpeningsByDate, fetchCompanyDetailsByCnpj } from './client.server';
import { normalizeCasaDosDadosCompany } from './worker-logic';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { validateEmailForImport } from '@/lib/email-validation';

export type RunImportBatchInput = {
  date: string; // YYYY-MM-DD
  filters: {
    only_mei: boolean;
    only_active: boolean;
    only_matriz: boolean;
    require_email: boolean;
  };
  limit: number; // max NEW companies to enrich (1..15)
  page?: number; // discovery page (default 1)
  skipExisting?: boolean; // dedup by cnpj before enrichment
};

export type ImportedRow = {
  cnpj: string;
  nome: string;
  publicUrl: string;
  checkoutUrl: string;
  isNewCompany: boolean;
  isNewLink: boolean;
};

export type RunImportBatchResult =
  | {
      ok: false;
      status: number;
      error: string;
      imported: ImportedRow[];
      failed: Array<{ cnpj: string; error: string }>;
      apiTotal: number | null;
      skipped: number;
      discovered: number;
    }
  | {
      ok: true;
      status: number;
      apiTotal: number | null;
      requested: number;
      page: number;
      discovered: number;
      skipped: number;
      imported: ImportedRow[];
      failed: Array<{ cnpj: string; error: string }>;
    };

export async function runImportBatch(
  input: RunImportBatchInput,
): Promise<RunImportBatchResult> {
  const startPage = input.page ?? 1;
  const publicBaseUrl = (process.env.PUBLIC_APP_URL ?? '').replace(/\/+$/, '');

  // 1) Discovery (free) — quando skipExisting está ativo, avançamos páginas
  // até encontrar CNPJs novos ou atingir o limite de tentativas. Isso evita
  // ficar "preso" na página 1 quando todos os primeiros resultados já foram
  // importados anteriormente.
  // Quando a importação automática roda 1-a-1, os primeiros resultados da API
  // (mais recentes) rapidamente viram empresas já importadas. Se buscarmos só
  // 1 item por página e pararmos em 10 páginas, o ciclo trava exatamente depois
  // dos 10 primeiros CNPJs. Para manter o fluxo contínuo, a descoberta gratuita
  // olha uma página cheia e avança várias páginas até achar o próximo CNPJ novo;
  // ainda enriquecemos/importamos apenas `input.limit` empresas, preservando a
  // regra do envio: importar 1 → enviar 1 → importar o próximo.
  const discoveryLimit = input.skipExisting ? Math.max(15, input.limit) : input.limit;
  const maxPages = input.skipExisting ? 100 : 1;
  let page = startPage;
  let lastStatus = 0;
  let apiTotal: number | null = null;
  let discovered = 0;
  let skipped = 0;
  let toEnrich: Array<{ cnpj: string; raw: Record<string, unknown> }> = [];

  for (let attempt = 0; attempt < maxPages; attempt++) {
    const r = await searchOpeningsByDate({
      filters: input.filters,
      date: input.date,
      limit: discoveryLimit,
      page,
      completo: false,
      timeoutMs: 20_000,
    });

    lastStatus = r.status;
    apiTotal = r.total;

    if (!r.ok) {
      return {
        ok: false,
        status: r.status,
        error: `API respondeu ${r.status}`,
        imported: [],
        failed: [],
        apiTotal: r.total,
        skipped: 0,
        discovered: 0,
      };
    }

    const candidates: Array<{ cnpj: string; raw: Record<string, unknown> }> = [];
    for (const raw of r.items) {
      const n = normalizeCasaDosDadosCompany(raw);
      if (n.cnpj && n.cnpj.length === 14) {
        candidates.push({ cnpj: n.cnpj, raw });
      }
    }
    discovered += candidates.length;

    if (candidates.length === 0) break; // sem mais resultados

    let pageToEnrich = candidates;
    if (input.skipExisting) {
      const cnpjs = candidates.map((c) => c.cnpj);
      const { data: existingRows } = await supabaseAdmin
        .from('companies')
        .select('cnpj')
        .in('cnpj', cnpjs);
      const existingSet = new Set((existingRows ?? []).map((r: any) => r.cnpj as string));
      pageToEnrich = candidates.filter((c) => !existingSet.has(c.cnpj));
      skipped += candidates.length - pageToEnrich.length;
    }

    if (pageToEnrich.length > 0) {
      toEnrich = pageToEnrich.slice(0, input.limit);
      break;
    }

    // Nada novo nesta página — tenta a próxima.
    page += 1;
  }


  const imported: ImportedRow[] = [];
  const failed: Array<{ cnpj: string; error: string }> = [];

  for (const { cnpj, raw: rawBase } of toEnrich) {
    const nBase = normalizeCasaDosDadosCompany(rawBase);
    try {
      // 3) Enrichment (paid): /v4/cnpj/{cnpj}
      let n = nBase;
      let raw: Record<string, unknown> = rawBase;
      try {
        const detail = await fetchCompanyDetailsByCnpj(cnpj, { timeoutMs: 15_000 });
        if (detail.ok && detail.item) {
          raw = detail.item as Record<string, unknown>;
          n = normalizeCasaDosDadosCompany(raw);
        } else {
          console.warn('[simple-flow] enrichment failed', cnpj, detail.status);
        }
      } catch (e) {
        console.warn(
          '[simple-flow] enrichment threw',
          cnpj,
          e instanceof Error ? e.message : String(e),
        );
      }

      const displayName =
        (n.razao_social ?? nBase.razao_social ?? '').replace(/^\d+[.\-/\s]*/, '').trim() ||
        n.nome_fantasia ||
        cnpj;

      // Validação de e-mail para reduzir bounce.
      const rawEmail = n.email;
      const emailValidation = rawEmail ? validateEmailForImport(rawEmail) : { valid: false, normalized: null, reason: 'e-mail ausente' };
      const validEmail = emailValidation.valid ? emailValidation.normalized : null;

      if (input.filters.require_email && !validEmail) {
        failed.push({
          cnpj,
          error: `pulado: ${emailValidation.reason || 'e-mail inválido'}`,
        });
        continue;
      }

      const rawAny = raw as any;
      const estab =
        rawAny?.estabelecimento && typeof rawAny.estabelecimento === 'object'
          ? rawAny.estabelecimento
          : rawAny;
      const endObj =
        rawAny?.endereco &&
        typeof rawAny.endereco === 'object' &&
        !Array.isArray(rawAny.endereco)
          ? rawAny.endereco
          : null;

      const contatoTel = Array.isArray(rawAny?.contato_telefonico)
        ? rawAny.contato_telefonico
        : [];
      const telefonesArr = contatoTel.length
        ? contatoTel.map((t: any) => ({
            numero: t?.completo ?? t?.numero ?? null,
            ddd: t?.ddd ?? null,
            tipo: t?.tipo ?? null,
          }))
        : Array.isArray(rawAny?.telefones)
          ? rawAny.telefones
          : Array.isArray(estab?.telefones)
            ? estab.telefones
            : n.telefone
              ? [{ numero: n.telefone }]
              : [];

      const cnaePrinc =
        rawAny?.atividade_principal ??
        rawAny?.cnae_fiscal ??
        estab?.cnae_fiscal ??
        rawAny?.cnae_principal ??
        estab?.cnae_principal ??
        null;
      const cnaePrincCodigo =
        typeof cnaePrinc === 'object' && cnaePrinc
          ? (cnaePrinc.codigo ?? cnaePrinc.id ?? null)
          : (rawAny?.cnae_fiscal_codigo ?? estab?.cnae_fiscal_codigo ?? null);
      const cnaePrincDesc =
        typeof cnaePrinc === 'object' && cnaePrinc
          ? (cnaePrinc.descricao ?? cnaePrinc.nome ?? null)
          : (rawAny?.cnae_fiscal_descricao ?? estab?.cnae_fiscal_descricao ?? null);
      const cnaesSec = Array.isArray(rawAny?.atividade_secundaria)
        ? rawAny.atividade_secundaria
        : Array.isArray(rawAny?.cnaes_secundarios)
          ? rawAny.cnaes_secundarios
          : Array.isArray(estab?.cnaes_secundarios)
            ? estab.cnaes_secundarios
            : [];

      const socios = Array.isArray(rawAny?.quadro_societario)
        ? rawAny.quadro_societario
        : Array.isArray(rawAny?.qsa)
          ? rawAny.qsa
          : Array.isArray(rawAny?.socios)
            ? rawAny.socios
            : [];

      const isMei = !!(
        rawAny?.mei?.optante ??
        rawAny?.opcao_pelo_mei ??
        estab?.opcao_pelo_mei
      );
      const isSimples = !!(
        rawAny?.simples?.optante ??
        rawAny?.opcao_pelo_simples ??
        estab?.opcao_pelo_simples
      );

      const porteDesc =
        rawAny?.porte_empresa?.descricao ??
        rawAny?.porte?.descricao ??
        rawAny?.porte ??
        null;
      const naturezaId =
        rawAny?.codigo_natureza_juridica ??
        rawAny?.natureza_juridica?.codigo ??
        rawAny?.natureza_juridica ??
        null;

      const companyPayload: Record<string, unknown> = {
        cnpj,
        razao_social_original: n.razao_social ?? nBase.razao_social,
        nome_fantasia: n.nome_fantasia ?? nBase.nome_fantasia,
        nome_titular_exibicao: displayName,
        email: n.email,
        uf: n.uf ?? endObj?.uf ?? null,
        municipio_descricao: n.municipio ?? endObj?.municipio ?? null,
        municipio_codigo: (endObj?.ibge?.codigo_municipio ??
          estab?.municipio?.codigo ??
          estab?.codigo_municipio ??
          null) as any,
        situacao_cadastral_desc: n.situacao_cadastral,
        situacao_cadastral_data: (rawAny?.situacao_cadastral?.data ??
          estab?.situacao_cadastral?.data ??
          null) as any,
        inicio_atividade: n.data_abertura,
        is_matriz: n.matriz_filial ? /matriz/i.test(n.matriz_filial) : undefined,
        is_filial: n.matriz_filial ? /filial/i.test(n.matriz_filial) : undefined,
        is_mei: isMei,
        is_simples: isSimples,
        logradouro: (endObj?.logradouro ?? estab?.logradouro ?? rawAny?.logradouro ?? null) as any,
        tipo_logradouro: (endObj?.tipo_logradouro ??
          estab?.tipo_logradouro ??
          rawAny?.tipo_logradouro ??
          null) as any,
        numero: (endObj?.numero ?? estab?.numero ?? rawAny?.numero ?? null) as any,
        complemento: (endObj?.complemento ?? estab?.complemento ?? rawAny?.complemento ?? null) as any,
        bairro: (endObj?.bairro ?? estab?.bairro ?? rawAny?.bairro ?? null) as any,
        cep: (endObj?.cep ?? estab?.cep ?? rawAny?.cep ?? null) as any,
        telefones: telefonesArr as any,
        ddd: telefonesArr?.[0]?.ddd ?? estab?.ddd ?? rawAny?.ddd ?? null,
        capital_social: n.capital_social,
        natureza_id: naturezaId as any,
        porte: porteDesc as any,
        cnae_principal_codigo: cnaePrincCodigo as any,
        cnae_principal_descricao: cnaePrincDesc as any,
        cnaes_secundarios: cnaesSec as any,
        socios: socios as any,
        numero_socios: Array.isArray(socios) ? socios.length : null,
        nivel_dados: 'completo',
        complete_data_fetched_at: new Date().toISOString(),
        possui_email: !!n.email,
        possui_telefone: Array.isArray(telefonesArr) && telefonesArr.length > 0,
        fonte: 'casa_dos_dados',
        last_seen_at: new Date().toISOString(),
        is_test_record: false,
        data_quality_status: 'complete',
        missing_fields: [],
      };
      for (const k of Object.keys(companyPayload)) {
        if (companyPayload[k] === undefined) delete companyPayload[k];
      }

      const { data: existing } = await supabaseAdmin
        .from('companies')
        .select('id')
        .eq('cnpj', cnpj)
        .maybeSingle();

      let companyId: string;
      let isNewCompany = false;
      if (existing?.id) {
        companyId = existing.id as string;
        const { error } = await (supabaseAdmin as any)
          .from('companies')
          .update(companyPayload)
          .eq('id', companyId);
        if (error) throw new Error(`update company: ${error.message}`);
      } else {
        const { data: ins, error } = await (supabaseAdmin as any)
          .from('companies')
          .insert(companyPayload)
          .select('id')
          .single();
        if (error) throw new Error(`insert company: ${error.message}`);
        companyId = ins.id as string;
        isNewCompany = true;
        
        // Log de auditoria: Importação
        await supabaseAdmin.from('automation_audit_logs').insert({
          company_id: companyId,
          cnpj: cnpj,
          event_type: 'import',
          details: { source: 'casa_dos_dados', batch_date: input.date }
        });
      }

      const { data: existingLink } = await supabaseAdmin
        .from('company_links')
        .select('id, public_token, public_url, checkout_url')
        .eq('company_id', companyId)
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let publicToken: string;
      let publicUrl: string;
      let checkoutUrl: string;
      let isNewLink = false;

      if (existingLink) {
        publicToken = (existingLink as any).public_token as string;
        publicUrl =
          (existingLink as any).public_url ?? `${publicBaseUrl}/c/${publicToken}`;
        checkoutUrl =
          (existingLink as any).checkout_url ??
          `${publicBaseUrl}/checkout/${publicToken}`;
      } else {
        publicToken = crypto.randomUUID().replace(/-/g, '');
        publicUrl = `${publicBaseUrl}/c/${publicToken}`;
        checkoutUrl = `${publicBaseUrl}/checkout/${publicToken}`;
        const { error: lErr } = await supabaseAdmin.from('company_links').insert({
          company_id: companyId,
          public_token: publicToken,
          token: publicToken,
          public_url: publicUrl,
          checkout_url: checkoutUrl,
          active: true,
          status: 'active',
          is_test_record: false,
          data_quality_status: 'complete',
          company_data: {
            cnpj,
            nome: displayName,
            origin: 'casa_dos_dados_simple',
          } as any,
        });
        if (lErr) throw new Error(`insert link: ${lErr.message}`);
        isNewLink = true;

        // Log de auditoria: Link Criado
        await supabaseAdmin.from('automation_audit_logs').insert({
          company_id: companyId,
          cnpj: cnpj,
          event_type: 'link_created',
          details: { token: publicToken, origin: 'simple_flow' }
        });
      }

      imported.push({
        cnpj,
        nome: displayName,
        publicUrl,
        checkoutUrl,
        isNewCompany,
        isNewLink,
      });
    } catch (err: any) {
      failed.push({ cnpj, error: err?.message ?? String(err) });
    }
  }

  return {
    ok: true,
    status: lastStatus,
    apiTotal,
    requested: input.limit,
    page,
    discovered,
    skipped,
    imported,
    failed,
  };
}
