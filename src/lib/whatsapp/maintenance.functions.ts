import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('forbidden: admin role required');
}

/** Apaga empresas/links importados sem celular brasileiro válido. */
export const purgeNoMobileCompanies = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({}).parse(d ?? {}))
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { purgeCompaniesWithoutMobile } = await import('./maintenance.server');
    return purgeCompaniesWithoutMobile();
  });

/** Apaga empresas cujo envio de WhatsApp falhou definitivamente. */
export const purgeSendFailedCompanies = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({}).parse(d ?? {}))
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { purgeFailedCompanies } = await import('./maintenance.server');
    return purgeFailedCompanies();
  });
