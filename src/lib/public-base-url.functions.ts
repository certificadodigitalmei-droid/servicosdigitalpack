import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

/**
 * O navegador informa o domínio em que o site está sendo acessado. Se for um
 * domínio próprio (não preview/localhost), ele passa a ser a base de todos os
 * links públicos — inclusive os botões dos e-mails enviados pelo servidor.
 */
export const syncPublicBaseUrl = createServerFn({ method: 'POST' })
  .inputValidator((data) => z.object({ origin: z.string().min(1).max(300) }).parse(data))
  .handler(async ({ data }): Promise<{ baseUrl: string }> => {
    const { persistPublicBaseUrl } = await import('@/lib/public-base-url.server');
    const baseUrl = await persistPublicBaseUrl(data.origin);
    return { baseUrl };
  });
