import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { checkSenderDns } from './dns-status.server';

/**
 * Status de verificação DNS (NS / SPF / DKIM / MX) do domínio de envio
 * configurado no Lovable Cloud → E-mails.
 */
export const getSenderDnsStatus = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async () => checkSenderDns());
