import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const cleanupUnsentCompanies = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ confirm: z.boolean() }).parse(data))
  .handler(async ({ data }) => {
    if (!data.confirm) return { success: false, message: "Ação não confirmada" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    console.log("Iniciando limpeza ABSOLUTA de todos os registros (exceto pedidos pagos)...");

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

      const allTableCleanup = async (tableName: string) => {
        // Custom logic per table for protection
        if (tableName === "companies") {
          const { data: all } = await supabaseAdmin.from("companies").select("id");
          const toDelete = (all || []).filter(c => !paidCompanyIds.has(c.id)).map(c => c.id);
          if (toDelete.length > 0) {
            for (let i = 0; i < toDelete.length; i += 1000) {
              await supabaseAdmin.from("companies").delete().in("id", toDelete.slice(i, i + 1000));
            }
          }
        } else if (tableName === "customers") {
          const { data: all } = await supabaseAdmin.from("customers").select("id");
          const toDelete = (all || []).filter(c => !paidCustomerIds.has(c.id)).map(c => c.id);
          if (toDelete.length > 0) {
            await supabaseAdmin.from("customers").delete().in("id", toDelete);
          }
        } else if (tableName === "orders") {
          await supabaseAdmin.from("orders").delete().neq("status", "paid");
        } else if (tableName === "company_links") {
          const { data: all } = await supabaseAdmin.from("company_links").select("id, company_id");
          const toDelete = (all || []).filter(l => l.company_id && !paidCompanyIds.has(l.company_id)).map(l => l.id);
          if (toDelete.length > 0) {
            await supabaseAdmin.from("company_links").delete().in("id", toDelete);
          }
        } else if (tableName === "email_campaign_recipients") {
          const { data: all } = await supabaseAdmin.from("email_campaign_recipients").select("id, cnpj");
          const toDelete = (all || []).filter(r => !r.cnpj || !paidCnpjs.includes(r.cnpj)).map(r => r.id);
          if (toDelete.length > 0) {
            await supabaseAdmin.from("email_campaign_recipients").delete().in("id", toDelete);
          }
        } else if (tableName === "contact_queue") {
          const { data: all } = await supabaseAdmin.from("contact_queue").select("id, company_id");
          const toDelete = (all || []).filter(q => !q.company_id || !paidCompanyIds.has(q.company_id)).map(q => q.id);
          if (toDelete.length > 0) {
            await supabaseAdmin.from("contact_queue").delete().in("id", toDelete);
          }
        }
      };

      // Full wipe of logs, events, and queues using generic delete to avoid TS2589
      console.log("Wiping logs and queues...");
      const wipe = async (table: any) => supabaseAdmin.from(table).delete().neq("id" as any, "00000000-0000-0000-0000-000000000000" as any);
      
      await Promise.all([
        wipe("api_logs"),
        wipe("link_events"),
        wipe("email_send_queue"),
        wipe("automatic_company_queue"),
        wipe("automatic_company_query_runs"),
        wipe("whatsapp_queue"),
        wipe("webhook_events"),
        wipe("sync_runs")
      ]);

      // Wipe core tables with protection
      console.log("Wiping core tables (protected)...");
      await allTableCleanup("contact_queue");
      await allTableCleanup("email_campaign_recipients");
      await allTableCleanup("company_links");
      await allTableCleanup("orders");
      await allTableCleanup("customers");
      
      // Consent logs linked to deleted orders
      const { data: allConsent } = await supabaseAdmin.from("consent_logs").select("id, order_id");
      const { data: remainingOrders } = await supabaseAdmin.from("orders").select("id");
      const remainingOrderIds = new Set((remainingOrders || []).map(o => o.id));
      const consentToDelete = (allConsent || []).filter(c => !c.order_id || !remainingOrderIds.has(c.order_id)).map(c => c.id);
      if (consentToDelete.length > 0) {
        await supabaseAdmin.from("consent_logs").delete().in("id", consentToDelete);
      }

      await allTableCleanup("companies");

      return {
        success: true,
        message: "LITERALMENTE TUDO LIMPO. O painel está zerado e pronto para um novo começo, mantendo apenas as vendas confirmadas."
      };
    } catch (error: any) {
      console.error("Erro na limpeza absoluta:", error);
      return { success: false, error: error.message };
    }
  });
