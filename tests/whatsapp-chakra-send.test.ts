import { describe, it, expect, vi } from 'vitest';
import {
  buildSendTemplateUrl,
  extractMessageId,
  extractErrorMessage,
  sendChakraTemplate,
  fetchChakraTemplateStatus,
} from '@/lib/whatsapp/chakra.server';

function jsonRes(body: any, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const base = {
  apiBaseUrl: 'https://api.chakrahq.com',
  apiKey: 'secret-key',
  pluginId: '3f095662-d969-42b0-a41e-e729e1f46328',
  whatsappPhoneNumberId: '1290004607527438',
  to: '5511999999999',
  templateName: 'certificado1',
  language: 'pt_BR',
  razao: 'Empresa Teste',
  cnpj: '12345678000199',
  buttonToken: 'ABC123TOKEN',
};

describe('endpoint ChakraHQ', () => {
  it('monta a URL por destinatário', () => {
    expect(buildSendTemplateUrl('https://api.chakrahq.com/', 'plug', '5511999999999')).toBe(
      'https://api.chakrahq.com/v1/ext/plugin/whatsapp/plug/phoneNumber/5511999999999/send-template-message',
    );
  });
});

describe('sendChakraTemplate', () => {
  it('usa endpoint correto, mapping e buttonMapping com token puro', async () => {
    const fetchImpl = vi.fn(async () => jsonRes({ _data: { externalId: 'wamid.1' } }));
    const res = await sendChakraTemplate({ ...base, fetchImpl: fetchImpl as any });

    expect(res).toEqual({ ok: true, messageId: 'wamid.1' });
    const [url, init] = fetchImpl.mock.calls[0] as any[];
    expect(url).toBe(
      `https://api.chakrahq.com/v1/ext/plugin/whatsapp/${base.pluginId}/phoneNumber/5511999999999/send-template-message`,
    );
    expect(init.headers.Authorization).toBe('Bearer secret-key');
    expect(init.headers['X-API-Key']).toBeUndefined();
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      whatsappPhoneNumberId: '1290004607527438',
      templateName: 'certificado1',
      mapping: [
        { schemaPropertyName: 'razao', schemaPropertyValue: 'Empresa Teste' },
        { schemaPropertyName: 'cnpj', schemaPropertyValue: '12345678000199' },
      ],
      buttonMapping: [{ schemaPropertyName: '1', schemaPropertyValue: 'ABC123TOKEN' }],
      language: 'pt_BR',
    });
    expect(body.buttonMapping[0].schemaPropertyValue).not.toContain('http');
  });

  it('não chama a API quando o item não tem token', async () => {
    const fetchImpl = vi.fn();
    const res = await sendChakraTemplate({ ...base, buttonToken: '', fetchImpl: fetchImpl as any });
    expect(res.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('trata _errors de forma legível sem expor o token', async () => {
    const fetchImpl = vi.fn(async () => jsonRes({ _errors: [{ message: 'template not approved' }] }, 400));
    const res = await sendChakraTemplate({ ...base, fetchImpl: fetchImpl as any });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain('template not approved');
      expect(res.error).not.toContain('secret-key');
    }
  });

  it('extrai ids em formatos suportados', () => {
    expect(extractMessageId({ _data: { externalId: 'a' } })).toBe('a');
    expect(extractMessageId({ _data: { id: 'b' } })).toBe('b');
    expect(extractMessageId({ _data: { whatsappMessageId: 'c' } })).toBe('c');
    expect(extractMessageId({ messages: [{ id: 'd' }] })).toBe('d');
    expect(extractMessageId({})).toBeNull();
    expect(extractErrorMessage({ _errors: ['x'] }, 'fb')).toBe('x');
  });
});

describe('fetchChakraTemplateStatus', () => {
  it('localiza o template e devolve o status', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonRes({ _data: { data: [{ name: 'outro', status: 'APPROVED' }, { name: 'certificado1', status: 'pending' }] } }),
    );
    const res = await fetchChakraTemplateStatus({
      apiBaseUrl: 'https://api.chakrahq.com',
      apiKey: 'secret-key',
      apiVersion: 'v19.0',
      wabaId: '1996285911002627',
      templateName: 'certificado1',
      fetchImpl: fetchImpl as any,
    });
    expect(res).toEqual({ ok: true, status: 'PENDING' });
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'https://api.chakrahq.com/v1/ext/plugin/whatsapp/api/v19.0/1996285911002627/message_templates?limit=100',
    );
  });

  it('reporta falha de versão claramente', async () => {
    const fetchImpl = vi.fn(async () => jsonRes({ _errors: [{ message: 'unsupported version' }] }, 400));
    const res = await fetchChakraTemplateStatus({
      apiBaseUrl: 'https://api.chakrahq.com',
      apiKey: 'secret-key',
      apiVersion: 'v99.0',
      wabaId: '1996285911002627',
      templateName: 'certificado1',
      fetchImpl: fetchImpl as any,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('v99.0');
  });
});
