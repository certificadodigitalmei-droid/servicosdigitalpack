
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { z } from 'zod';
import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export const getAutomationStatus = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Estado persistente do "Modo Nuvem" (linha única id = 1).
    const { data: cloud } = await context.supabase
      .from('cloud_automation_settings')
      .select('enabled, last_run_at, status')
      .eq('id', 1)
      .maybeSingle();

    const { data: lastEmail } = await context.supabase
      .from('email_send_queue')
      .select('updated_at')
      .eq('status', 'sent')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      isAutoEnabled: !!cloud?.enabled,
      lastRunAt: cloud?.last_run_at || null,
      lastEmailSentAt: lastEmail?.updated_at || null,
      status: cloud?.status || 'idle',
    };
  });

export const toggleGlobalAutomation = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ enabled: z.boolean() }).parse(data))
  .handler(async ({ data, context }) => {
    // 1. Persiste o interruptor global (sobrevive a recarregar a página).
    const { error } = await context.supabase
      .from('cloud_automation_settings')
      .upsert(
        { id: 1, enabled: data.enabled, status: data.enabled ? 'active' : 'idle' },
        { onConflict: 'id' },
      );
    if (error) throw new Error(error.message);

    // 2. Espelha nas automações de importação existentes (se houver).
    await context.supabase
      .from('automatic_company_queries')
      .update({
        enabled: data.enabled,
        ...(data.enabled ? { next_run_at: new Date().toISOString() } : {}),
      })
      .not('id', 'is', null);

    return { success: true, enabled: data.enabled };
  });
