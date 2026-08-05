// Server-only: estado único do funil de automação.
//
// Ordem canônica do pipeline:
//   Consulta -> Importação -> Link gerado -> Fila de envio -> E-mail enviado
//
// A regra central ("trava") é: só importamos novas empresas quando NÃO existe
// estoque pendente, ou seja, quando não há empresa importada sem link nem link
// sem envio concluído. Isso impede o descompasso de importar muito e enviar pouco.

type AnyClient = {
  from: (t: string) => any;
};

const PAGE = 1000;

/** Lê todas as linhas de uma tabela/coluna com paginação (o PostgREST corta em 1000). */
async function readAll<T = any>(
  client: AnyClient,
  table: string,
  columns: string,
  apply?: (q: any) => any,
): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    let q = client.from(table).select(columns).range(offset, offset + PAGE - 1);
    if (apply) q = apply(q);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = (data as T[]) ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
    if (offset > 200_000) break; // guarda de segurança
  }
  return out;
}

export const QUEUE_KEY_PREFIX = 'mass-email-';

/** Conjunto de company_id que já possuem registro na fila de envio (qualquer status). */
export async function queuedCompanyIds(client: AnyClient): Promise<Set<string>> {
  const rows = await readAll<{ idempotency_key: string }>(
    client,
    'email_send_queue',
    'idempotency_key',
  );
  const set = new Set<string>();
  for (const r of rows) {
    if (r.idempotency_key?.startsWith(QUEUE_KEY_PREFIX)) {
      set.add(r.idempotency_key.slice(QUEUE_KEY_PREFIX.length));
    }
  }
  return set;
}

/**
 * E-mails que já entraram na fila alguma vez (qualquer status/origem).
 * Necessário porque envios históricos usaram outras chaves de idempotência
 * (`campaign-…`), e reenviar para eles seria duplicidade.
 */
export async function queuedEmails(client: AnyClient): Promise<Set<string>> {
  const rows = await readAll<{ to_email: string | null }>(client, 'email_send_queue', 'to_email');
  const set = new Set<string>();
  for (const r of rows) if (r.to_email) set.add(r.to_email.trim().toLowerCase());
  return set;
}

/** Conjunto de company_id que já possuem link ativo gerado. */
export async function linkedCompanyIds(client: AnyClient): Promise<Set<string>> {
  const rows = await readAll<{ company_id: string | null }>(client, 'company_links', 'company_id');
  const set = new Set<string>();
  for (const r of rows) if (r.company_id) set.add(r.company_id);
  return set;
}

/** Empresas (id -> e-mail normalizado) para casar fila por destinatário. */
export async function companyEmailMap(client: AnyClient): Promise<Map<string, string | null>> {
  const rows = await readAll<{ id: string; email: string | null }>(client, 'companies', 'id, email');
  return new Map(rows.map((r) => [r.id, r.email ? r.email.trim().toLowerCase() : null]));
}

/** true quando a empresa já foi (ou está) na fila de envio. */
export function isAlreadyQueued(
  companyId: string,
  emails: Map<string, string | null>,
  queuedIds: Set<string>,
  queuedMails: Set<string>,
): boolean {
  if (queuedIds.has(companyId)) return true;
  const mail = emails.get(companyId);
  return !!mail && queuedMails.has(mail);
}


export type PipelineState = {
  updatedAt: string;
  /** Empresas importadas (total na base). */
  importadas: number;
  /** Empresas importadas que ainda não têm link gerado. */
  semLink: number;
  /** Links gerados (total). */
  links: number;
  /** Links gerados que ainda não entraram na fila de envio. */
  linksSemEnvio: number;
  /** Itens aguardando despacho na fila. */
  fila: number;
  /** E-mails confirmados como enviados. */
  enviados: number;
  /** Envios com falha definitiva. */
  falhas: number;
  /** Soma de tudo que ainda precisa ser processado antes de importar mais. */
  pendenteTotal: number;
  /** true quando a importação está liberada. */
  importacaoLiberada: boolean;
  /** Motivo legível de bloqueio (null quando liberada). */
  motivoBloqueio: string | null;
};

