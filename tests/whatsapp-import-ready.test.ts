import { describe, it, expect } from 'vitest';
import { extractMobile, validateCompanyItem } from '@/lib/casa-dos-dados/worker-logic';

describe('importação voltada ao WhatsApp', () => {
  it('extrai celular a partir de ddd_telefone_1', () => {
    expect(extractMobile({ ddd_telefone_1: '11 99999-8877' })).toBe('5511999998877');
  });

  it('não aceita fixo como celular', () => {
    expect(extractMobile({ ddd_telefone_1: '11 3333-4444' })).toBeNull();
  });

  it('marca celular como campo faltante quando exigido', () => {
    const item = { cnpj: '12345678000199', razao_social: 'X', ddd_telefone_1: '1133334444' };
    const q = validateCompanyItem((item as any), { require_mobile_phone: true } as any);
    expect(q.missingFields).toContain('celular');
    expect(q.mobile).toBeNull();
  });

  it('aprova empresa com celular válido', () => {
    const item = { cnpj: '12345678000199', razao_social: 'X', ddd_telefone_1: '11999998877' };
    const q = validateCompanyItem((item as any), { require_mobile_phone: true } as any);
    expect(q.missingFields).not.toContain('celular');
    expect(q.mobile).toBe('5511999998877');
  });
});
