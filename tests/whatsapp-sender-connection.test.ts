import { describe, it, expect } from 'vitest';
import {
  SEND_CONNECTION_MAX_AGE_MS,
  isConnectionFresh,
  decideConnectionFreshness,
} from '@/lib/whatsapp/senders-logic';

const NOW = Date.parse('2026-08-10T21:00:00.000Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe('validade da conexão antes de enviar', () => {
  it('aceita confirmação dentro dos 10 minutos', () => {
    expect(isConnectionFresh(ago(9 * 60_000), NOW, SEND_CONNECTION_MAX_AGE_MS)).toBe(true);
    expect(isConnectionFresh(ago(SEND_CONNECTION_MAX_AGE_MS), NOW, SEND_CONNECTION_MAX_AGE_MS)).toBe(true);
  });

  it('recusa confirmação vencida, ausente ou inválida', () => {
    expect(isConnectionFresh(ago(11 * 60_000), NOW, SEND_CONNECTION_MAX_AGE_MS)).toBe(false);
    expect(isConnectionFresh(null, NOW, SEND_CONNECTION_MAX_AGE_MS)).toBe(false);
    expect(isConnectionFresh('não-é-data', NOW, SEND_CONNECTION_MAX_AGE_MS)).toBe(false);
  });

  it('libera sem consultar quando a confirmação está recente', () => {
    const r = decideConnectionFreshness({ lastSeenAt: ago(60_000), now: NOW, resyncAttempted: false });
    expect(r).toEqual({ ok: true, error: null });
  });

  it('bloqueia quando venceu e nenhuma consulta foi tentada', () => {
    const r = decideConnectionFreshness({ lastSeenAt: ago(20 * 60_000), now: NOW, resyncAttempted: false });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/sincronize a conexão/i);
  });

  it('libera quando a nova consulta renova a confirmação', () => {
    const r = decideConnectionFreshness({
      lastSeenAt: ago(1_000),
      now: NOW,
      resyncAttempted: true,
      resyncOk: true,
    });
    expect(r).toEqual({ ok: true, error: null });
  });

  it('bloqueia com o motivo quando a consulta falha', () => {
    const r = decideConnectionFreshness({
      lastSeenAt: ago(30 * 60_000),
      now: NOW,
      resyncAttempted: true,
      resyncOk: false,
      resyncError: 'falha de rede',
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('falha de rede');
  });

  it('bloqueia quando a consulta funciona mas a confirmação continua vencida', () => {
    const r = decideConnectionFreshness({
      lastSeenAt: ago(30 * 60_000),
      now: NOW,
      resyncAttempted: true,
      resyncOk: true,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/sem confirmação recente/i);
  });
});
