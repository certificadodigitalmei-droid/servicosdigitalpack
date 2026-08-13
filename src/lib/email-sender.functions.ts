import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export type EmailSenderSettings = {
  from_email: string;
  from_name: string;
  reply_to: string | null;
  logo_url: string | null;
};

const DEFAULTS: EmailSenderSettings = {
  from_email: 'contato@certificadodigitalmeiestadual.online',
  from_name: 'Digital Certifica A1',
  reply_to: 'contato@certificadodigitalmeiestadual.online',
  logo_url: null,
};

export const getEmailSenderSettings = createServerFn({ method: 'GET' }).handler(
  async (): Promise<EmailSenderSettings> => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data } = await supabaseAdmin
      .from('site_settings')
      .select('from_email, from_name, reply_to, logo_url')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      from_email: data?.from_email || DEFAULTS.from_email,
      from_name: data?.from_name || DEFAULTS.from_name,
      reply_to: data?.reply_to || DEFAULTS.reply_to,
      logo_url: data?.logo_url || DEFAULTS.logo_url,
    };
  },
);

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

/** Só é possível enviar por endereços do domínio verificado (SPF/DKIM/DMARC). */
export const ALLOWED_SENDER_DOMAIN = 'certificadodigitalmeiestadual.online';

const onAllowedDomain = (v: string) => {
  const d = v.trim().toLowerCase().split('@')[1] ?? '';
  return d === ALLOWED_SENDER_DOMAIN || d.endsWith(`.${ALLOWED_SENDER_DOMAIN}`);
};

const saveSchema = z.object({
  from_email: z
    .string()
    .email('E-mail remetente inválido')
    .max(200)
    .refine(onAllowedDomain, `O remetente precisa terminar em @${ALLOWED_SENDER_DOMAIN}`),
  from_name: z.string().min(1, 'Nome do remetente é obrigatório').max(200),
  reply_to: z.string().email('E-mail de resposta inválido').max(200).or(z.literal('')).optional().nullable(),
  logo_url: z.string().max(600).optional().nullable(),
});


export const saveEmailSenderSettings = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => saveSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const { data: existing } = await supabaseAdmin
      .from('site_settings')
      .select('id')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const payload = {
      from_email: data.from_email.trim().toLowerCase(),
      from_name: data.from_name.trim(),
      reply_to: (data.reply_to && data.reply_to.trim()) ? data.reply_to.trim().toLowerCase() : null,
      logo_url: data.logo_url?.trim() || null,
      updated_at: new Date().toISOString(),
    };

    if (existing?.id) {
      const { error } = await supabaseAdmin.from('site_settings').update(payload).eq('id', existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from('site_settings').insert(payload);
      if (error) throw new Error(error.message);
    }

    return { ok: true };
  });
