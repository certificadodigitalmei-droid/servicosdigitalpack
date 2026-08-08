import { describe, it, expect } from 'vitest';
import { validateBrazilianMobile, extractValidBrazilianMobile, canonicalPhoneKey } from '@/lib/phone/brazilian-mobile';
import { buildSearchBody } from '@/lib/casa-dos-dados/client.server';
import { classifyWhatsappError, statusFromError, pickCompanyPhone } from '@/lib/whatsapp/chakra.server';

describe('validateBrazilianMobile', () => {
  it('aceita celular com 9 na frente', () => {
    const r = validateBrazilianMobile('(11) 99999-8877');
    expect(r.valid).toBe(true);
    expect(r.e164).toBe('5511999998877');
  });

  it('rejeita telefone fixo', () => {
    expect(validateBrazilianMobile('1133334444').valid).toBe(false);
  });

  it('rejeita DDD inexistente', () => {
    expect(validateBrazilianMobile('5523999998877').valid).toBe(false);
  });

  it('rejeita dígitos repetidos e sequências', () => {
    expect(validateBrazilianMobile('11999999999').valid).toBe(false);
    expect(validateBrazilianMobile('11912345678').valid).toBe(false);
  });

  it('não duplica prefixo 55 nem DDD', () => {
    expect(validateBrazilianMobile('+55 11 99999-8877').e164).toBe('5511999998877');
    expect(validateBrazilianMobile('1111999998877').e164).toBe('5511999998877');
  });

  it('canonicalPhoneKey normaliza para comparação', () => {
    expect(canonicalPhoneKey('+55 (11) 99999-8877')).toBe('5511999998877');
  });
});

describe('extractValidBrazilianMobile', () => {
  it('prefere o contato marcado como celular', () => {
    const r = extractValidBrazilianMobile({
      ddd: '11',
      telefones: [
        { tipo: 'FIXO', ddd: '11', numero: '33334444' },
        { tipo: 'CELULAR', ddd: '11', numero: '999998877' },
      ],
    });
    expect(r).toBe('5511999998877');
  });

  it('retorna null quando só há fixo', () => {
    expect(
      extractValidBrazilianMobile({ ddd: '11', telefones: [{ tipo: 'FIXO', ddd: '11', numero: '33334444' }] }),
    ).toBeNull();
  });
});

describe('buildSearchBody — filtros oficiais', () => {
  it('ativa com_telefone e somente_celular quando exige celular', () => {
    const body: any = buildSearchBody({
      filters: { require_mobile_phone: true, only_mei: true },
      limit: 10,
      date: '2026-01-05',
    });
    expect(body.mais_filtros.com_telefone).toBe(true);
    expect(body.mais_filtros.somente_celular).toBe(true);
    expect(body.mais_filtros.somente_fixo).toBe(false);
    expect(body.mais_filtros.excluir_empresas_visualizadas).toBe(true);
  });

  it('envia exclusão de CNPJ', () => {
    const body: any = buildSearchBody({
      filters: {},
      limit: 5,
      excludeCnpjs: ['12.345.678/0001-99', 'invalido'],
    });
    expect(body.excluir.cnpj).toEqual(['12345678000199']);
  });

  it('não envia excluir quando não há CNPJ bloqueado', () => {
    const body: any = buildSearchBody({ filters: {}, limit: 5 });
    expect(body.excluir).toBeUndefined();
  });
});

describe('classificação de erro do WhatsApp', () => {
  it('trata número inexistente como permanente', () => {
    expect(classifyWhatsappError(400, 'Recipient is not a valid WhatsApp user')).toBe('permanent_recipient');
  });

  it('trata rate limit e 5xx como temporário', () => {
    expect(classifyWhatsappError(429, 'too many requests')).toBe('temporary');
    expect(classifyWhatsappError(503, 'service unavailable')).toBe('temporary');
  });

  it('trata 401 como problema de configuração', () => {
    expect(classifyWhatsappError(401, 'unauthorized')).toBe('config');
  });

  it('extrai status do prefixo do erro', () => {
    expect(statusFromError('[400] recipient invalid')).toBe(400);
    expect(statusFromError('falha de rede')).toBeNull();
  });
});

describe('pickCompanyPhone', () => {
  it('prefere o celular já validado', () => {
    expect(pickCompanyPhone({ whatsapp_phone_e164: '5511999998877', telefones: [] } as any)).toBe('5511999998877');
  });

  it('nunca devolve fixo', () => {
    expect(pickCompanyPhone({ ddd: '11', telefones: [{ tipo: 'fixo', numero: '33334444' }] } as any)).toBeNull();
  });
});
