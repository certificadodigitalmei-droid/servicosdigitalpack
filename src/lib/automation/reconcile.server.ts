import { supabaseAdmin } from '@/integrations/supabase/client.server';

/**
 * Rotina de Reconciliação de Métricas
 * Compara os estados das tabelas operacionais e garante que o dashboard 
 * reflita a realidade dos eventos.
 */
export async function reconcileMetrics() {
  console.log('[Reconcile] Iniciando reconciliação de métricas...');
  
  const results = {
    linksSynced: 0,
    queueCleaned: 0,
    auditFixed: 0
  };

  try {
    // 1. Sincronizar company_links com email_campaign_recipients
    // Se uma empresa está marcada como enviada na auditoria mas o link está inativo, reativa.
    const { data: sentAudits } = await supabaseAdmin
      .from('automation_audit_logs')
      .select('cnpj, company_id')
      .eq('event_type', 'email_sent');
    
    const sentCnpjs = new Set(sentAudits?.map(a => a.cnpj).filter(Boolean));
    
    if (sentCnpjs.size > 0) {
      const { data: links } = await supabaseAdmin
        .from('company_links')
        .select('id, company_data, active');
      
      for (const link of (links || [])) {
        const cnpj = (link.company_data as any)?.cnpj?.replace(/\D+/g, '');
        if (cnpj && sentCnpjs.has(cnpj) && !link.active) {
          await supabaseAdmin.from('company_links').update({ active: true }).eq('id', link.id);
          results.linksSynced++;
        }
      }
    }

    // 2. Limpar fila de e-mails órfãos ou duplicados por idempotência
    // Remove itens 'queued' que já possuem um registro 'sent' para o mesmo CNPJ
    const { data: sentQueue } = await supabaseAdmin
      .from('email_send_queue')
      .select('idempotency_key')
      .eq('status', 'sent');
    
    const sentKeys = new Set(sentQueue?.map(q => q.idempotency_key).filter(Boolean));
    
    if (sentKeys.size > 0) {
      const { error: delErr } = await supabaseAdmin
        .from('email_send_queue')
        .delete()
        .eq('status', 'queued')
        .in('idempotency_key', Array.from(sentKeys));
      
      if (!delErr) results.queueCleaned++;
    }

    // 3. Validar consistência da Auditoria vs Fila
    // Garante que todo 'email_sent' na fila tenha um log correspondente
    const { data: queueSent } = await supabaseAdmin
      .from('email_send_queue')
      .select('idempotency_key, updated_at')
      .eq('status', 'sent')
      .gte('updated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    for (const q of (queueSent || [])) {
      const cnpj = q.idempotency_key?.replace('mass-email-', '');
      if (cnpj) {
        const { count } = await supabaseAdmin
          .from('automation_audit_logs')
          .select('id', { count: 'exact', head: true })
          .eq('cnpj', cnpj)
          .eq('event_type', 'email_sent');
        
        if (count === 0) {
          await supabaseAdmin.from('automation_audit_logs').insert({
            cnpj: cnpj,
            event_type: 'email_sent',
            details: { source: 'reconciliation_fix', original_sent_at: q.updated_at },
            created_at: q.updated_at
          });
          results.auditFixed++;
        }
      }
    }

    console.log('[Reconcile] Sucesso:', results);
    return { ok: true, ...results };
  } catch (e: any) {
    console.error('[Reconcile] Erro:', e.message);
    return { ok: false, error: e.message };
  }
}
