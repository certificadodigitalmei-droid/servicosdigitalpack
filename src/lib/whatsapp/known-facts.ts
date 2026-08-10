// Fatos confirmados no painel do provedor (Chakra API Logs) que precisam ser
// refletidos na base sem reenviar nenhuma mensagem.
export const CONFIRMED_REJECTIONS = [
  { phone: '5519982865070', status: 'failed' as const, code: '130472', reason: "User's number is part of an experiment (130472)" },
  { phone: '5595998419270', status: 'failed' as const, code: '131026', reason: 'Message undeliverable (131026)' },
  { phone: '5555999226541', status: 'failed' as const, code: '131026', reason: 'Message undeliverable (131026)' },
  { phone: '5511997440954', status: 'failed' as const, code: '131026', reason: 'Message undeliverable (131026)' },
];
