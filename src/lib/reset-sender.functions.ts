import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export const forceResetSender = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    
    // Verifica admin
    const { data: role } = await context.supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', context.userId)
      .eq('role', 'admin')
      .maybeSingle();
      
    if (!role) throw new Error('Unauthorized');

    const { data: existing } = await supabaseAdmin
      .from('site_settings')
      .select('id')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const payload = {
      from_email: 'certificado.mei.estadual@notify.seu-certificado-mei-digital.online',
      from_name: 'Certificado Digital MEI',
      reply_to: 'certificadodigitalmei@gmail.com',
      updated_at: new Date().toISOString(),
    };

    if (existing?.id) {
      await supabaseAdmin.from('site_settings').update(payload).eq('id', existing.id);
    } else {
      await supabaseAdmin.from('site_settings').insert(payload);
    }

    return { ok: true };
  });
