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
  const queued = await queuedCompanyIds(client);
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
      if (queued.has(l.company_id)) return false;
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
