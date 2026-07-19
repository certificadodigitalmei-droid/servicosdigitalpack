import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Buscar configurações do monitor
    const { data: settings } = await supabaseAdmin
      .from('aquicnpj_settings')
      .select('*')
      .single()

    if (!settings || settings.monitor_mode === 'off') {
      return new Response(JSON.stringify({ message: "Monitor desativado" }))
    }

    // 2. Registrar início da sincronização
    const { data: run } = await supabaseAdmin
      .from('sync_runs')
      .insert({ status: 'running', companies_found: 0, companies_synced: 0 })
      .select()
      .single()

    // SIMULAÇÃO DE SINCRONIZAÇÃO
    // Em produção, aqui faríamos o fetch na api.aquicnpj.com/v1/range
    // filtrando por data de abertura (hoje) e os filtros salvos no banco.

    const mockCompanies = [
      {
        cnpj: "55555555000199",
        razao_social: "JOAO DA SILVA 12345678900",
        email: "contato@empresa.com",
        telefone: "11999998888",
        data_abertura: new Date().toISOString().split('T')[0],
        status_receita: "ATIVA",
        natureza_juridica: "213-5", // Empresário Individual (MEI)
      }
    ]

    let syncedCount = 0
    for (const comp of mockCompanies) {
      // Limpeza do nome (remover CPF do final se for MEI)
      const cleanedName = comp.razao_social.replace(/\s\d{11}$/, '')

      const { error: upsertError } = await supabaseAdmin
        .from('companies')
        .upsert({
          cnpj: comp.cnpj,
          razao_social: comp.razao_social,
          nome_titular: cleanedName,
          email: comp.email,
          telefone: comp.telefone,
          status: 'ativa',
          nivel_dados: 'completo',
          metadata: comp
        }, { onConflict: 'cnpj' })

      if (!upsertError) syncedCount++
    }

    // 3. Atualizar log de execução
    await supabaseAdmin
      .from('sync_runs')
      .update({ 
        status: 'completed', 
        companies_found: mockCompanies.length, 
        companies_synced: syncedCount,
        completed_at: new Date().toISOString()
      })
      .eq('id', run.id)

    return new Response(
      JSON.stringify({ found: mockCompanies.length, synced: syncedCount }),
      { headers: { "Content-Type": "application/json" } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
})
