import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const cleanupUnsentCompanies = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ confirm: z.boolean() }).parse(data))
  .handler(async ({ data }) => {
    if (!data.confirm) return { success: false, message: "Ação não confirmada" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    console.log("Iniciando limpeza profunda de todos os dados (exceto pedidos pagos)...");

    try {
      // 1. Identificar todas as empresas que JÁ PAGARAM para protegê-las
      const { data: paidOrders } = await supabaseAdmin
        .from("orders")
        .select("company_id, customer_id, reference_cnpj")
        .eq("status", "paid");
      
      const paidCompanyIds = new Set((paidOrders || [])
        .map(o => o.company_id)
        .filter((id): id is string => !!id));
      
      const paidCustomerIds = new Set((paidOrders || [])
        .map(o => o.customer_id)
        .filter((id): id is string => !!id));

      const paidCnpjs = (paidOrders || [])
        .map(o => o.reference_cnpj)
        .filter((cnpj): cnpj is string => !!cnpj);

      // 2. Limpar Campanhas de Email (exceto destinatários de empresas pagas)
      const { data: allRecipients } = await supabaseAdmin
        .from("email_campaign_recipients")
        .select("id, cnpj");
      
      const recipientsToDelete = (allRecipients || [])
        .filter(r => !r.cnpj || !paidCnpjs.includes(r.cnpj))
        .map(r => r.id);

      if (recipientsToDelete.length > 0) {
        await supabaseAdmin.from("email_campaign_recipients").delete().in("id", recipientsToDelete);
      }

      // 3. Limpar Links de Empresas (company_links)
      const { data: allLinks } = await supabaseAdmin
        .from("company_links")
        .select("id, company_id");
      
      const linksToDelete = (allLinks || [])
        .filter(l => l.company_id && !paidCompanyIds.has(l.company_id))
        .map(l => l.id);

      if (linksToDelete.length > 0) {
        await supabaseAdmin.from("company_links").delete().in("id", linksToDelete);
      }

      // 4. Limpar Pedidos Pendentes/Cancelados (orders)
      // IMPORTANTE: Deletamos apenas os que NÃO são 'paid'
      await supabaseAdmin.from("orders").delete().neq("status", "paid");

      // 5. Limpar Clientes (customers) que não têm pedidos pagos
      const { data: allCustomers } = await supabaseAdmin.from("customers").select("id");
      const customersToDelete = (allCustomers || [])
        .filter(c => !paidCustomerIds.has(c.id))
        .map(c => c.id);

      if (customersToDelete.length > 0) {
        await supabaseAdmin.from("customers").delete().in("id", customersToDelete);
      }

      // 6. Limpar Logs de Consentimento (consent_logs)
      const { data: allConsent } = await supabaseAdmin.from("consent_logs").select("id, order_id");
      const { data: existingOrders } = await supabaseAdmin.from("orders").select("id");
      const existingOrderIds = new Set((existingOrders || []).map(o => o.id));
      const consentToDelete = (allConsent || [])
        .filter(c => !c.order_id || !existingOrderIds.has(c.order_id))
        .map(c => c.id);
      
      if (consentToDelete.length > 0) {
        await supabaseAdmin.from("consent_logs").delete().in("id", consentToDelete);
      }

      // 7. Limpar a tabela de Empresas (companies) que não pagaram
      const { data: allCompanies } = await supabaseAdmin.from("companies").select("id");
      const companiesToDelete = (allCompanies || [])
        .filter(c => !paidCompanyIds.has(c.id))
        .map(c => c.id);

      if (companiesToDelete.length > 0) {
        for (let i = 0; i < companiesToDelete.length; i += 1000) {
          const batch = companiesToDelete.slice(i, i + 1000);
          await supabaseAdmin.from("companies").delete().in("id", batch);
        }
      }

      return {
        success: true,
        message: "Limpeza profunda concluída. O painel está zerado, mantendo apenas vendas confirmadas."
      };
    } catch (error: any) {
      console.error("Erro na limpeza profunda:", error);
      return { success: false, error: error.message };
    }
  });
