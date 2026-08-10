import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Testes do comportamento "troca de dia" na aba Consulta Automática.
 * Nenhuma chamada real à Casa dos Dados: o módulo de funções é mockado.
 */

type Deferred = { promise: Promise<any>; resolve: (v: any) => void };
function deferred(): Deferred {
  let resolve!: (v: any) => void;
  const promise = new Promise<any>((r) => (resolve = r));
  return { promise, resolve };
}

const pending: Array<{ date: string; d: Deferred }> = [];

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ in: async () => ({ data: [] }) }),
      delete: () => ({ neq: async () => ({}) }),
    }),
  },
}));
vi.mock('@/lib/casa-dos-dados/simple-flow.functions', () => ({
  countByDate: ({ data }: any) => {
    const d = deferred();
    pending.push({ date: data.date, d });
    return d.promise;
  },
  listByDate: async () => ({ date: '', total: 0, ok: true, status: 200, items: [] }),
  importBatch: async () => ({ ok: true, rows: [] }),
  getSaldo: async () => ({ ok: true, status: 200, body: '' }),
}));

const engine = await import('@/lib/automation/consulta-engine');
const { consultaStore, changeQueryDate, runCountOnce } = engine;

function settle() {
  return new Promise((r) => setTimeout(r, 0));
}

describe('troca de data na Consulta Automática', () => {
  beforeEach(() => {
    pending.length = 0;
    consultaStore.set({
      dateMode: 'specific',
      selectedDate: '2026-08-01',
      foundList: [
        {
          cnpj: '11111111000191',
          nome: 'A',
          fantasia: null,
          uf: 'SP',
          municipio: 'SP',
          firstSeenAt: new Date().toISOString(),
        },
      ],
      foundListKey: '2026-08-01|x',
      countResult: { date: '2026-08-01', total: 42, ok: true, status: 200 },
      listDialogOpen: true,
      isCounting: false,
    });
  });

  it('A → B: zera resultados imediatamente, entra em carregamento e mostra só B', async () => {
    changeQueryDate({ mode: 'specific', date: '2026-08-05' });

    // Imediato: lista/contagem/diálogo zerados e loading ligado.
    let s = consultaStore.get();
    expect(s.foundList).toEqual([]);
    expect(s.countResult).toBeNull();
    expect(s.listDialogOpen).toBe(false);
    expect(s.isCounting).toBe(true);
    expect(s.selectedDate).toBe('2026-08-05');

    // A consulta automática da nova data foi disparada.
    expect(pending.map((p) => p.date)).toEqual(['2026-08-05']);

    pending[0]!.d.resolve({ date: '2026-08-05', total: 7, ok: true, status: 200 });
    await settle();

    s = consultaStore.get();
    expect(s.isCounting).toBe(false);
    expect(s.countResult).toEqual({ date: '2026-08-05', total: 7, ok: true, status: 200 });
  });

  it('resposta atrasada da data A é ignorada e não repõe dados antigos', async () => {
    // Consulta de A em voo…
    const runA = runCountOnce({ silent: true });
    expect(pending[0]!.date).toBe('2026-08-01');

    // …usuário troca para B antes de A responder.
    changeQueryDate({ mode: 'specific', date: '2026-08-05' });
    const b = pending.find((p) => p.date === '2026-08-05')!;

    b.d.resolve({ date: '2026-08-05', total: 3, ok: true, status: 200 });
    await settle();
    expect(consultaStore.get().countResult?.date).toBe('2026-08-05');

    // A responde depois: deve ser descartada.
    pending[0]!.d.resolve({ date: '2026-08-01', total: 999, ok: true, status: 200 });
    await runA;
    await settle();

    const s = consultaStore.get();
    expect(s.countResult).toEqual({ date: '2026-08-05', total: 3, ok: true, status: 200 });
    expect(s.isCounting).toBe(false);
  });

  it('alternar entre hoje e data específica também zera os resultados', async () => {
    changeQueryDate({ mode: 'today' });
    const s = consultaStore.get();
    expect(s.dateMode).toBe('today');
    expect(s.foundList).toEqual([]);
    expect(s.countResult).toBeNull();
    expect(s.isCounting).toBe(true);
    pending[0]!.d.resolve({ date: s.selectedDate, total: 1, ok: true, status: 200 });
    await settle();
  });

  it('reescolher o mesmo dia não dispara nova consulta nem limpa nada', () => {
    changeQueryDate({ mode: 'specific', date: '2026-08-01' });
    expect(pending.length).toBe(0);
    expect(consultaStore.get().foundList.length).toBe(1);
    expect(consultaStore.get().countResult?.total).toBe(42);
  });
});