export async function computePipelineState(client: AnyClient): Promise<PipelineState> {
  const [emails, linkedIds, queuedIds, queuedMails, filaRes, enviadosRes, falhasRes] =
    await Promise.all([
      companyEmailMap(client),
      linkedCompanyIds(client),
      queuedCompanyIds(client),
      queuedEmails(client),
      client
        .from('email_send_queue')
        .select('id', { count: 'exact', head: true })
        .in('status', ['queued', 'pending', 'sending']),
      client.from('email_send_queue').select('id', { count: 'exact', head: true }).eq('status', 'sent'),
      client.from('email_send_queue').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
    ]);

  const companyIds = [...emails.keys()];
  const importadas = companyIds.length;
  const semLink = companyIds.filter((id) => !linkedIds.has(id)).length;
  const links = linkedIds.size;
  const linksSemEnvio = [...linkedIds].filter(
    (id) => !isAlreadyQueued(id, emails, queuedIds, queuedMails),
  ).length;

  const fila = filaRes.count ?? 0;
  const enviados = enviadosRes.count ?? 0;
  const falhas = falhasRes.count ?? 0;

  const pendenteTotal = semLink + linksSemEnvio + fila;

  let motivoBloqueio: string | null = null;
  if (linksSemEnvio > 0) {
    motivoBloqueio = `Aguardando enfileirar ${linksSemEnvio} link(s) já gerados`;
  } else if (semLink > 0) {
    motivoBloqueio = `Aguardando gerar link para ${semLink} empresa(s) importadas`;
  } else if (fila > 0) {
    motivoBloqueio = `Aguardando despachar ${fila} e-mail(s) da fila`;
  }

  return {
    updatedAt: new Date().toISOString(),
    importadas,
    semLink,
    links,
    linksSemEnvio,
    fila,
    enviados,
    falhas,
    pendenteTotal,
    importacaoLiberada: pendenteTotal === 0,
    motivoBloqueio,
  };
}

export type PendingSendRow = {
  companyId: string;
  cnpj: string;
  nome: string;
  email: string | null;
  token: string;
  createdAt: string;
};

/** Links já gerados que ainda não entraram na fila de envio (mais recentes primeiro). */
export async function listPendingSendTargets(
  client: AnyClient,
  limit = 50,
): Promise<PendingSendRow[]> {
  const [queued, queuedMails, emails] = await Promise.all([
    queuedCompanyIds(client),
    queuedEmails(client),
    companyEmailMap(client),
  ]);
  const links = await readAll<{
    company_id: string | null;
    public_token: string;
    created_at: string;
    company_data: any;
  }>(client, 'company_links', 'company_id, public_token, created_at, company_data');

  const seen = new Set<string>();
  const pending = links
    .filter((l) => {
      if (!l.company_id) return false;
      if (isAlreadyQueued(l.company_id, emails, queued, queuedMails)) return false;
      if (seen.has(l.company_id)) return false;
      seen.add(l.company_id);
      return true;
    })

    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
    .slice(0, limit);

  if (pending.length === 0) return [];

  const { data: companies } = await client
    .from('companies')
    .select('id, cnpj, email, nome_titular_exibicao, razao_social_original')
    .in(
      'id',
      pending.map((p) => p.company_id),
    );

  const byId = new Map<string, any>((companies ?? []).map((c: any) => [c.id, c]));

  return pending.map((l) => {
    const c = byId.get(l.company_id as string);
    return {
      companyId: l.company_id as string,
      cnpj: c?.cnpj ?? l.company_data?.cnpj ?? '',
      nome:
        c?.nome_titular_exibicao ??
        c?.razao_social_original ??
        l.company_data?.nome ??
        'Empresa',
      email: c?.email ?? null,
      token: l.public_token,
      createdAt: l.created_at,
    };
  });
}

/** Empresas importadas que ainda não têm link (mais recentes primeiro). */
export async function listCompaniesWithoutLink(client: AnyClient, limit = 50) {
  const linked = await linkedCompanyIds(client);
  const rows = await readAll<{
    id: string;
    cnpj: string;
    email: string | null;
    nome_titular_exibicao: string | null;
    razao_social_original: string | null;
    created_at: string;
  }>(
    client,
    'companies',
    'id, cnpj, email, nome_titular_exibicao, razao_social_original, created_at',
  );

  return rows
    .filter((c) => !linked.has(c.id))
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
    .slice(0, limit)
    .map((c) => ({
      companyId: c.id,
      cnpj: c.cnpj,
      nome: c.nome_titular_exibicao ?? c.razao_social_original ?? 'Empresa',
      email: c.email,
      createdAt: c.created_at,
    }));
}

// ---------------------------------------------------------------------------
// FILA ÚNICA
// ---------------------------------------------------------------------------
// Uma única fila para o painel inteiro: empresas importadas (com link gerado)
// que estão apenas aguardando o envio do e-mail.

export type QueueStage = 'sem_link' | 'aguardando_fila' | 'na_fila' | 'enviando' | 'erro';

export type UnifiedQueueRow = {
  id: string;
  companyId: string | null;
  cnpj: string;
  nome: string;
  email: string | null;
  stage: QueueStage;
  attempts: number;
  lastError: string | null;
  lastStatusCode: number | null;
};

const STAGE_LABEL: Record<QueueStage, string> = {
  sem_link: 'gerando link',
  aguardando_fila: 'aguardando fila',
  na_fila: 'na fila',
  enviando: 'enviando',
  erro: 'erro',
};

export function stageLabel(s: QueueStage) {
  return STAGE_LABEL[s];
}

