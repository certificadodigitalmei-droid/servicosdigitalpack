// Helpers server-only para envio oficial de WhatsApp via ChakraHQ (WhatsApp Business API).

export type WaApiSettings = {
  id: number;
  provider: string;
  base_url: string;
  channel_id: string | null;
  template_name: string | null;
  template_language: string;
  template_body: string | null;
  variable_map: string[];
  active: boolean;
  daily_limit: number;
  batch_size: number;
  min_delay_ms: number;
  last_error: string | null;
};

export function normalizePhone(raw: string | null | undefined, ddd?: string | null): string | null {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, '');
  if (digits.length <= 9 && ddd) digits = String(ddd).replace(/\D/g, '') + digits;
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return '55' + digits;
  return digits.length >= 12 ? digits : null;
}

export function pickCompanyPhone(company: { ddd?: string | null; telefones?: unknown }): string | null {
  const list = Array.isArray(company.telefones) ? (company.telefones as any[]) : [];
  const celular = list.find((t) => String(t?.tipo ?? '').toLowerCase() === 'celular') ?? list[0];
  return normalizePhone(celular?.numero ?? null, celular?.ddd ?? company.ddd ?? null);
}

export function renderTemplateBody(body: string | null, vars: string[]): string {
  if (!body) return vars.join(' | ');
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, i) => vars[Number(i) - 1] ?? '');
}

export type SendResult = { ok: true; messageId: string | null } | { ok: false; error: string };

export async function sendChakraTemplate(opts: {
  endpoint: string;
  apiKey: string;
  channelId: string | null;
  to: string;
  templateName: string;
  language: string;
  variables: string[];
}): Promise<SendResult> {
  const payload: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    to: opts.to,
    type: 'template',
    template: {
      name: opts.templateName,
      language: { code: opts.language },
      components: opts.variables.length
        ? [
            {
              type: 'body',
              parameters: opts.variables.map((text) => ({ type: 'text', text })),
            },
          ]
        : [],
    },
  };
  if (opts.channelId) payload['channel_id'] = opts.channelId;

  let res: Response;
  try {
    res = await fetch(opts.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiKey}`,
        'X-API-Key': opts.apiKey,
      },
      body: JSON.stringify(payload),
    });
  } catch (e: any) {
    return { ok: false, error: `falha de rede: ${e?.message ?? 'desconhecida'}` };
  }

  const text = await res.text();
  if (!res.ok) return { ok: false, error: `[${res.status}] ${text.slice(0, 500)}` };
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* resposta não-JSON */
  }
  const messageId =
    json?.messages?.[0]?.id ?? json?.message_id ?? json?.id ?? json?.data?.id ?? null;
  return { ok: true, messageId: messageId ? String(messageId) : null };
}
