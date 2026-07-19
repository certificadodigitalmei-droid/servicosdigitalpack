import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const AQUICNPJ_API_BASE_URL = "https://api.aquicnpj.com"

serve(async (req) => {
  // Configuração de CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } })
  }

  try {
    const apiKey = Deno.env.get("AQUICNPJ_API_KEY")
    if (!apiKey) {
      throw new Error("API Key não configurada no backend")
    }

    // Em um cenário real, consultaríamos a API AquiCNPJ
    // Aqui retornamos dados simulados baseados na documentação técnica fornecida
    const usageData = {
      subscription: "Plano Profissional",
      credits_remaining: 4850,
      credits_used_today: 150,
      next_reset: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString(),
      status: "active"
    }

    return new Response(
      JSON.stringify(usageData),
      { 
        headers: { "Content-Type": "application/json", 'Access-Control-Allow-Origin': '*' },
        status: 200 
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { "Content-Type": "application/json", 'Access-Control-Allow-Origin': '*' },
        status: 500 
      }
    )
  }
})
