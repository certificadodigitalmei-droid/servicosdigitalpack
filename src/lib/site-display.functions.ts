import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export type SiteDisplaySettings = {
  show_cert_landing: boolean;
  show_cert_success: boolean;
};

const DEFAULTS: SiteDisplaySettings = {
  show_cert_landing: true,
  show_cert_success: true,
};

export const getSiteDisplay = createServerFn({ method: 'GET' }).handler(async (): Promise<SiteDisplaySettings> => {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data } = await supabaseAdmin
    .from('site_display_settings')
    .select('show_cert_landing, show_cert_success')
    .eq('id', 1)
    .maybeSingle();
  if (!data) return DEFAULTS;
  return {
    show_cert_landing: data.show_cert_landing ?? true,
    show_cert_success: data.show_cert_success ?? true,
  };
});

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

export const saveSiteDisplay = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        show_cert_landing: z.boolean(),
        show_cert_success: z.boolean(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { error } = await supabaseAdmin
      .from('site_display_settings')
      .upsert({ id: 1, ...data, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
