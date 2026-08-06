import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import {
  countMetrics,
  querySentEmails,
  rangeSchema,
  listSentSchema,
} from './email-metrics.server';
import type { EmailMetrics, SentEmailRow } from './email-metrics.server';

export type { EmailMetrics, SentEmailRow };

export const getEmailMetrics = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => rangeSchema.parse(data) ?? {})
  .handler(async ({ context, data }): Promise<EmailMetrics> => {
    return countMetrics(context.supabase, data?.from ?? null, data?.to ?? null);
  });

export const listSentEmails = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => listSentSchema.parse(data ?? {}))
  .handler(async ({ context, data }): Promise<SentEmailRow[]> => {
    return querySentEmails(context.supabase, data);
  });
