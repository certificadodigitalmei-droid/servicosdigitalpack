import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

const InputSchema = z.object({
  dataUrl: z.string().min(10),
  filename: z.string().optional(),
});

export const uploadEmailAsset = createServerFn({ method: 'POST' })
  .inputValidator((data) => InputSchema.parse(data))
  .handler(async ({ data }) => {
    const match = /^data:([\w./+-]+);base64,(.+)$/.exec(data.dataUrl);
    if (!match) throw new Error('dataUrl inválido');
    const mime = match[1];
    const b64 = match[2];
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

    if (bytes.byteLength > 800 * 1024) throw new Error('Imagem muito grande (max 800KB)');

    const ext = (mime.split('/')[1] || 'bin').replace('+xml', '').split(';')[0];
    const key = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { error } = await supabaseAdmin.storage
      .from('email-assets')
      .upload(key, bytes, { contentType: mime, upsert: false, cacheControl: '31536000' });
    if (error) throw new Error(error.message);

    return { url: `${getPublicBaseUrl()}/api/public/email-asset/${key}` };
  });
