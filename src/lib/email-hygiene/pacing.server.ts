// Ritmo humano de envio.
//
// O padrão que mais denuncia "robô/spam" para o Gmail não é o volume:
// é o formato do envio. 60 e-mails exatamente de minuto em minuto,
// de madrugada, começando do zero em um domínio novo — isso é assinatura
// clássica de disparo em massa.
//
// Aqui o mesmo volume diário é distribuído ao longo do horário comercial,
// com intervalo variável (jitter), como faria um remetente real.

import { checkWarmup, type WarmupStatus } from './warmup.server';

/** Janela diária de envio, em horas locais de São Paulo (UTC-3). */
export const SEND_WINDOW_START_HOUR = 9;
export const SEND_WINDOW_END_HOUR = 20;

/** Nunca dois e-mails colados: piso de segurança entre disparos. */
export const MIN_SPACING_SEC = 90;
/** Teto do intervalo para a cota do dia ainda caber na janela. */
export const MAX_SPACING_SEC = 900;
/** Variação aleatória aplicada ao intervalo (±35%). */
export const JITTER = 0.35;

export type PacingStatus = {
  /** Hora local (São Paulo) usada nos cálculos. */
  localHour: number;
  insideWindow: boolean;
  windowStartHour: number;
  windowEndHour: number;
  /** Segundos restantes da janela de hoje (0 se já fechou). */
  secondsLeftInWindow: number;
  /** Quanto ainda pode sair hoje (cota de aquecimento/teto diário). */
  remainingToday: number;
  /** Intervalo-alvo entre dois envios, já com jitter. */
  spacingSec: number;
  /** Intervalo médio (sem jitter), só para exibição. */
  baseSpacingSec: number;
  blocked: boolean;
  reason?: string;
  warmup: WarmupStatus;
};

/** Hora local de São Paulo (UTC-3) com fração de hora. */
export function localHourSaoPaulo(now = new Date()): number {
  const local = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return local.getUTCHours() + local.getUTCMinutes() / 60;
}

function withJitter(sec: number): number {
  const delta = sec * JITTER;
  return Math.round(sec - delta + Math.random() * delta * 2);
}

export async function computePacing(now = new Date()): Promise<PacingStatus> {
  const warmup = await checkWarmup();
  const localHour = localHourSaoPaulo(now);
  const insideWindow = localHour >= SEND_WINDOW_START_HOUR && localHour < SEND_WINDOW_END_HOUR;
  const secondsLeftInWindow = Math.max(
    0,
    Math.round((SEND_WINDOW_END_HOUR - localHour) * 3600),
  );
  const remainingToday = warmup.remainingToday;

  const base = Math.min(
    MAX_SPACING_SEC,
    Math.max(
      MIN_SPACING_SEC,
      remainingToday > 0 && secondsLeftInWindow > 0
        ? Math.floor(secondsLeftInWindow / remainingToday)
        : MIN_SPACING_SEC,
    ),
  );

  const status: PacingStatus = {
    localHour,
    insideWindow,
    windowStartHour: SEND_WINDOW_START_HOUR,
    windowEndHour: SEND_WINDOW_END_HOUR,
    secondsLeftInWindow,
    remainingToday,
    baseSpacingSec: base,
    spacingSec: withJitter(base),
    blocked: false,
    warmup,
  };

  if (!insideWindow) {
    return {
      ...status,
      blocked: true,
      reason:
        localHour < SEND_WINDOW_START_HOUR
          ? `fora do horário de envio — os disparos começam às ${SEND_WINDOW_START_HOUR}h (horário de Brasília).`
          : `horário de envio encerrado às ${SEND_WINDOW_END_HOUR}h. O fluxo volta sozinho amanhã de manhã.`,
    };
  }

  if (warmup.blocked) {
    return { ...status, blocked: true, reason: warmup.reason };
  }

  return status;
}
