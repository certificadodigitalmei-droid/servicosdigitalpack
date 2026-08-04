import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const cleanupUnsentCompanies = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ confirm: z.boolean() }).parse(data))
  .handler(async ({ data }) => {
    if (!data.confirm) return { success: false, message: "Ação não confirmada" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    console.log("Iniciando limpeza de empresas sem e-mail enviado...");

    try {
      // 1. Remover recipientes de campanhas que não tiveram e-mail enviado
      const { data: recipients, error: err1 } = await supabaseAdmin
        .from("email_campaign_recipients")
        .delete()
        .is("sent_at", null)
        .select("id");

      if (err1) throw err1;

      // 2. Remover links que não tiveram e-mail enviado e nunca foram acessados
      const { data: links, error: err2 } = await supabaseAdmin
        .from("company_links")
        .delete()
        .is("promo_email_sent_at", null)
        .eq("access_count", 0)
        .select("id");

      if (err2) throw err2;

      // 3. Remover empresas que não possuem nenhum link (ou seja, não tem mais rastro de envio ou interesse)
      // Nota: Buscamos empresas que não aparecem na tabela company_links nem em email_campaign_recipients
      // Como o Supabase não suporta subqueries complexas no .delete() via SDK facilmente,
      // e o usuário quer liberar espaço, vamos focar nos links e recipientes que são o maior volume.
      
      // Para limpar a tabela 'companies' (que contém os dados pesados de CNPJ):
      // Precisamos rodar um RPC ou fazer uma busca por lotes.
      // Vou buscar empresas que foram criadas há mais de 10 minutos (para não apagar as que estão sendo importadas agora)
      // e que não tem links associados.
      
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      
      // Pegamos um lote de empresas antigas
      const { data: oldCompanies } = await supabaseAdmin
        .from("companies")
        .select("id, cnpj")
        .lt("created_at", tenMinutesAgo)
        .limit(1000);

      let companiesRemoved = 0;
      if (oldCompanies && oldCompanies.length > 0) {
        for (const company of oldCompanies) {
          // Verifica se ainda tem algum link ou e-mail vinculado
          const { count: linkCount } = await supabaseAdmin
            .from("company_links")
            .select("*", { count: 'exact', head: true })
            .eq("company_id", company.id);

          const { count: recipientCount } = await supabaseAdmin
            .from("email_campaign_recipients")
            .select("*", { count: 'exact', head: true })
            .eq("cnpj", company.cnpj);
            
          const { count: orderCount } = await supabaseAdmin
            .from("orders")
            .select("*", { count: 'exact', head: true })
            .eq("company_id", company.id);

          if (linkCount === 0 && recipientCount === 0 && orderCount === 0) {
            await supabaseAdmin.from("companies").delete().eq("id", company.id);
            companiesRemoved++;
          }
        }
      }

      return {
        success: true,
        removed: {
          recipients: recipients?.length || 0,
          links: links?.length || 0,
          companies: companiesRemoved
        }
      };
    } catch (error: any) {
      console.error("Erro na limpeza:", error);
      return { success: false, error: error.message };
    }
  });
