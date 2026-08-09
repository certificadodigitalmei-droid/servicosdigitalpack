import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

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

    try {
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
      const { executeAtomicCleanup } = await import('@/lib/automation/cleanup.server');
      return await executeAtomicCleanup(supabaseAdmin);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      console.error('Erro na limpeza transacional:', error);
      return { success: false, message: 'Nenhuma alteração foi confirmada.', error: message, removed: {}, remaining: {} };
    }
  });
