import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { DEFAULT_DESIGN, renderHtml, renderText, type Vars } from '@/lib/email-campaign/template';
import { listCompaniesWithoutLink, listPendingSendTargets } from '@/lib/pipeline/pipeline.server';

const SUBJECT = 'RESTRIÇÃO NO SEU CNPJ MEI';

function baseUrl() {
  return (process.env.PUBLIC_APP_URL || 'https://seu-certificado-mei-digital.online').replace(
    /\/+$/,
    '',
  );
}

/**
 * Etapa 1 do pipeline: garantir que toda empresa importada tenha link gerado.
 * Retorna quantos links foram criados.
 */
export async function ensureLinksForImported(limit = 25) {
  const pending = await listCompaniesWithoutLink(supabaseAdmin as any, limit);
  if (pending.length === 0) return { created: 0 };

  const publicBaseUrl = baseUrl();
  let created = 0;

  for (const c of pending) {
    const token = crypto.randomUUID().replace(/-/g, '');
    const { error } = await supabaseAdmin.from('company_links').insert({
      company_id: c.companyId,
      public_token: token,
      token,
      public_url: `${publicBaseUrl}/acesso/${token}`,
      checkout_url: `${publicBaseUrl}/checkout/${token}`,
      active: true,
      status: 'active',
      company_data: { cnpj: c.cnpj, nome: c.nome },
    });
    if (!error) {
      created++;
      await supabaseAdmin.from('automation_audit_logs').insert({
        company_id: c.companyId,
        cnpj: c.cnpj,
        event_type: 'link_created',
        details: { token },
      });
    }
  }

  return { created };
}

/**
 * Etapa 2 do pipeline: colocar na fila de envio todo link gerado que ainda
 * não possui registro em `email_send_queue`.
 *
 * A fila (`email_send_queue`) é a ÚNICA fonte de verdade de "já foi enviado?".
 * A chave `mass-email-<company_id>` garante idempotência.
 */
export async function syncMassEmailQueue(limit = 25) {
  const pending = await listPendingSendTargets(supabaseAdmin as any, limit);
  if (pending.length === 0) return { ok: true as const, enqueued: 0, semEmail: 0 };

  const publicBaseUrl = baseUrl();
  const rows: any[] = [];
  let semEmail = 0;

  // Dados completos para preencher as variáveis do template
  const { data: companies } = await supabaseAdmin
    .from('companies')
    .select(
      'id, cnpj, email, nome_titular_exibicao, razao_social_original, inicio_atividade, situacao_cadastral_desc',
    )
    .in(
      'id',
      pending.map((p) => p.companyId),
    );
  const byId = new Map<string, any>((companies ?? []).map((c: any) => [c.id, c]));

  for (const p of pending) {
    const c = byId.get(p.companyId);
    const email = (c?.email ?? p.email ?? '').trim();
    if (!email || !email.includes('@')) {
      semEmail++;
      // Marca como suprimido para não travar o pipeline indefinidamente.
      rows.push({
        to_email: `sem-email+${p.companyId}@invalido.local`,
        subject: SUBJECT,
        html: null,
        text: null,
        status: 'suppressed',
        idempotency_key: `mass-email-${p.companyId}`,
        last_error: 'empresa sem e-mail válido',
        created_by: null,
      });
      continue;
    }


    const vars: Vars = {
      NOME_TITULAR: c?.nome_titular_exibicao || c?.razao_social_original || p.nome || '',
      NOME_EMPRESARIAL: c?.razao_social_original || '',
      CNPJ: c?.cnpj || p.cnpj || '',
      REFERENCIA: (c?.cnpj || p.cnpj || '').slice(-8).toUpperCase() || 'CCMEI',
      DATA_ABERTURA: c?.inicio_atividade || '',
      SITUACAO: 'CNPJ sem certificado pendente',
      LINK_PUBLICO: `${publicBaseUrl}/acesso/${p.token}`,
      LINK_CHECKOUT: `${publicBaseUrl}/checkout/${p.token}`,
    };

    rows.push({
      to_email: email.toLowerCase(),
      subject: SUBJECT,
      html: renderHtml(DEFAULT_DESIGN, vars),
      text: renderText(DEFAULT_DESIGN, vars),
      status: 'queued',
      idempotency_key: `mass-email-${p.companyId}`,
      created_by: null,
    });

    await supabaseAdmin.from('automation_audit_logs').insert({
      company_id: p.companyId,
      cnpj: c?.cnpj || p.cnpj,
      event_type: 'email_queued',
      details: { subject: SUBJECT },
    });
  }

  if (rows.length > 0) {
    const { error } = await supabaseAdmin
      .from('email_send_queue')
      .upsert(rows, { onConflict: 'idempotency_key' });
    if (error) {
      console.error('[MassEmailSync] Error enqueuing:', error);
      return { ok: false as const, enqueued: 0, semEmail, error: error.message };
    }
  }

  return {
    ok: true as const,
    enqueued: rows.filter((r) => r.status === 'queued').length,
    semEmail,
  };

}
