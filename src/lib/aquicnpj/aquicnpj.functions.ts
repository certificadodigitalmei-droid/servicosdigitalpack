import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { normalizeTelefones, normalizeBoolean, extractTitularName, cleanCNPJ } from "./utils";

const API_BASE = "https://api.aquicnpj.com";

async function logApiCall(endpoint: string, method: string, status: number, duration: number, count: number = 0, error?: string) {
  try {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    await supabaseAdmin.from('api_logs').insert({
      endpoint,
      method,
      status_code: status,
      duration_ms: duration,
      results_count: count,
      error_message: error
    });
  } catch (e) {
    console.error("Failed to log API call:", e);
  }
}

export const getUsageStats = createServerFn({ method: "GET" })
  .handler(async () => {
    const token = process.env.AQUICNPJ_ACCESS_TOKEN;
    if (!token) throw new Error("AQUICNPJ_ACCESS_TOKEN not configured");

    const start = Date.now();
    try {
      const response = await fetch(`${API_BASE}/subscription/usage-stats/`, {
        headers: { 
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });
      const duration = Date.now() - start;
      const data = await response.json();
      
      await logApiCall('/subscription/usage-stats/', 'GET', response.status, duration);
      
      if (!response.ok) {
        if (response.status === 401) throw new Error("Token inválido ou expirado.");
        if (response.status === 403) throw new Error("Seu plano não possui permissão para esta operação.");
        if (response.status === 429) throw new Error("Limite de requisições atingido.");
        throw new Error(`Erro API: ${response.status}`);
      }
      return data;
    } catch (error: any) {
      await logApiCall('/subscription/usage-stats/', 'GET', 500, Date.now() - start, 0, error.message);
      throw error;
    }
  });

export const simpleSearch = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ cnpj: z.string().min(14) }).parse(data))
  .handler(async ({ data }) => {
    const token = process.env.AQUICNPJ_ACCESS_TOKEN;
    if (!token) throw new Error("AQUICNPJ_ACCESS_TOKEN not configured");

    const cnpj = cleanCNPJ(data.cnpj);
    const start = Date.now();
    
    try {
      const response = await fetch(`${API_BASE}/search/empresa/simple`, {
        method: 'POST',
        headers: { 
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query: {
            cnpj: [cnpj],
            phone_type: "celular"
          },
          extras: {
            somente_mei: false,
            com_email: false,
            somente_matriz: false
          },
          page: 1,
          page_size: 8
        })
      });
      
      const duration = Date.now() - start;
      const result = await response.json();
      await logApiCall('/search/empresa/simple', 'POST', response.status, duration, result.total || 0);

      if (!response.ok) throw new Error(`API Error: ${response.status}`);
      if (result.total === 0) return { error: "Empresa não encontrada na AquiCNPJ." };

      const companyData = result.results[0];
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
      
      const { data: saved, error: dbError } = await supabaseAdmin.from('companies').upsert({
        cnpj: companyData.cnpj,
        razao_social: companyData.razao_social,
        nome_titular_exibicao: extractTitularName(companyData.razao_social),
        situacao_cadastral: companyData.situacao_cadastral,
        inicio_atividade: companyData.inicio_atividade,
        raw_data: companyData
      }, { onConflict: 'cnpj' }).select().single();

      if (dbError) console.error("Database upsert error:", dbError);
      
      return saved;
    } catch (error: any) {
      throw error;
    }
  });

export const completeSearch = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ cnpj: z.string().min(14) }).parse(data))
  .handler(async ({ data }) => {
    const token = process.env.AQUICNPJ_ACCESS_TOKEN;
    if (!token) throw new Error("AQUICNPJ_ACCESS_TOKEN not configured");

    const cnpj = cleanCNPJ(data.cnpj);
    const start = Date.now();

    try {
      const response = await fetch(`${API_BASE}/search/empresa/complete/`, {
        method: 'POST',
        headers: { 
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query: { cnpj: [cnpj] }
        })
      });

      const duration = Date.now() - start;
      const result = await response.json();
      await logApiCall('/search/empresa/complete/', 'POST', response.status, duration, result.total || 0);

      if (!response.ok) throw new Error(`API Error: ${response.status}`);
      if (result.total === 0) return { error: "Empresa não encontrada na AquiCNPJ." };

      const companyData = result.results[0];
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
      
      const telefones = normalizeTelefones(companyData.telefones);
      const isMei = normalizeBoolean(companyData.is_mei);

      const { data: saved, error: dbError } = await supabaseAdmin.from('companies').upsert({
        cnpj: companyData.cnpj,
        razao_social: companyData.razao_social,
        nome_titular_exibicao: extractTitularName(companyData.razao_social),
        email: companyData.email,
        telefones: telefones,
        is_mei: isMei,
        situacao_cadastral: companyData.situacao_cadastral,
        inicio_atividade: companyData.inicio_atividade,
        raw_data: companyData
      }, { onConflict: 'cnpj' }).select().single();

      if (dbError) throw dbError;
      return saved;
    } catch (error: any) {
      throw error;
    }
  });
