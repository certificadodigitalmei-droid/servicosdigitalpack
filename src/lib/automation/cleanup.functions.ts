import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EMPTY_UUID = "00000000-0000-0000-0000-000000000000";

/**
 * Limpeza total para recomeçar do zero.
 *
 * Apaga: empresas/importações/links não pagos, filas e históricos de e-mail e
 * WhatsApp, itens e campanhas de WhatsApp, execuções de importação e eventos.
 * Preserva: vendas pagas e tudo ligado a elas, configurações do sistema,
 * chaves/segredos, modelos sincronizados, configuração da Chakra e a lista
 * permanente de números bloqueados.
 */
export const cleanupUnsentCompanies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ confirm: z.boolean() }).parse(data))
  .handler(async ({ data, context }) => {
    if (!data.confirm) return { success: false, message: "Ação não confirmada" };

    const { assertAdmin } = await import("@/lib/whatsapp/admin.server");
    await assertAdmin(context.supabase, context.userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db: any = supabaseAdmin;
    const removed: Record<string, number> = {};

    const count = (table: string, n: number) => {
      removed[table] = (removed[table] ?? 0) + n;
    };

    try {
      // 1. Protege tudo que está ligado a uma venda paga.
      const { data: paidOrders } = await db
        .from("orders")
        .select("company_id, customer_id, reference_cnpj")
        .eq("status", "paid");

      const paidCompanyIds = new Set(
        (paidOrders || []).map((o: any) => o.company_id).filter(Boolean) as string[],
      );
      const paidCustomerIds = new Set(
        (paidOrders || []).map((o: any) => o.customer_id).filter(Boolean) as string[],
      );
      const paidCnpjs = new Set(
        (paidOrders || []).map((o: any) => o.reference_cnpj).filter(Boolean) as string[],
      );

      // 2. Tabelas de histórico/fila que podem ser zeradas por completo.
      const wipeAll = async (table: string) => {
        const client: any = db.from(table);
        const { data: rows } = await client.select("id");
        const ids = (rows || []).map((r: any) => r.id);
        for (let i = 0; i < ids.length; i += 1000) {
          await client.delete().in("id", ids.slice(i, i + 1000));
        }
        count(table, ids.length);
      };

      for (const table of [
        "api_logs",
        "link_events",
        "email_send_queue",
        "automatic_company_queue",
        "automatic_company_query_runs",
        "automation_audit_logs",
        "whatsapp_queue",
        "whatsapp_campaign_items",
        "whatsapp_campaigns",
        "webhook_events",
        "sync_runs",
      ]) {
        await wipeAll(table);
      }

      // 3. Tabelas com proteção das vendas pagas (ordem respeita as chaves).
      const deleteWhere = async (
        table: string,
        select: string,
        keep: (row: any) => boolean,
      ) => {
        const client: any = db.from(table);
        const { data: rows } = await client.select(select);
        const ids = (rows || []).filter((r: any) => !keep(r)).map((r: any) => r.id);
        for (let i = 0; i < ids.length; i += 1000) {
          await client.delete().in("id", ids.slice(i, i + 1000));
        }
        count(table, ids.length);
      };

      await deleteWhere("contact_queue", "id, company_id", (r) => r.company_id && paidCompanyIds.has(r.company_id));
      await deleteWhere("email_campaign_recipients", "id, cnpj", (r) => r.cnpj && paidCnpjs.has(r.cnpj));
      await deleteWhere("email_campaigns", "id", () => false);
      await deleteWhere("company_links", "id, company_id", (r) => r.company_id && paidCompanyIds.has(r.company_id));
      await deleteWhere("orders", "id, status", (r) => r.status === "paid");

      // Consentimentos órfãos (pedidos apagados).
      const { data: remainingOrders } = await db.from("orders").select("id");
      const remainingOrderIds = new Set((remainingOrders || []).map((o: any) => o.id));
      await deleteWhere("consent_logs", "id, order_id", (r) => r.order_id && remainingOrderIds.has(r.order_id));

      await deleteWhere("customers", "id", (r) => paidCustomerIds.has(r.id));
      await deleteWhere("link_generations", "id", () => false);
      await deleteWhere("companies", "id", (r) => paidCompanyIds.has(r.id));

      // 4. Zera cursores/estado da importação — sem iniciar nada automaticamente.
      await db
        .from("automatic_company_queries")
        .update({
          enabled: false,
          status: "inactive",
          pagination_cursors: {},
          last_run_at: null,
          next_run_at: null,
          last_error: null,
          heartbeat_at: null,
          lock_token: null,
        })
        .neq("id", EMPTY_UUID);

      await db
        .from("cloud_automation_settings")
        .update({ enabled: false, status: "idle", lock_token: null, lock_heartbeat_at: null })
        .eq("id", 1);

      return {
        success: true,
        removed,
        message:
          "Banco zerado. Foram mantidas as vendas pagas, as configurações, os modelos sincronizados e a lista de números bloqueados.",
      };
    } catch (error: any) {
      console.error("Erro na limpeza absoluta:", error);
      return { success: false, error: error.message };
    }
  });
