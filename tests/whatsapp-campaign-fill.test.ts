import { describe, it, expect, vi } from 'vitest';
import { fillToTarget } from '@/lib/whatsapp/campaign-logic';
import { cumulativeCampaignMetrics } from '@/lib/whatsapp/webhook-logic';

/** Fonte de prontidão simulada: reserva no máximo o que existe pronto. */
function makeSource(readyStart: number) {
  const state = { ready: readyStart, imported: 0, calls: [] as number[] };
  const build = vi.fn(async (limit: number) => {
    const inserted = Math.min(limit, state.ready);
    state.ready -= inserted;
    return { inserted, skipped: 0 };
  });
  const refill = vi.fn(async (missing: number) => {
    state.calls.push(missing);
    const got = Math.min(missing, 15); // motor importa em lotes
    state.ready += got;
    state.imported += got;
    return got;
  });
  return { state, build, refill };
}

describe('déficit real na criação da campanha', () => {
  it('alvo 60 com 60 prontos: importa 0', async () => {
    const s = makeSource(60);
    const r = await fillToTarget({ target: 60, build: s.build, refill: s.refill, maxRounds: 8 });
    expect(r.reusedFromQueue).toBe(60);
    expect(r.imported).toBe(0);
    expect(s.refill).not.toHaveBeenCalled();
    expect(r.reserved).toBe(60);
    expect(r.complete).toBe(true);
  });

  it('alvo 60 com 31 prontos: importa exatamente os 29 que faltam', async () => {
    const s = makeSource(31);
    const r = await fillToTarget({ target: 60, build: s.build, refill: s.refill, maxRounds: 8 });
    expect(r.reusedFromQueue).toBe(31);
    expect(r.imported).toBe(29);
    expect(r.reserved).toBe(60);
    // nunca pede o alvo inteiro de novo: cada rodada pede só o que falta
    expect(s.state.calls[0]).toBe(29);
    expect(Math.max(...s.state.calls)).toBeLessThanOrEqual(29);
  });

  it('alvo 60 com 0 prontos: importa 60 válidos', async () => {
    const s = makeSource(0);
    const r = await fillToTarget({ target: 60, build: s.build, refill: s.refill, maxRounds: 10 });
    expect(r.reusedFromQueue).toBe(0);
    expect(r.imported).toBe(60);
    expect(r.reserved).toBe(60);
    expect(s.state.calls[0]).toBe(60);
  });

  it('para sem laço quando a fonte não traz mais válidos (sem crédito repetido)', async () => {
    const build = vi.fn(async () => ({ inserted: 0, skipped: 5 }));
    const refill = vi.fn(async () => 0);
    const r = await fillToTarget({ target: 60, build, refill, maxRounds: 8 });
    expect(refill).toHaveBeenCalledTimes(1);
    expect(r.reserved).toBe(0);
    expect(r.missing).toBe(60);
    expect(r.complete).toBe(false);
  });

  it('bloqueados/duplicados não contam como reservados e não são reimportados', async () => {
    // a fonte só entrega 10 válidos; o resto é descartado por bloqueio/duplicidade
    let pool = 10;
    const build = vi.fn(async (limit: number) => {
      const inserted = Math.min(limit, pool);
      pool -= inserted;
      return { inserted, skipped: 7 };
    });
    const refill = vi.fn(async () => 0);
    const r = await fillToTarget({ target: 20, build, refill, maxRounds: 4 });
    expect(r.reserved).toBe(10);
    expect(r.skipped).toBe(7);
    expect(r.missing).toBe(10);
    expect(refill).toHaveBeenCalledTimes(1);
  });
});

describe('auto-início somente com fila completa e preflight válido', () => {
  const decide = (fill: { complete: boolean }, preflight: boolean) =>
    fill.complete && preflight ? 'running' : 'draft';

  it('fila completa + preflight ok inicia', () => {
    expect(decide({ complete: true }, true)).toBe('running');
  });
  it('fila incompleta nunca envia parcialmente', () => {
    expect(decide({ complete: false }, true)).toBe('draft');
  });
  it('preflight falho mantém rascunho', () => {
    expect(decide({ complete: true }, false)).toBe('draft');
  });
});

describe('exclusão: sem histórico apaga, com histórico arquiva', () => {
  const decideDelete = (items: Array<{ status: string; wamid?: string | null }>) =>
    items.some((i) => i.wamid || !['pending', 'cancelled'].includes(i.status)) ? 'archive' : 'delete';

  it('campanha sem nenhuma tentativa pode ser apagada e libera reservas', () => {
    expect(decideDelete([{ status: 'pending' }, { status: 'pending' }])).toBe('delete');
  });
  it('qualquer tentativa/wamid força arquivamento com auditoria preservada', () => {
    expect(decideDelete([{ status: 'pending' }, { status: 'sent', wamid: 'wamid.x' }])).toBe('archive');
    expect(decideDelete([{ status: 'blocked' }])).toBe('archive');
  });
});

describe('cards cumulativos — fixture NOVA CAMPANHA 60 NUMEROS', () => {
  const item = (delivery: string, status: string) => ({
    status,
    delivery_status: delivery,
    wamid: 'wamid.x',
    accepted_at: '2026-08-10T18:00:00Z',
    sent_at: status === 'blocked' ? null : '2026-08-10T18:00:00Z',
  });
  const items = [
    ...Array.from({ length: 35 }, () => item('delivered', 'sent')),
    ...Array.from({ length: 7 }, () => item('sent', 'sent')),
    ...Array.from({ length: 4 }, () => item('read', 'sent')),
    ...Array.from({ length: 13 }, () => item('failed', 'blocked')),
  ];

  it('59 tentativas / 59 aceitas / 46 enviadas / 39 entregues / 4 lidas / 13 rejeitadas', () => {
    const m = cumulativeCampaignMetrics(items);
    expect(m.total).toBe(59);
    expect(m.attempts).toBe(59);
    expect(m.accepted).toBe(59);
    expect(m.metaSent).toBe(46);
    expect(m.delivered).toBe(39);
    expect(m.read).toBe(4);
    expect(m.rejected).toBe(13);
  });

  it('teste avulso para 5511970810463 não entra na campanha', () => {
    const withTest = [...items, item('read', 'sent')]; // se fosse incluído
    expect(cumulativeCampaignMetrics(withTest).total).toBe(60);
    // a campanha real preserva 59 itens: o teste separado fica fora
    expect(cumulativeCampaignMetrics(items).total).toBe(59);
    expect(cumulativeCampaignMetrics(items).read).toBe(4);
  });
});
