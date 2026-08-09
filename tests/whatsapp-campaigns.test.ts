import { describe, it, expect, vi } from 'vitest';
import {
  PACE_PRESETS,
  MIN_INTERVAL_SECONDS,
  resolveIntervalSeconds,
  estimateDurationSeconds,
  formatDuration,
  approvedTemplates,
  otherTemplates,
  selectEligibleCompanies,
  remainingDailyCap,
  parseRetryAfterMs,
  decideFailureAction,
  canImportNextBatch,
  messagesPerHour,
} from '@/lib/whatsapp/campaign-logic';
import { parseChakraTemplate, fetchChakraTemplates } from '@/lib/whatsapp/templates.server';
import { sendChakraTemplate, classifyWhatsappError, statusFromError } from '@/lib/whatsapp/chakra.server';

function jsonRes(body: any, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) } as unknown as Response;
}

const TEMPLATES = [
  { name: 'certificado1', status: 'APPROVED' },
  { name: 'consulta_certificado_mei_v1', status: 'PENDING' },
  ...Array.from({ length: 10 }, (_, i) => ({
    name: `aviso_cnpj_mei_${String(i + 1).padStart(2, '0')}`,
    status: i % 2 === 0 ? 'APPROVED' : 'REJECTED',
  })),
];

describe('sincronização de modelos', () => {
  it('sincroniza a lista sem presumir aprovação e só oferece APPROVED para envio', async () => {
    const fetchImpl = vi.fn(async () => jsonRes({ _data: { data: TEMPLATES.map((t) => ({ ...t, language: 'pt_BR' })) } }));
    const res = await fetchChakraTemplates({
      apiBaseUrl: 'https://api.chakrahq.com',
      apiKey: 'k',
      apiVersion: 'v19.0',
      wabaId: '1996285911002627',
      fetchImpl: fetchImpl as any,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.templates).toHaveLength(12);

    const sendable = approvedTemplates(res.templates).map((t) => t.name);
    expect(sendable).toContain('certificado1');
    expect(sendable).not.toContain('consulta_certificado_mei_v1');
    expect(sendable).not.toContain('aviso_cnpj_mei_02');
    expect(otherTemplates(res.templates).map((t) => t.name)).toContain('consulta_certificado_mei_v1');
  });

  it('extrai metadados do modelo (idioma, botão, variáveis)', () => {
    const t = parseChakraTemplate({
      name: 'certificado1',
      language: 'pt_BR',
      category: 'MARKETING',
      status: 'approved',
      components: [
        { type: 'HEADER', text: 'Atenção: Verifique seu CNPJ' },
        { type: 'BODY', text: 'Olá, {{razao}} CNPJ {{cnpj}}' },
        { type: 'FOOTER', text: 'Central MEI' },
        { type: 'BUTTONS', buttons: [{ text: 'Clique aqui - VERIFICAR', url: 'https://seu-certificado-mei-digital.online/c/{{1}}' }] },
      ],
    });
    expect(t.status).toBe('APPROVED');
    expect(t.button_label).toBe('Clique aqui - VERIFICAR');
    expect(t.variables).toEqual(['razao', 'cnpj']);
    expect(t.header_text).toContain('Verifique');
  });

  it('não chama a API real e reporta erro legível', async () => {
    const fetchImpl = vi.fn(async () => jsonRes({ _errors: [{ message: 'unsupported version' }] }, 400));
    const res = await fetchChakraTemplates({
      apiBaseUrl: 'https://api.chakrahq.com',
      apiKey: 'secret',
      apiVersion: 'v99.0',
      wabaId: 'w',
      fetchImpl: fetchImpl as any,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain('unsupported version');
      expect(res.error).not.toContain('secret');
    }
  });
});

describe('ritmo de envio', () => {
  it('presets conservadores', () => {
    expect(PACE_PRESETS.cautious.intervalSeconds).toBe(60);
    expect(PACE_PRESETS.recommended.intervalSeconds).toBe(30);
    expect(PACE_PRESETS.moderate.intervalSeconds).toBe(15);
    expect(messagesPerHour(30)).toBe(120);
  });

  it('personalizado nunca fica abaixo do mínimo seguro', () => {
    expect(resolveIntervalSeconds('custom', 1)).toBe(MIN_INTERVAL_SECONDS);
    expect(resolveIntervalSeconds('custom', 45)).toBe(45);
    expect(resolveIntervalSeconds('cautious', 1)).toBe(60);
  });

  it('estimativa de duração', () => {
    expect(estimateDurationSeconds(1, 30)).toBe(0);
    expect(estimateDurationSeconds(100, 30)).toBe(99 * 30);
    expect(formatDuration(99 * 30)).toBe('50 min');
    expect(formatDuration(3600)).toBe('1 h');
  });
});

describe('seleção de empresas elegíveis', () => {
  const base = (i: number, over: Record<string, unknown> = {}) => ({
    id: `c${i}`,
    cnpj: `1122233300018${i}`,
    razao_social_original: `Empresa ${i}`,
    whatsapp_phone_e164: `551199999000${i}`,
    created_at: `2026-01-0${i}T00:00:00Z`,
    ...over,
  });

  it('pega as primeiras X mais antigas e ignora inválidos', () => {
    const companies = [
      base(1),
      base(2, { whatsapp_phone_e164: '551133334444' }), // fixo
      base(3, { whatsapp_phone_e164: '5511999990003' }), // bloqueado
      base(4, { cnpj: '' }), // sem CNPJ
      base(5), // sem link
      base(6),
      base(7),
    ];
    const linkByCompany = new Map(
      ['c1', 'c2', 'c3', 'c4', 'c6', 'c7'].map((id) => [id, { id: `l${id}`, token: `T${id}` }]),
    );
    const res = selectEligibleCompanies({
      companies,
      linkByCompany,
      blockedPhones: new Set(['5511999990003']),
      limit: 2,
    });
    expect(res.selected.map((s) => s.companyId)).toEqual(['c1', 'c6']);
    expect(res.skipped.blocked).toBe(1);
    expect(res.skipped.noPhone).toBe(1);
    expect(res.skipped.noCnpj).toBe(1);
    expect(res.skipped.noLink).toBe(1);
    expect(res.selected[0]!.token).toBe('Tc1');
  });

  it('não duplica empresa nem telefone já usados na campanha', () => {
    const companies = [base(1), base(6)];
    const linkByCompany = new Map([
      ['c1', { id: 'l1', token: 'T1' }],
      ['c6', { id: 'l6', token: 'T6' }],
    ]);
    const res = selectEligibleCompanies({
      companies,
      linkByCompany,
      blockedPhones: new Set(),
      alreadyUsedCompanyIds: new Set(['c1']),
      alreadyUsedPhones: new Set(['5511999990006']),
      limit: 10,
    });
    expect(res.selected).toHaveLength(0);
    expect(res.skipped.duplicate).toBe(2);
  });
});

describe('limites, falhas e retomada', () => {
  it('teto de 24h nunca é ultrapassado', () => {
    expect(remainingDailyCap(250, 0)).toBe(250);
    expect(remainingDailyCap(250, 250)).toBe(0);
    expect(remainingDailyCap(250, 400)).toBe(0);
  });

  it('respeita Retry-After em 429', () => {
    expect(parseRetryAfterMs('120')).toBe(120_000);
    expect(parseRetryAfterMs(null)).toBeNull();
    const d = decideFailureAction({ kind: 'temporary', status: 429, attempts: 1, retryAfterMs: 120_000 });
    expect(d.action).toBe('retry');
    expect(d.delayMs).toBe(120_000);
  });

  it('5xx e rede são temporários com backoff crescente e limite de tentativas', () => {
    const a = decideFailureAction({ kind: 'temporary', status: 503, attempts: 1 });
    const b = decideFailureAction({ kind: 'temporary', status: 503, attempts: 3 });
    expect(a.action).toBe('retry');
    expect(b.delayMs).toBeGreaterThan(a.delayMs);
    expect(decideFailureAction({ kind: 'temporary', status: 503, attempts: 4 }).action).toBe('fail');
  });

  it('401/403 e erro de configuração pausam a campanha', () => {
    expect(decideFailureAction({ kind: 'config', status: 401, attempts: 1 }).action).toBe('pause');
    expect(decideFailureAction({ kind: 'config', status: 403, attempts: 1 }).action).toBe('pause');
    expect(classifyWhatsappError(401, 'unauthorized')).toBe('config');
  });

  it('destinatário inexistente bloqueia permanentemente', () => {
    const kind = classifyWhatsappError(400, 'recipient is not a valid whatsapp user');
    expect(kind).toBe('permanent_recipient');
    expect(decideFailureAction({ kind, status: 400, attempts: 1 }).action).toBe('block');
    expect(statusFromError('[400] erro')).toBe(400);
  });

  it('modo contínuo só importa quando a fila termina', () => {
    expect(canImportNextBatch({ continuousMode: true, pendingItems: 3, status: 'running' })).toBe(false);
    expect(canImportNextBatch({ continuousMode: true, pendingItems: 0, status: 'running' })).toBe(true);
    expect(canImportNextBatch({ continuousMode: false, pendingItems: 0, status: 'running' })).toBe(false);
    expect(canImportNextBatch({ continuousMode: true, pendingItems: 0, status: 'paused' })).toBe(false);
  });
});

describe('envio por item usa o modelo da campanha', () => {
  it('cada item envia com o próprio template e dados da empresa', async () => {
    const fetchImpl = vi.fn(async () => jsonRes({ _data: { externalId: 'wamid.x' } }));
    const common = {
      apiBaseUrl: 'https://api.chakrahq.com',
      apiKey: 'k',
      pluginId: 'p',
      whatsappPhoneNumberId: 'pn',
      language: 'pt_BR',
      fetchImpl: fetchImpl as any,
    };
    await sendChakraTemplate({ ...common, to: '5511999990001', templateName: 'aviso_cnpj_mei_01', razao: 'A', cnpj: '11222333000181', buttonToken: 'T1' });
    await sendChakraTemplate({ ...common, to: '5511999990002', templateName: 'aviso_cnpj_mei_01', razao: 'B', cnpj: '99888777000166', buttonToken: 'T2' });

    const b1 = JSON.parse((fetchImpl.mock.calls[0] as any[])[1].body);
    const b2 = JSON.parse((fetchImpl.mock.calls[1] as any[])[1].body);
    expect(b1.templateName).toBe('aviso_cnpj_mei_01');
    expect(b2.templateName).toBe('aviso_cnpj_mei_01');
    expect(b1.mapping[0].schemaPropertyValue).toBe('A');
    expect(b2.buttonMapping[0].schemaPropertyValue).toBe('T2');
  });

  it('teste envia com os dados da empresa mas só para o número digitado', async () => {
    const fetchImpl = vi.fn(async () => jsonRes({ _data: { externalId: 'wamid.t' } }));
    await sendChakraTemplate({
      apiBaseUrl: 'https://api.chakrahq.com',
      apiKey: 'k',
      pluginId: 'p',
      whatsappPhoneNumberId: 'pn',
      to: '5511988887777', // número digitado pelo administrador
      templateName: 'certificado1',
      language: 'pt_BR',
      razao: 'Padaria Real',
      cnpj: '11222333000181',
      buttonToken: 'TOKEN_DA_EMPRESA',
      fetchImpl: fetchImpl as any,
    });
    const [url, init] = fetchImpl.mock.calls[0] as any[];
    expect(url).toContain('/phoneNumber/5511988887777/');
    const body = JSON.parse(init.body);
    expect(body.mapping[0].schemaPropertyValue).toBe('Padaria Real');
    expect(body.buttonMapping[0].schemaPropertyValue).toBe('TOKEN_DA_EMPRESA');
  });
});

describe('sincronização paginada', () => {
  it('percorre todas as páginas e persiste todos os modelos, incluindo consulta_certificado_mei_v1', async () => {
    const all = [
      ...Array.from({ length: 10 }, (_, i) => ({
        name: `aviso_cnpj_mei_${String(i + 1).padStart(2, '0')}`,
        language: 'pt_BR',
        status: 'PENDING',
      })),
      { name: 'certificado1', language: 'pt_BR', status: 'PENDING' },
      { name: 'consulta_certificado_mei_v1', language: 'pt_BR', status: 'APPROVED' },
      { name: 'aprovado_extra', language: 'pt_BR', status: 'APPROVED' },
    ];
    const pageSize = 5;
    const fetchImpl = vi.fn(async (url: string) => {
      const m = /after=([^&]+)/.exec(url);
      const start = m ? Number(decodeURIComponent(m[1]!)) : 0;
      const slice = all.slice(start, start + pageSize);
      const next = start + pageSize < all.length ? { cursors: { after: String(start + pageSize) }, next: 'x' } : {};
      return jsonRes({ _data: { data: slice, paging: next } });
    });

    const res = await fetchChakraTemplates({
      apiBaseUrl: 'https://api.chakrahq.com',
      apiKey: 'k',
      apiVersion: 'v19.0',
      wabaId: '1996285911002627',
      pageSize,
      fetchImpl: fetchImpl as any,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(1);
    expect(res.templates).toHaveLength(13);
    const names = res.templates.map((t) => t.name);
    expect(names).toContain('consulta_certificado_mei_v1');
    expect(names).toContain('aviso_cnpj_mei_10');

    const sendable = approvedTemplates(res.templates).map((t) => t.name);
    expect(sendable.sort()).toEqual(['aprovado_extra', 'consulta_certificado_mei_v1']);
    const unavailable = otherTemplates(res.templates).map((t) => t.name);
    expect(unavailable).toHaveLength(11);
    expect(unavailable).toContain('certificado1');
  });
});
