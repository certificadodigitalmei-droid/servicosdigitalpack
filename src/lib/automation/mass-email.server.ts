
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { DEFAULT_DESIGN, renderHtml, renderText, type Vars } from '@/lib/email-campaign/template';

/**
 * Pega empresas que ainda não receberam o e-mail da campanha e as adiciona na fila de envio do servidor.
 */
export async function syncMassEmailQueue(limit = 50) {
  // 1. Buscar empresas recentes que possuem e-mail
  const { data: companies, error: fetchErr } = await supabaseAdmin
    .from('companies')
    .select('id, cnpj, email, nome_titular_exibicao, razao_social_original, inicio_atividade, situacao_cadastral_desc')
    .not('email', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit * 3); // buscamos um pouco mais para compensar deduplicação

  if (fetchErr || !companies) return { ok: false, error: fetchErr?.message };

  // 2. Filtrar as que já foram enviadas (pela tabela email_campaign_recipients)
  const emails = companies.map(c => c.email?.trim().toLowerCase()).filter(Boolean) as string[];
  const cnpjs = companies.map(c => c.cnpj?.replace(/\D+/g, '')).filter(Boolean) as string[];

  const { data: sentRecipients } = await supabaseAdmin
    .from('email_campaign_recipients')
    .select('email, cnpj')
    .or(`email.in.(${emails.join(',')}),cnpj.in.(${cnpjs.join(',')})`)
    .not('sent_at', 'is', null);

  const sentEmails = new Set(sentRecipients?.map(r => r.email?.trim().toLowerCase()) || []);
  const sentCnpjs = new Set(sentRecipients?.map(r => r.cnpj?.replace(/\D+/g, '')) || []);

  const pendingCompanies = companies.filter(c => {
    const emailKey = c.email?.trim().toLowerCase();
    const cnpjKey = c.cnpj?.replace(/\D+/g, '');
    return !sentEmails.has(emailKey || '') && !sentCnpjs.has(cnpjKey || '');
  }).slice(0, limit);

  if (pendingCompanies.length === 0) return { ok: true, enqueued: 0 };

  // 3. Garantir que tenham links públicos
  const pendingIds = pendingCompanies.map(c => c.id);
  const { data: links } = await supabaseAdmin
    .from('company_links')
    .select('company_id, public_token')
    .in('company_id', pendingIds)
    .eq('active', true);

  const linksMap: Record<string, string> = {};
  links?.forEach(l => {
    if (l.company_id) linksMap[l.company_id] = l.public_token;
  });

  const publicBaseUrl = (process.env.PUBLIC_APP_URL || 'https://seu-certificado-mei-digital.online').replace(/\/+$/, '');
  const subject = 'RESTRIÇÃO NO SEU CNPJ MEI';
  
  const enqueued: any[] = [];

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
      created_by: null
    });

    // Registrar na auditoria
    await supabaseAdmin.from('email_campaign_recipients').insert({
      email: company.email?.trim().toLowerCase(),
      cnpj: company.cnpj?.replace(/\D+/g, ''),
      company_name: company.nome_titular_exibicao || company.razao_social_original,
      status: 'queued',
      sent_at: new Date().toISOString() // Marcamos como "enviado" para evitar dupla inserção se a fila demorar
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
