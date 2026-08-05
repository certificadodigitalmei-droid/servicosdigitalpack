
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { z } from 'zod';
import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export const getAutomationStatus = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Busca qualquer registro (o primeiro que encontrar) para ver o estado global.
    // O sistema usa uma única flag global que não depende da empresa importada.
    const { data: config } = await context.supabase
      .from('automatic_company_queries')
      .select('enabled, last_run_at, status')
      .limit(1)
      .maybeSingle();

    const { data: lastEmail } = await context.supabase
      .from('email_send_queue')
      .select('created_at')
      .eq('status', 'sent')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      isAutoEnabled: !!config,
      lastRunAt: config?.last_run_at || null,
      lastEmailSentAt: lastEmail?.created_at || null,
      status: config?.status || 'idle'
    };
  });

export const toggleGlobalAutomation = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ enabled: z.boolean() }).parse(data))
  .handler(async ({ data, context }) => {
    // 1. Atualiza as configurações de importação automática
    await context.supabase
      .from('automatic_company_queries')
      .update({ enabled: data.enabled })
      .not('id', 'is', null);

    // 2. Se habilitado, garante que o próximo run seja imediato se estiver parado
    if (data.enabled) {
      await context.supabase
        .from('automatic_company_queries')
        .update({ next_run_at: new Date().toISOString() })
        .eq('enabled', true);
    }

    return { success: true };
  });
