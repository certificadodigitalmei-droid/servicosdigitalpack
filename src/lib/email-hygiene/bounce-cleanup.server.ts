// Higiene de lista: remove automaticamente qualquer e-mail que deu bounce
// (ou reclamação/descadastro) para preservar a reputação do domínio.

type PurgeReason = 'bounce' | 'complaint' | 'unsubscribe' | 'suppressed';

export type PurgeResult = {
  email: string;
  companiesCleared: number;
  linksDisabled: number;
  queueRemoved: number;
  recipientsMarked: number;
};

function normalize(email: string) {
  return email.trim().toLowerCase();
}

/** Apaga/limpa todos os vestígios de um endereço problemático na base. */
export async function purgeBouncedEmail(
  rawEmail: string,
  reason: PurgeReason = 'bounce',
): Promise<PurgeResult> {
  const email = normalize(rawEmail);
  const result: PurgeResult = {
    email,
    companiesCleared: 0,
    linksDisabled: 0,
    queueRemoved: 0,
    recipientsMarked: 0,
  };
  if (!email || !email.includes('@')) return result;

  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

  // 1) lista de supressão (não envia nunca mais)
  await supabaseAdmin
    .from('suppression_list')
    .upsert({ email, reason, source: 'auto_bounce_cleanup' } as any, { onConflict: 'email' })
    .then(
      () => null,
      async () => {
        // fallback caso não haja constraint única em email
        const { data: exists } = await supabaseAdmin
          .from('suppression_list')
          .select('id')
          .eq('email', email)
          .maybeSingle();
        if (!exists) {
          await supabaseAdmin
            .from('suppression_list')
            .insert({ email, reason, source: 'auto_bounce_cleanup' } as any);
        }
        return null;
      },
    );

  // 2) empresas com esse e-mail: desativa links e apaga registros não pagos
  const { data: companies } = await supabaseAdmin
    .from('companies')
    .select('id')
    .ilike('email', email);

  const companyIds = (companies ?? []).map((c: any) => c.id);

  if (companyIds.length) {
    // não apagar empresas que já geraram pedido pago
    const { data: paid } = await supabaseAdmin
      .from('orders')
      .select('company_id')
      .in('company_id', companyIds)
      .eq('status', 'paid');
    const paidIds = new Set((paid ?? []).map((o: any) => o.company_id).filter(Boolean));
    const removable = companyIds.filter((id) => !paidIds.has(id));

    if (removable.length) {
      const { data: links } = await supabaseAdmin
        .from('company_links')
        .update({ active: false })
        .in('company_id', removable)
        .select('id');
      result.linksDisabled = links?.length ?? 0;
    }

    // limpa o endereço inválido de todas (inclusive das pagas)
    const { data: cleared } = await supabaseAdmin
      .from('companies')
      .update({ email: null, possui_email: false } as any)
      .in('id', companyIds)
      .select('id');
    result.companiesCleared = cleared?.length ?? 0;
  }

  // 3) remove da fila de envio qualquer pendência para esse endereço
  const { data: removedQueue } = await supabaseAdmin
    .from('email_send_queue')
    .delete()
    .ilike('to_email', email)
    .in('status', ['pending', 'queued', 'retry', 'error', 'failed'])
    .select('id');
  result.queueRemoved = removedQueue?.length ?? 0;

  // 4) marca destinatários de campanha
  const { data: marked } = await supabaseAdmin
    .from('email_campaign_recipients')
    .update({ status: 'bounced', bounced_at: new Date().toISOString() } as any)
    .ilike('email', email)
    .select('id');
  result.recipientsMarked = marked?.length ?? 0;

  return result;
}

/**
 * Varre os registros de entrega recentes e limpa todos os bounces encontrados.
 * Idempotente — pode rodar a cada ciclo do motor.
 */
export async function sweepBouncedEmails(hours = 24): Promise<{
  scanned: number;
  purged: number;
  emails: string[];
}> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return { scanned: 0, purged: 0, emails: [] };

  const { listEmailLogs } = await import('@lovable.dev/email-js');
  const since = new Date(Date.now() - hours * 3600_000).toISOString();

  const bad = new Set<string>();
  let scanned = 0;
  let cursor: string | undefined;
  let pages = 0;

  try {
    do {
      const res: any = await listEmailLogs({ since, limit: 100, cursor } as any, { apiKey });
      for (const ev of (res.data ?? []) as Array<any>) {
        scanned++;
        const type = ev.event_type;
        if (type === 'bounced' || type === 'complaint' || type === 'rejected') {
          const to = ev.recipient ?? ev.to ?? ev.email;
          if (typeof to === 'string' && to.includes('@')) bad.add(normalize(to));
        }
      }
      cursor = res.pagination?.has_more ? res.pagination.next_cursor : undefined;
      pages++;
    } while (cursor && pages < 20);
  } catch {
    return { scanned, purged: 0, emails: [] };
  }

  const emails: string[] = [];
  for (const email of bad) {
    try {
      await purgeBouncedEmail(email, 'bounce');
      emails.push(email);
    } catch {
      /* segue limpando os demais */
    }
  }

  return { scanned, purged: emails.length, emails };
}
