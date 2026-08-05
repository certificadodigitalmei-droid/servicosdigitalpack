
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { DEFAULT_DESIGN, renderHtml, renderText, type Vars } from '@/lib/email-campaign/template';

/**
 * Pega empresas que ainda não receberam o e-mail da campanha e as adiciona na fila de envio do servidor.
 * Respeita o limite de 100 e-mails por hora (se chamado periodicamente).
 */
export async function syncMassEmailQueue(limit = 50) {
  // 1. Buscar empresas recentes que possuem e-mail
  const { data: companies, error: fetchErr } = await supabaseAdmin
    .from('companies')
    .select('id, cnpj, email, nome_titular_exibicao, razao_social_original, inicio_atividade, situacao_cadastral_desc')
    .not('email', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit * 2); // buscamos um pouco mais para compensar deduplicação

  if (fetchErr || !companies) return { ok: false, error: fetchErr?.message };

  // 2. Filtrar as que já foram enviadas (pela tabela email_campaign_recipients)
  const companyIds = companies.map(c => c.id);
  const { data: sentRecipients } = await supabaseAdmin
    .from('email_campaign_recipients')
    .select('company_id')
    .in('company_id', companyIds);

  const sentIds = new Set(sentRecipients?.map(r => r.company_id) || []);
  const pendingCompanies = companies.filter(c => !sentIds.has(c.id)).slice(0, limit);

  if (pendingCompanies.length === 0) return { ok: true, enqueued: 0 };

  // 3. Garantir que tenham links públicos
  const pendingIds = pendingCompanies.map(c => c.id);
  const { data: links } = await supabaseAdmin
    .from('company_links')
    .select('company_id, public_token')
    .in('company_id', pendingIds)
    .eq('active', true);

  const linksMap = new Record<string, string>();
  links?.forEach(l => {
    if (l.company_id) linksMap[l.company_id] = l.public_token;
  });

  const publicBaseUrl = (process.env.PUBLIC_APP_URL || 'https://seu-certificado-mei-digital.online').replace(/\/+$/, '');
  const subject = 'RESTRIÇÃO NO SEU CNPJ MEI';
  
  const enqueued = [];

  for (const company of pendingCompanies) {
    let token = linksMap[company.id];
    
    // Se não tem link, cria um agora
    if (!token) {
      token = crypto.randomUUID().replace(/-/g, '');
      await supabaseAdmin.from('company_links').insert({
        company_id: company.id,
        public_token: token,
        token: token,
        public_url: `${publicBaseUrl}/acesso/${token}`,
        checkout_url: `${publicBaseUrl}/checkout/${token}`,
        active: true,
        status: 'active',
        company_data: {
          cnpj: company.cnpj,
          nome: company.nome_titular_exibicao || company.razao_social_original
        }
      });
    }

    const vars: Vars = {
      NOME_TITULAR: company.nome_titular_exibicao || company.razao_social_original || '',
      NOME_EMPRESARIAL: company.razao_social_original || '',
      CNPJ: company.cnpj || '',
      REFERENCIA: company.cnpj ? company.cnpj.slice(-8).toUpperCase() : 'CCMEI',
      DATA_ABERTURA: company.inicio_atividade || '',
      SITUACAO: company.situacao_cadastral_desc || 'PENDENTE',
      LINK_PUBLICO: `${publicBaseUrl}/acesso/${token}`,
      LINK_CHECKOUT: `${publicBaseUrl}/checkout/${token}`
    };

    const html = renderHtml(DEFAULT_DESIGN, vars);
    const text = renderText(DEFAULT_DESIGN, vars);

    enqueued.push({
      to_email: company.email,
      subject: subject,
      html,
      text,
      status: 'queued',
      idempotency_key: `mass-email-${company.id}`,
      created_by: null // sistema
    });

    // Registrar como enviado (ou pelo menos agendado) para não duplicar na próxima rodada
    // Usamos um status temporário ou inserimos direto na auditoria para evitar race conditions
    await supabaseAdmin.from('email_campaign_recipients').insert({
      company_id: company.id,
      email: company.email,
      cnpj: company.cnpj,
      status: 'queued',
      personalized_subject: subject
    });
  }

  // 4. Inserir na fila de envio real
  if (enqueued.length > 0) {
    const { error: insErr } = await supabaseAdmin.from('email_send_queue').upsert(enqueued, {
      onConflict: 'idempotency_key'
    });
    if (insErr) console.error('[MassEmailSync] Error enqueuing:', insErr);
  }

  return { ok: true, enqueued: enqueued.length };
}
