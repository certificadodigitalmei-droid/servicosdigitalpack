import { describe, it, expect } from 'vitest';
import {
  parseWhatsappWebhook,
  canApplyStatus,
  itemStatusForDelivery,
  computePendingQueue,
  normalizeDeliveryStatus,
  FINAL_FAILURE_CODES,
} from '@/lib/whatsapp/webhook-logic';

const metaPayload = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: '1996285911002627',
      changes: [
        {
          value: {
            messaging_product: 'whatsapp',
            statuses: [
              { id: 'wamid.AAA', status: 'sent', timestamp: '1760000000', recipient_id: '5511999999999' },
              { id: 'wamid.BBB', status: 'delivered', timestamp: '1760000100', recipient_id: '5511988888888' },
              {
                id: 'wamid.CCC',
                status: 'failed',
                timestamp: '1760000200',
                recipient_id: '5595998419270',
                errors: [
                  {
                    code: 131026,
                    title: 'Message undeliverable',
                    error_data: { details: 'Message could not be delivered' },
                  },
                ],
              },
            ],
          },
          field: 'messages',
        },
      ],
    },
  ],
};

describe('parsing do webhook', () => {
  it('lê o formato bruto da Meta com status e erros', () => {
    const parsed = parseWhatsappWebhook(metaPayload);
    expect(parsed.statuses).toHaveLength(3);
    const failed = parsed.statuses.find((s) => s.status === 'failed')!;
    expect(failed.wamid).toBe('wamid.CCC');
    expect(failed.errorCode).toBe('131026');
    expect(failed.errorTitle).toBe('Message undeliverable');
    expect(failed.finalFailure).toBe(true);
    expect(failed.recipient).toBe('5595998419270');
  });

  it('lê mensagens recebidas (inbound)', () => {
    const parsed = parseWhatsappWebhook({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [{ id: 'wamid.IN', from: '5511999999999', timestamp: '1760000300', text: { body: 'oi' } }],
              },
            },
          ],
        },
      ],
    });
    expect(parsed.inbound).toEqual([
      expect.objectContaining({ wamid: 'wamid.IN', from: '5511999999999', text: 'oi' }),
    ]);
  });

  it('aceita o formato amigável da Chakra sem quebrar o bruto', () => {
    const parsed = parseWhatsappWebhook({
      _data: { externalId: 'wamid.DDD', id: 'chakra-1', deliveryStatus: 'DELIVERED' },
    });
    expect(parsed.statuses[0]).toMatchObject({ wamid: 'wamid.DDD', status: 'delivered' });
  });

  it('deduplica eventos repetidos no mesmo lote (idempotência)', () => {
    const parsed = parseWhatsappWebhook({
      statuses: [
        { id: 'wamid.AAA', status: 'delivered', timestamp: 1760000000 },
        { id: 'wamid.AAA', status: 'delivered', timestamp: 1760000000 },
      ],
    });
    expect(parsed.statuses).toHaveLength(1);
  });

  it('ignora status desconhecido', () => {
    expect(normalizeDeliveryStatus('whatever')).toBeNull();
    expect(parseWhatsappWebhook({ id: 'wamid.X', status: 'whatever' }).statuses).toHaveLength(0);
  });
});

describe('transições de status', () => {
  it('só avança na linha do tempo', () => {
    expect(canApplyStatus(null, 'sent')).toBe(true);
    expect(canApplyStatus('sent', 'delivered')).toBe(true);
    expect(canApplyStatus('delivered', 'sent')).toBe(false);
    expect(canApplyStatus('read', 'delivered')).toBe(false);
  });

  it('falha é terminal e sempre pode ser aplicada uma vez', () => {
    expect(canApplyStatus('delivered', 'failed')).toBe(true);
    expect(canApplyStatus('failed', 'delivered')).toBe(false);
    expect(canApplyStatus('failed', 'failed')).toBe(false);
  });

  it('131026 e 130472 viram falha final e saem da fila', () => {
    expect(FINAL_FAILURE_CODES.has('131026')).toBe(true);
    expect(FINAL_FAILURE_CODES.has('130472')).toBe(true);
    expect(itemStatusForDelivery('failed', true)).toBe('blocked');
    expect(itemStatusForDelivery('failed', false)).toBe('failed');
    expect(itemStatusForDelivery('delivered', false)).toBe('sent');
  });
});

describe('fila realmente pendente', () => {
  const now = Date.parse('2026-01-01T12:00:00.000Z');

  it('conta apenas pending/sending sem wamid', () => {
    const r = computePendingQueue(
      [
        { status: 'pending' },
        { status: 'pending' },
        { status: 'sent', wamid: 'w1' },
        { status: 'failed' },
        { status: 'blocked' },
        { status: 'sending', wamid: 'w2' },
      ],
      { nowMs: now },
    );
    expect(r.pending).toBe(2);
    expect(r.acceptedButUnflushed).toBe(1);
  });

  it('não conta item já entregue mesmo se a linha ficou como sending', () => {
    const r = computePendingQueue([{ status: 'sending', delivery_status: 'delivered' }], { nowMs: now });
    expect(r.pending).toBe(0);
  });

  it('separa itens travados sem resposta após o tempo limite', () => {
    const r = computePendingQueue(
      [
        { status: 'sending', locked_at: '2026-01-01T11:00:00.000Z' },
        { status: 'sending', locked_at: '2026-01-01T11:59:00.000Z' },
      ],
      { nowMs: now, stuckMs: 10 * 60 * 1000 },
    );
    expect(r.stuck).toBe(1);
    expect(r.pending).toBe(1);
  });
});
