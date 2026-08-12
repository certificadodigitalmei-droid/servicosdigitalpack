import { describe, expect, it } from 'vitest';
import {
  correlateByRecipient,
  cumulativeCampaignMetrics,
  phoneMatchKey,
} from '@/lib/whatsapp/webhook-logic';

describe('phoneMatchKey', () => {
  it('iguala o wa_id da Meta (sem o 9) ao número enviado', () => {
    expect(phoneMatchKey('5571982836954')).toBe(phoneMatchKey('557182836954'));
    expect(phoneMatchKey('+55 (11) 99476-2921')).toBe(phoneMatchKey('5511994762921'));
    expect(phoneMatchKey('5537998672187')).toBe(phoneMatchKey('553798672187'));
  });

  it('não confunde números diferentes', () => {
    expect(phoneMatchKey('5511964628439')).not.toBe(phoneMatchKey('5511970810463'));
  });

  it('devolve vazio para entrada inútil', () => {
    expect(phoneMatchKey(null)).toBe('');
    expect(phoneMatchKey('abc')).toBe('');
  });
});

describe('correlateByRecipient', () => {
  const items = [
    { id: 'a', phone: '5571982836954' },
    { id: 'b', phone: '5511964628439' },
  ];

  it('correlaciona quando há exatamente um candidato', () => {
    expect(correlateByRecipient('557182836954', items)).toBe('a');
  });

  it('não adivinha quando há empate', () => {
    const dupes = [
      { id: 'a', phone: '5571982836954' },
      { id: 'c', phone: '557182836954' },
    ];
    expect(correlateByRecipient('5571982836954', dupes)).toBeNull();
  });

  it('ignora itens que já têm wamid', () => {
    expect(correlateByRecipient('557182836954', [{ id: 'a', phone: '5571982836954', wamid: 'w1' }])).toBeNull();
  });

  it('devolve null quando ninguém bate', () => {
    expect(correlateByRecipient('5599999999999', items)).toBeNull();
  });
});

describe('cumulativeCampaignMetrics', () => {
  it('conta a campanha inteira, não uma janela de 24 h', () => {
    const m = cumulativeCampaignMetrics([
      { status: 'sent', delivery_status: 'delivered', wamid: 'w1' },
      { status: 'sent', delivery_status: 'read', wamid: 'w2' },
      { status: 'sent', delivery_status: 'sent', wamid: 'w3' },
      { status: 'blocked', delivery_status: 'failed', wamid: 'w4' },
      { status: 'confirmation_pending', attempt_started_at: '2026-08-11T00:00:00Z' },
      { status: 'pending' },
      { status: 'cancelled' },
    ]);
    expect(m.total).toBe(7);
    expect(m.attempts).toBe(5);
    // "Aceitas pela API" conta HTTP 2xx, inclusive a que a Meta rejeitou depois.
    expect(m.accepted).toBe(4);
    expect(m.metaSent).toBe(3);
    expect(m.delivered).toBe(2);
    expect(m.read).toBe(1);
    expect(m.rejected).toBe(1);
    expect(m.confirmationPending).toBe(1);
    expect(m.queued).toBe(1);
    expect(m.cancelled).toBe(1);
  });

  it('item nunca tentado nunca vira tentativa', () => {
    const m = cumulativeCampaignMetrics([{ status: 'pending' }, { status: 'pending' }]);
    expect(m.attempts).toBe(0);
    expect(m.queued).toBe(2);
  });

  it('aceita sem confirmação da Meta não conta como enviada pela Meta', () => {
    const m = cumulativeCampaignMetrics([{ status: 'sent', delivery_status: 'accepted', wamid: 'w1' }]);
    expect(m.accepted).toBe(1);
    expect(m.metaSent).toBe(0);
  });
});
