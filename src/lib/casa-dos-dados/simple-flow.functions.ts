// Fluxo SIMPLES para Casa dos Dados.
// Uma única chamada por lote: /v5/cnpj/pesquisa?tipo_resultado=completo
// devolve os dados completos e consome 1 crédito por CNPJ retornado.
// Não usa fila, cursor, worker ou consulta individual.

import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data inválida');

const filtersSchema = z
  .object({
    only_mei: z.boolean().default(true),
    only_active: z.boolean().default(true),
    only_matriz: z.boolean().default(true),
    require_email: z.boolean().default(false),
  })
  .default({ only_mei: true, only_active: true, only_matriz: true, require_email: false });

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('forbidden: admin role required');
}

// ---------------------------------------------------------------------------
// SALDO (grátis)
// ---------------------------------------------------------------------------
export const getSaldo = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { checkSaldo } = await import('./client.server');
    const r = await checkSaldo({ timeoutMs: 10_000 });
    return { status: r.status, ok: r.ok, body: JSON.stringify(r.body) };
  });

// ---------------------------------------------------------------------------
// CONTAGEM (grátis — limite=1, sem tipo_resultado=completo)
// ---------------------------------------------------------------------------
export const countByDate = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ date: dateSchema, filters: filtersSchema }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { countOpeningsByDate } = await import('./client.server');
    const r = await countOpeningsByDate({
      filters: data.filters,
      date: data.date,
      timeoutMs: 15_000,
    });
    return { ok: r.ok, status: r.status, total: r.total, date: r.date };
  });

