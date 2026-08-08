import { describe, it, expect } from 'vitest';
import { normalizePhone } from '@/lib/whatsapp/chakra.server';

describe('normalizePhone', () => {
  it('formata número com máscara e DDD', () => {
    expect(normalizePhone('(11) 99999-9999')).toBe('5511999999999');
  });

  it('aceita número puro com DDD', () => {
    expect(normalizePhone('11999999999')).toBe('5511999999999');
  });

  it('não duplica o prefixo 55', () => {
    expect(normalizePhone('+55 11 99999-9999')).toBe('5511999999999');
  });

  it('remove DDD duplicado', () => {
    expect(normalizePhone('1111999999999')).toBe('5511999999999');
    expect(normalizePhone('551111999999999')).toBe('5511999999999');
  });

  it('não duplica DDD quando raw já contém DDD e ddd é informado', () => {
    expect(normalizePhone('11999999999', '11')).toBe('5511999999999');
    expect(normalizePhone('(11) 3333-4444', '11')).toBe('551133334444');
  });

  it('usa o DDD separado apenas para número local', () => {
    expect(normalizePhone('99999999', '11')).toBe('5511999999999');
    expect(normalizePhone('33334444', '11')).toBe('551133334444');
  });

  it('rejeita entradas curtas ou inválidas', () => {
    expect(normalizePhone('99999')).toBeNull();
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone('abc')).toBeNull();
    expect(normalizePhone('99999999')).toBeNull();
  });
});