/** Fila única: itens já na fila de envio + links prontos + importadas sem link. */
export async function listUnifiedQueue(
  client: AnyClient,
  limit = 100,
): Promise<UnifiedQueueRow[]> {
  const out: UnifiedQueueRow[] = [];

  const { data: qrows } = await client
    .from('email_send_queue')
    .select('id, to_email, status, attempts, last_error, last_status_code, idempotency_key, created_at')
    .in('status', ['queued', 'pending', 'sending', 'failed'])
    .order('created_at', { ascending: true })
    .limit(limit);

  const companyIds = (qrows ?? [])
    .map((r: any) => (r.idempotency_key ?? '').startsWith(QUEUE_KEY_PREFIX)
      ? r.idempotency_key.slice(QUEUE_KEY_PREFIX.length)
      : null)
    .filter(Boolean) as string[];

  const byId = new Map<string, any>();
  if (companyIds.length > 0) {
    const { data: comps } = await client
      .from('companies')
      .select('id, cnpj, nome_titular_exibicao, razao_social_original')
      .in('id', companyIds);
    for (const c of comps ?? []) byId.set(c.id, c);
  }

  for (const r of qrows ?? []) {
    const cid = (r.idempotency_key ?? '').startsWith(QUEUE_KEY_PREFIX)
      ? r.idempotency_key.slice(QUEUE_KEY_PREFIX.length)
      : null;
    const c = cid ? byId.get(cid) : null;
    out.push({
      id: r.id,
      companyId: cid,
      cnpj: c?.cnpj ?? '',
      nome: c?.nome_titular_exibicao ?? c?.razao_social_original ?? 'Empresa',
      email: r.to_email,
      stage:
        r.status === 'failed' ? 'erro' : r.status === 'sending' ? 'enviando' : 'na_fila',
      attempts: r.attempts ?? 0,
      lastError: r.last_error ?? null,
      lastStatusCode: r.last_status_code ?? null,
    });
  }

  if (out.length < limit) {
    const links = await listPendingSendTargets(client, limit - out.length);
    for (const l of links) {
      out.push({
        id: `link-${l.companyId}`,
        companyId: l.companyId,
        cnpj: l.cnpj,
        nome: l.nome,
        email: l.email,
        stage: 'aguardando_fila',
        attempts: 0,
        lastError: null,
        lastStatusCode: null,
      });
    }
  }

  if (out.length < limit) {
    const semLink = await listCompaniesWithoutLink(client, limit - out.length);
    for (const c of semLink) {
      out.push({
        id: `nolink-${c.companyId}`,
        companyId: c.companyId,
        cnpj: c.cnpj,
        nome: c.nome,
        email: c.email,
        stage: 'sem_link',
        attempts: 0,
        lastError: null,
        lastStatusCode: null,
      });
    }
  }

  return out.slice(0, limit);
}

export type SendHealth = {
  updatedAt: string;
  naFila: number;
  enviando: number;
  enviados: number;
  enviadosUltimaHora: number;
  falhas: number;
  retries429: number;
  suprimidos: number;
};

/** Saúde do envio: enviados, erros e quantas vezes bateu HTTP 429 (rate limit). */
export async function computeSendHealth(client: AnyClient): Promise<SendHealth> {
  const sinceHour = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const head = (apply: (q: any) => any) =>
    apply(client.from('email_send_queue').select('id', { count: 'exact', head: true }));

  const [fila, enviando, enviados, hora, falhas, r429, supr] = await Promise.all([
    head((q) => q.in('status', ['queued', 'pending'])),
    head((q) => q.eq('status', 'sending')),
    head((q) => q.eq('status', 'sent')),
    head((q) => q.eq('status', 'sent').gte('updated_at', sinceHour)),
    head((q) => q.eq('status', 'failed')),
    head((q) => q.eq('last_status_code', 429)),
    head((q) => q.eq('status', 'suppressed')),
  ]);

  return {
    updatedAt: new Date().toISOString(),
    naFila: fila.count ?? 0,
    enviando: enviando.count ?? 0,
    enviados: enviados.count ?? 0,
    enviadosUltimaHora: hora.count ?? 0,
    falhas: falhas.count ?? 0,
    retries429: r429.count ?? 0,
    suprimidos: supr.count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// CONFIGURAÇÕES DO FLUXO
// ---------------------------------------------------------------------------

export type FlowSettings = {
  enabled: boolean;
  importBatchSize: number;
  sendMode: 'burst' | 'paced';
  hourlyBatchSize: number;
  pacedDelaySec: number;
};

export const DEFAULT_FLOW_SETTINGS: FlowSettings = {
  enabled: false,
  importBatchSize: 5,
  sendMode: 'burst',
  hourlyBatchSize: 100,
  pacedDelaySec: 36,
};

export async function readFlowSettings(client: AnyClient): Promise<FlowSettings> {
  const { data } = await client
    .from('cloud_automation_settings')
    .select('enabled, import_batch_size, send_mode, hourly_batch_size, paced_delay_sec')
    .eq('id', 1)
    .maybeSingle();
  if (!data) return DEFAULT_FLOW_SETTINGS;
  return {
    enabled: !!data.enabled,
    importBatchSize: data.import_batch_size ?? 5,
    sendMode: data.send_mode === 'paced' ? 'paced' : 'burst',
    hourlyBatchSize: data.hourly_batch_size ?? 100,
    pacedDelaySec: data.paced_delay_sec ?? 36,
  };
}
