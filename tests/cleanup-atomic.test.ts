import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { executeAtomicCleanup } from '@/lib/automation/cleanup.server';

const migrationPath = new URL(
  '../supabase/migrations/20260809223041_e6b8ea5f-1382-4d9f-b4b8-f2472d4d53ac.sql',
  import.meta.url,
);

describe('limpeza total transacional', () => {
  it('propaga erro SQL completo em vez de contabilizar candidatos', async () => {
    const db = {
      rpc: vi.fn(async () => ({
        data: null,
        error: { message: 'foreign key violation', details: 'orders_company_id_fkey', hint: 'rollback' },
      })),
    };

    await expect(executeAtomicCleanup(db)).rejects.toThrow(
      'foreign key violation — orders_company_id_fkey — rollback',
    );
  });

  it('rejeita success quando a pós-condição zero não foi atendida', async () => {
    const db = {
      rpc: vi.fn(async () => ({
        error: null,
        data: {
          success: true,
          removed: { companies: 20 },
          remaining: { unprotected_companies: 1, email_send_queue: 0 },
        },
      })),
    };

    await expect(executeAtomicCleanup(db)).resolves.toMatchObject({
      success: false,
      error: 'Pós-condição zero não atendida',
      removed: { companies: 20 },
      remaining: { unprotected_companies: 1 },
    });
  });

  it('aceita somente contagens realmente retornadas após a transação', async () => {
    const db = {
      rpc: vi.fn(async () => ({
        error: null,
        data: {
          success: true,
          message: 'ok',
          removed: { companies: 988, company_links: 988, email_send_queue: 988 },
          remaining: {
            companies: 10,
            company_links: 10,
            orders_paid: 10,
            unprotected_companies: 0,
            unprotected_company_links: 0,
            email_send_queue: 0,
            automatic_company_queue: 0,
            whatsapp_queue: 0,
          },
        },
      })),
    };

    await expect(executeAtomicCleanup(db)).resolves.toMatchObject({
      success: true,
      removed: { companies: 988, company_links: 988, email_send_queue: 988 },
      remaining: { companies: 10, company_links: 10, orders_paid: 10 },
    });
  });

  it('mantém a ordem de FK e aborta por exceção antes de retornar sucesso', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql.indexOf('DELETE FROM public.consent_logs')).toBeLessThan(sql.indexOf('DELETE FROM public.orders'));
    expect(sql.indexOf('DELETE FROM public.company_links')).toBeLessThan(sql.indexOf('DELETE FROM public.companies'));
    expect(sql.indexOf('DELETE FROM public.whatsapp_campaign_items')).toBeLessThan(sql.indexOf('DELETE FROM public.whatsapp_campaigns'));
    expect(sql).toContain("RAISE EXCEPTION USING\n      MESSAGE = 'cleanup post-condition failed'");
    expect(sql.indexOf('RAISE EXCEPTION USING')).toBeLessThan(sql.indexOf("RETURN jsonb_build_object(\n    'success', true"));
  });
});