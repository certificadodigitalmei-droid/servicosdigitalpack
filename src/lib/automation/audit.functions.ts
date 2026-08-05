import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';

export const getAuditLogs = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => 
    z.object({ 
      cnpj: z.string().optional(),
      limit: z.number().default(100)
    }).parse(data ?? {})
  )
  .handler(async ({ context, data }) => {
    let q = context.supabase
      .from('automation_audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(data.limit);

    if (data.cnpj) {
      q = q.eq('cnpj', data.cnpj.replace(/\D+/g, ''));
    }

    const { data: logs, error } = await q;
    if (error) throw new Error(error.message);

    return logs;
  });
