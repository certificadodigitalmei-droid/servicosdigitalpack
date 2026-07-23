import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export type TemplatePayload = {
  design?: Record<string, any>;
  subject?: string;
  preheader?: string;
  fromName?: string;
  fromAddress?: string;
  replyTo?: string;
  updatedAt?: string;
};

export const loadMessageTemplate = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TemplatePayload | null> => {
    const { data, error } = await context.supabase
      .from('message_templates')
      .select('payload, updated_at')
      .eq('user_id', context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return { ...(data.payload as any), updatedAt: data.updated_at };
  });

const payloadSchema = z.object({
  design: z.record(z.any()).optional(),
  subject: z.string().max(500).optional(),
  preheader: z.string().max(500).optional(),
  fromName: z.string().max(200).optional(),
  fromAddress: z.string().max(200).optional(),
  replyTo: z.string().max(200).optional(),
});

export const saveMessageTemplate = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => payloadSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true; updatedAt: string }> => {
    const { data: row, error } = await context.supabase
      .from('message_templates')
      .upsert({ user_id: context.userId, payload: data }, { onConflict: 'user_id' })
      .select('updated_at')
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, updatedAt: row.updated_at as string };
  });