// ---------------------------------------------------------------------------
// IMPORTAR LOTE — 1 chamada, N CNPJs completos, N créditos.
// ---------------------------------------------------------------------------
export const importBatch = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        date: dateSchema,
        filters: filtersSchema,
        // Cada CNPJ faz 1 chamada extra de detalhe (~1-2s). 15 cabe no
        // orçamento seguro do worker (~45s).
        limit: z.number().int().min(1).max(15).default(10),
        page: z.number().int().min(1).max(200).default(1),
      })
      .parse(d),
  )

  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);

    const { searchOpeningsByDate, fetchCompanyDetailsByCnpj } = await import('./client.server');
    const { normalizeCasaDosDadosCompany } = await import('./worker-logic');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const publicBaseUrl = (process.env.PUBLIC_APP_URL ?? '').replace(/\/+$/, '');

    // 1) DESCOBERTA (grátis): pesquisa simples só para pegar os CNPJs.
    const r = await searchOpeningsByDate({
      filters: data.filters,
      date: data.date,
      limit: data.limit,
      page: data.page,
      completo: false,
      timeoutMs: 20_000,
    });

    if (!r.ok) {
      return {
        ok: false as const,
        status: r.status,
        error: `API respondeu ${r.status}`,
        imported: [] as Array<any>,
        apiTotal: r.total,
      };
    }


    const imported: Array<{
      cnpj: string;
      nome: string;
      publicUrl: string;
      checkoutUrl: string;
      isNewCompany: boolean;
      isNewLink: boolean;
    }> = [];
    const failed: Array<{ cnpj: string; error: string }> = [];

    for (const rawBase of r.items) {
      const nBase = normalizeCasaDosDadosCompany(rawBase);
      const cnpj = nBase.cnpj;
      if (!cnpj || cnpj.length !== 14) continue;

      let enrichmentError: string | null = null;
      try {
        // 2) ENRIQUECIMENTO (paga): /v4/cnpj/{cnpj} — 1 crédito, dados completos
        //    (endereço, telefone, e-mail, CNAE, sócios, etc).
        let n = nBase;
        let raw: Record<string, unknown> = rawBase;
        try {
          const detail = await fetchCompanyDetailsByCnpj(cnpj, { timeoutMs: 15_000 });
          if (detail.ok && detail.item) {
            raw = detail.item as Record<string, unknown>;
            n = normalizeCasaDosDadosCompany(raw);
          } else {
            enrichmentError = `detalhe respondeu ${detail.status}`;
            console.warn('[simple-flow] enrichment failed', cnpj, detail.status, detail.rawPreview);
          }
        } catch (e) {
          enrichmentError = e instanceof Error ? e.message : String(e);
          console.warn('[simple-flow] enrichment threw', cnpj, enrichmentError);
        }

        const displayName =
          (n.razao_social ?? nBase.razao_social ?? '').replace(/^\d+[.\-/\s]*/, '').trim() ||
          n.nome_fantasia ||
          cnpj;

        const rawAny = raw as any;
        const estab = rawAny?.estabelecimento && typeof rawAny.estabelecimento === 'object'
          ? rawAny.estabelecimento
          : rawAny;
        // v4 nesta ordem: raw.endereco.*, raw.contato_telefonico[], raw.contato_email[]
        const endObj = (rawAny?.endereco && typeof rawAny.endereco === 'object' && !Array.isArray(rawAny.endereco))
          ? rawAny.endereco : null;

        // Telefones: v4 -> contato_telefonico [{completo, ddd, numero, tipo}]
        const contatoTel = Array.isArray(rawAny?.contato_telefonico) ? rawAny.contato_telefonico : [];
        const telefonesArr = contatoTel.length
          ? contatoTel.map((t: any) => ({
              numero: t?.completo ?? t?.numero ?? null,
              ddd: t?.ddd ?? null,
              tipo: t?.tipo ?? null,
            }))
          : (Array.isArray(rawAny?.telefones) ? rawAny.telefones
            : (Array.isArray(estab?.telefones) ? estab.telefones
              : (n.telefone ? [{ numero: n.telefone }] : [])));

        // CNAEs: v4 -> atividade_principal + atividade_secundaria
        const cnaePrinc = rawAny?.atividade_principal
          ?? rawAny?.cnae_fiscal ?? estab?.cnae_fiscal
          ?? rawAny?.cnae_principal ?? estab?.cnae_principal ?? null;
        const cnaePrincCodigo = typeof cnaePrinc === 'object' && cnaePrinc
          ? (cnaePrinc.codigo ?? cnaePrinc.id ?? null)
          : (rawAny?.cnae_fiscal_codigo ?? estab?.cnae_fiscal_codigo ?? null);
        const cnaePrincDesc = typeof cnaePrinc === 'object' && cnaePrinc
          ? (cnaePrinc.descricao ?? cnaePrinc.nome ?? null)
          : (rawAny?.cnae_fiscal_descricao ?? estab?.cnae_fiscal_descricao ?? null);
        const cnaesSec = Array.isArray(rawAny?.atividade_secundaria)
          ? rawAny.atividade_secundaria
          : (Array.isArray(rawAny?.cnaes_secundarios) ? rawAny.cnaes_secundarios
            : (Array.isArray(estab?.cnaes_secundarios) ? estab.cnaes_secundarios : []));

        // Sócios
        const socios = Array.isArray(rawAny?.quadro_societario)
          ? rawAny.quadro_societario
          : (Array.isArray(rawAny?.qsa) ? rawAny.qsa
            : (Array.isArray(rawAny?.socios) ? rawAny.socios : []));

        // MEI / Simples — v4 traz objetos { optante, ... }
        const isMei = !!(rawAny?.mei?.optante ?? rawAny?.opcao_pelo_mei ?? estab?.opcao_pelo_mei);
        const isSimples = !!(rawAny?.simples?.optante ?? rawAny?.opcao_pelo_simples ?? estab?.opcao_pelo_simples);

        // Porte / Natureza
        const porteDesc = rawAny?.porte_empresa?.descricao ?? rawAny?.porte?.descricao ?? rawAny?.porte ?? null;
        const naturezaId = rawAny?.codigo_natureza_juridica ?? rawAny?.natureza_juridica?.codigo ?? rawAny?.natureza_juridica ?? null;

        const companyPayload: Record<string, unknown> = {
          cnpj,
          razao_social_original: n.razao_social ?? nBase.razao_social,
          nome_fantasia: n.nome_fantasia ?? nBase.nome_fantasia,
          nome_titular_exibicao: displayName,
          email: n.email,
          uf: n.uf ?? endObj?.uf ?? null,
          municipio_descricao: n.municipio ?? endObj?.municipio ?? null,
          municipio_codigo: (endObj?.ibge?.codigo_municipio ?? estab?.municipio?.codigo ?? estab?.codigo_municipio ?? null) as any,
          situacao_cadastral_desc: n.situacao_cadastral,
          situacao_cadastral_data: (rawAny?.situacao_cadastral?.data ?? estab?.situacao_cadastral?.data ?? null) as any,
          inicio_atividade: n.data_abertura,
          is_matriz: n.matriz_filial ? /matriz/i.test(n.matriz_filial) : undefined,
          is_filial: n.matriz_filial ? /filial/i.test(n.matriz_filial) : undefined,
          is_mei: isMei,
          is_simples: isSimples,
          logradouro: (endObj?.logradouro ?? estab?.logradouro ?? rawAny?.logradouro ?? null) as any,
          tipo_logradouro: (endObj?.tipo_logradouro ?? estab?.tipo_logradouro ?? rawAny?.tipo_logradouro ?? null) as any,
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
          if (companyPayload[k] === undefined || companyPayload[k] === null) {
            // mantém null para campos essenciais; remove undefined
            if (companyPayload[k] === undefined) delete companyPayload[k];
          }
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
        }

        // Link: reaproveita ativo, senão cria.
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
          publicUrl = (existingLink as any).public_url ?? `${publicBaseUrl}/c/${publicToken}`;
          checkoutUrl =
            (existingLink as any).checkout_url ?? `${publicBaseUrl}/checkout/${publicToken}`;
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
      ok: true as const,
      status: r.status,
      apiTotal: r.total,
      requested: data.limit,
      page: data.page,
      received: r.items.length,
      imported,
      failed,
    };
  });
