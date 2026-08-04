import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const cleanupUnsentCompanies = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ confirm: z.boolean() }).parse(data))
  .handler(async ({ data }) => {
    if (!data.confirm) return { success: false, message: "Ação não confirmada" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    console.log("Iniciando limpeza total de empresas (exceto pagas)...");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    try {
      // 1. Identificar todas as empresas que JÁ PAGARAM para protegê-las
      const { data: paidOrders } = await supabaseAdmin
        .from("orders")
        .select("company_id")
        .eq("status", "paid");
      
      const paidCompanyIds = new Set((paidOrders || []).map(o => o.company_id).filter(Boolean));

      // 2. Limpar Recipientes de Campanha (quase todos, exceto de empresas pagas)
      // Como não temos company_id direto fácil em recipientes, vamos por CNPJ depois
      
      // 3. Limpar Links de Empresas (company_links)
      const { data: allLinks } = await supabaseAdmin
        .from("company_links")
        .select("id, company_id");
      
      const linksToDelete = (allLinks || [])
        .filter(l => l.company_id && !paidCompanyIds.has(l.company_id))
        .map(l => l.id);

      let linksRemoved = 0;
      if (linksToDelete.length > 0) {
        const { error: errLink } = await supabaseAdmin
          .from("company_links")
          .delete()
          .in("id", linksToDelete);
        if (!errLink) linksRemoved = linksToDelete.length;
      }

      // 4. Limpar Recipientes que não são de empresas pagas
      // Buscamos os CNPJs das empresas pagas para proteger
      const { data: paidCompaniesData } = await supabaseAdmin
        .from("companies")
        .select("cnpj")
        .in("id", Array.from(paidCompanyIds));
      
      const paidCnpjs = (paidCompaniesData || []).map(c => c.cnpj);

      const { data: allRecipients } = await supabaseAdmin
        .from("email_campaign_recipients")
        .select("id, cnpj");
      
      const recipientsToDelete = (allRecipients || [])
        .filter(r => !paidCnpjs.includes(r.cnpj))
        .map(r => r.id);

      let recipientsRemoved = 0;
      if (recipientsToDelete.length > 0) {
        const { error: errRec } = await supabaseAdmin
          .from("email_campaign_recipients")
          .delete()
          .in("id", recipientsToDelete);
        if (!errRec) recipientsRemoved = recipientsToDelete.length;
      }

      // 5. Limpar a tabela de Empresas (companies)
      const { data: allCompanies } = await supabaseAdmin
        .from("companies")
        .select("id");
      
      const companiesToDelete = (allCompanies || [])
        .filter(c => !paidCompanyIds.has(c.id))
        .map(c => c.id);

      let companiesRemoved = 0;
      // Excluir em lotes de 1000 para evitar timeout ou limite de payload
      if (companiesToDelete.length > 0) {
        for (let i = 0; i < companiesToDelete.length; i += 1000) {
          const batch = companiesToDelete.slice(i, i + 1000);
          const { error: errComp } = await supabaseAdmin
            .from("companies")
            .delete()
            .in("id", batch);
          if (!errComp) companiesRemoved += batch.length;
        }
      }

      return {
        success: true,
        removed: {
          recipients: recipientsRemoved,
          links: linksRemoved,
          companies: companiesRemoved
        }
      };
    } catch (error: any) {
      console.error("Erro na limpeza:", error);
      return { success: false, error: error.message };
    }
  });
