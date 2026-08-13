// Freio automático de reputação.
//
// O Gmail/Outlook decidem caixa de entrada x spam olhando principalmente
// bounce rate e reclamações. Acima de ~2% de bounce a reputação do domínio
// cai rápido e TODOS os e-mails passam a cair em spam.
//
// Este módulo mede a taxa de bounce das últimas horas e pausa o envio
// automaticamente quando ela passa do limite seguro.

export const BOUNCE_WINDOW_MIN = 180;
/** Acima disso o envio é pausado (Gmail considera 2% já ruim). */
export const MAX_BOUNCE_RATE = 0.02;
/** Amostra mínima para a taxa fazer sentido. */
export const MIN_SAMPLE = 20;

export type BounceHealth = {
  sent: number;
  bounced: number;
  rate: number;
  blocked: boolean;
  reason?: string;
};

export async function checkBounceHealth(): Promise<BounceHealth> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const since = new Date(Date.now() - BOUNCE_WINDOW_MIN * 60 * 1000).toISOString();

  const [{ count: sentCount }, { count: bouncedCount }] = await Promise.all([
    supabaseAdmin
      .from('email_send_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'sent')
      .like('idempotency_key', 'mass-email-%')
      .gte('updated_at', since),
    supabaseAdmin
      .from('suppression_list')
      .select('id', { count: 'exact', head: true })
      .eq('reason', 'bounce')
      .gte('created_at', since),
  ]);

  const sent = sentCount ?? 0;
  const bounced = bouncedCount ?? 0;
  const rate = sent > 0 ? bounced / sent : 0;

  if (sent < MIN_SAMPLE || rate <= MAX_BOUNCE_RATE) {
    return { sent, bounced, rate, blocked: false };
  }

  return {
    sent,
    bounced,
    rate,
    blocked: true,
    reason: `taxa de bounce em ${(rate * 100).toFixed(1)}% nas últimas ${BOUNCE_WINDOW_MIN / 60} h (limite seguro ${(MAX_BOUNCE_RATE * 100).toFixed(0)}%). Envio pausado para proteger a reputação do domínio.`,
  };
}
