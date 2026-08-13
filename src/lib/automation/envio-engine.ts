/**
 * Engine global da aba Envio em Massa.
 *
 * Owns o loop assíncrono de disparo com delay + pausa + parada e a fila
 * inteira. Fica vivo no módulo, então a navegação entre abas do painel
 * não interrompe o envio em andamento.
 */

import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { createStore } from './store';
import { sendCampaignEmail } from '@/lib/email-campaign/send.functions';
import { getLatestTestEmailCompany } from '@/lib/company-links.functions';
import {
  rowToVars,
  substitute,
} from '@/lib/email-campaign/template';
import { pickVariantOrDefault } from '@/lib/email-campaign/variants';

/**
 * Todo e-mail de campanha usa exclusivamente os "Modelos de campanha (rotação)".
 * O antigo modelo de mensagem principal foi removido do sistema.
 */
let activeVariantIds: string[] = [];

export async function syncCampaignVariants() {
  try {
    const { loadCampaignVariantSelection } = await import(
      '@/lib/email-campaign/variants.functions'
    );
    const r = await loadCampaignVariantSelection();
    activeVariantIds = Array.isArray(r?.variantIds) ? r.variantIds : [];
  } catch {
    activeVariantIds = [];
  }
}

/** Modelo de campanha (rotação) para um destinatário/semente. */
export function variantFor(seed: string) {
  return pickVariantOrDefault(activeVariantIds, seed || 'default');
}

export function loadSavedFromName(): string | null {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage.getItem('campanha:fromName:v1'); } catch { return null; }
}
export function loadSavedFromAddress(): string | null {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage.getItem('campanha:fromAddress:v1'); } catch { return null; }
}
export function loadSavedReplyTo(): string | null {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage.getItem('campanha:replyTo:v1'); } catch { return null; }
}


/** Sincroniza remetente salvo localmente para a engine de Envio em Massa. */
export function syncFromMessageModel() {
  const fromName = loadSavedFromName();
  const fromAddress = loadSavedFromAddress();
  const replyTo = loadSavedReplyTo();

  envioStore.set((s) => ({
    ...s,
    ...(fromName ? { fromName } : {}),
    ...(fromAddress ? { fromAddress } : {}),
    ...(replyTo !== null ? { replyTo } : {}),
  }));
}

/** Carrega remetente padrão do servidor (site_settings) e aplica na engine,
 *  respeitando overrides salvos no navegador pelo Modelo de Mensagem. */
export async function syncSenderFromServer() {
  try {
    const { getEmailSenderSettings } = await import('@/lib/email-sender.functions');
    const server = await getEmailSenderSettings();
    // Remetente vem sempre do domínio configurado na Lovable (site_settings);
    // overrides salvos no navegador não são mais aplicados.
    envioStore.set((s) => ({
      ...s,
      fromName: server.from_name || s.fromName,
      fromAddress: server.from_email || s.fromAddress,
      replyTo: server.reply_to || '',
    }));
  } catch {
    // mantém defaults já carregados
  }
}


export type QueueItem = {

  id: string;
  email: string;
  cnpj: string;
  company_name: string;
  data_abertura?: string;
  situacao?: string;
  uf?: string;
  municipio?: string;
  status: 'pending' | 'sending' | 'sent' | 'suppressed' | 'error' | 'skipped';
  message?: string;
  publicToken?: string | null;
  publicUrl?: string | null;
};

export type SentEmail = {
  id: string;
  email: string;
  cnpj: string;
  company_name: string;
  subject: string;
  sentAt: string; // ISO
  testMode: boolean;
  publicUrl?: string | null;
};


type State = {
  // Config persistida
  subject: string;
  delaySec: number;
  batchLimit: number;
  limitMode: 'daily' | 'hourly';
  dailyLimit: number; // 0 = ilimitado
  hourlyLimit: number; // 0 = ilimitado
  hourlyRestMin: number; // minutos de descanso ao atingir o limite por hora (0 = aguarda a virada natural da hora)
  stopAtDaily: number; // 0 = desativado — quando sentToday >= stopAtDaily, para tudo (envio + importação)
  sentToday: number;
  sentThisHour: number;
  sentDay: string; // YYYY-MM-DD (reset diário)
  sentHour: string; // YYYY-MM-DDTHH (reset horário)

  testMode: boolean;
  testRecipient: string;
  fromName: string;
  fromAddress: string;
  replyTo: string;
  showFloating: boolean;
  heroImageUrl: string;
  lastSuccessAt: string | null;
  lastErrorMsg: string | null;

  // Estado de Rate Limit (429)
  rateLimitPauseUntil: string | null; // ISO
  rateLimitCount: number;
  rateLimitWindowStart: string | null; // ISO
  throttleMode: boolean;

  // Estado
  queue: QueueItem[];
  sentEmails: SentEmail[];
  running: boolean;
  paused: boolean;
  loading: boolean;
  logs: string[];
};

function todayStr() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}
function hourStr() {
  // chave YYYY-MM-DDTHH sempre em horário de São Paulo (evita divergência
  // entre a data em SP e a hora local do navegador).
  const hh = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    hour12: false,
  }).format(new Date());
  return todayStr() + 'T' + hh.padStart(2, '0');
}
/** Milissegundos até a virada da próxima hora cheia. */
function msToNextHour() {
  const d = new Date();
  return Math.max(
    5_000,
    (60 - d.getMinutes()) * 60_000 - d.getSeconds() * 1000 - d.getMilliseconds(),
  );
}


const initial: State = {
  /* ... */
  subject: 'RESTRIÇÃO NO SEU CNPJ MEI',
  delaySec: 36, // Ritmo de 100/h (3600/100 = 36s)
  batchLimit: 100, 
  limitMode: 'hourly', 
  dailyLimit: 2400, 
  hourlyLimit: 100,
  hourlyRestMin: 0, 


  stopAtDaily: 0,

  sentToday: 0,
  sentThisHour: 0,
  sentDay: todayStr(),
  sentHour: hourStr(),
  testMode: false,
  testRecipient: '',
  fromName: 'Digital Certifica A1',
  fromAddress: 'certificado-mei-estadual2026@digitalcertificaa1mei.online',
  replyTo: '',
  showFloating: true,
  heroImageUrl: '',
  lastSuccessAt: null,
  lastErrorMsg: null,
  
  rateLimitPauseUntil: null,
  rateLimitCount: 0,
  rateLimitWindowStart: null,
  throttleMode: false,

  queue: [],
  sentEmails: [],
  running: false,
  paused: false,
  loading: false,
  logs: [],
};


export const envioStore = createStore<State>(initial, {
  storageKey: 'automation:envio:v1',
  persistKeys: [
    'subject',
    'delaySec',
    'batchLimit',
    'limitMode',
    'dailyLimit',
    'hourlyLimit',
    'hourlyRestMin',
    'stopAtDaily',

    'sentToday',
    'sentThisHour',
    'sentDay',
    'sentHour',
    'testRecipient',
    'fromName',
    'fromAddress',
    'replyTo',
    'showFloating',
    'heroImageUrl',
    'lastSuccessAt',
    'lastErrorMsg',
    'rateLimitCount',
    'rateLimitWindowStart',
    'throttleMode',
    'queue',
    'sentEmails',
    'logs',
  ],
});



// Flags de controle do loop (fora do store para não gerar re-render por tick).
let running = false;
let paused = false;
let stopFlag = false;

export function isEngineRunning() {
  return running;
}

function pushLog(msg: string) {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
  envioStore.set((s) => ({ logs: [line, ...s.logs].slice(0, 500) }));
}

/* -------------------------------- setters --------------------------------- */

// Base URL de PRODUÇÃO usada nos links dos e-mails (o preview do editor
// abre o Lovable — usar sempre o domínio publicado).
import { getPublicBaseUrl, buildPublicUrl, buildCheckoutUrl } from '@/lib/public-base-url';

const normCnpj = (v: string | null | undefined) => (v || '').replace(/\D+/g, '');
const normEmail = (v: string | null | undefined) => (v || '').trim().toLowerCase();

export const setSubject = (v: string) => envioStore.set({ subject: v });
export const setDelaySec = (n: number) => envioStore.set({ delaySec: Math.max(1, n) });
export const setBatchLimit = (n: number) => envioStore.set({ batchLimit: Math.max(1, n) });
export const setLimitMode = (m: 'daily' | 'hourly') => envioStore.set({ limitMode: m });
export const setDailyLimit = (n: number) => envioStore.set({ dailyLimit: Math.max(0, n) });
export const setHourlyLimit = (n: number) => envioStore.set({ hourlyLimit: Math.max(0, n) });
export const setHourlyRestMin = (n: number) => envioStore.set({ hourlyRestMin: Math.max(0, Math.min(1440, n)) });
export const setStopAtDaily = (n: number) => envioStore.set({ stopAtDaily: Math.max(0, n) });

export const resetDailyCounter = () => {
  envioStore.set({ sentToday: 0, sentDay: todayStr(), sentThisHour: 0, sentHour: hourStr() });
  pushLog('↻ Contadores zerados.');
};
export const setTestMode = (v: boolean) => envioStore.set({ testMode: v });
export const setTestRecipient = (v: string) => envioStore.set({ testRecipient: v });
export const setFromName = (v: string) => envioStore.set({ fromName: v });
export const setFromAddress = (v: string) => envioStore.set({ fromAddress: v });
export const setReplyTo = (v: string) => envioStore.set({ replyTo: v });
export const setShowFloating = (v: boolean) => envioStore.set({ showFloating: v });
export const setHeroImageUrl = (v: string) => envioStore.set({ heroImageUrl: v });

export function ensureDailyWindow() {
  const s = envioStore.get();
  const today = todayStr();
  const hour = hourStr();
  const patch: Partial<State> = {};
  if (s.sentDay !== today) {
    patch.sentDay = today;
    patch.sentToday = 0;
    pushLog(`📆 Novo dia (${today}) — contador diário resetado.`);
  }
  if (s.sentHour !== hour) {
    patch.sentHour = hour;
    patch.sentThisHour = 0;
  }
  if (Object.keys(patch).length) envioStore.set(patch);
}




/* ----------------------------- queue actions ------------------------------ */

export async function loadRecipients(opts: { limit?: number } = {}) {
  // Guard: se a engine não está rodando (running == false), não importa novos
  // se o usuário parou o envio, a importação também deve parar.
  if (!running && !opts.limit) return;

  const limit = Math.max(1, opts.limit ?? 1);
  if (envioStore.get().loading) return;
  envioStore.set({ loading: true });
  try {
    // A fila de envio espelha EXATAMENTE a lista de "Empresas Importadas":
    // mesma tabela, mesma ordenação (created_at desc), sem limite artificial.
    // Empresas sem e-mail entram como "skipped" para manter o paralelo visual
    // com a lista, mas só as com e-mail válido serão disparadas.
    const PAGE = 1000;
    const all: any[] = [];
    let from = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await supabase
        .from('companies')
        .select(
          'id, cnpj, razao_social_original, nome_titular_exibicao, nome_fantasia, email, inicio_atividade, situacao_cadastral_desc, uf, municipio_descricao',
        )
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const chunk = data ?? [];
      all.push(...chunk);
      if (chunk.length < PAGE) break;
      from += PAGE;
      if (all.length >= 20000) break; // salvaguarda dura
    }

    const companyIds = all.map((c: any) => c.id).filter(Boolean);
    const linksMap: Record<string, { token: string; url: string }> = {};
    for (let i = 0; i < companyIds.length; i += 500) {
      const slice = companyIds.slice(i, i + 500);
      const { data: links } = await supabase
        .from('company_links')
        .select('company_id, public_token, public_url')
        .in('company_id', slice)
        .eq('active', true);
      for (const l of (links ?? []) as Array<{ company_id: string | null; public_token: string; public_url: string | null }>) {
        if (l.company_id && l.public_token && !linksMap[l.company_id]) {
          // Sempre reescreve pra rota de animação — /acesso/{token} — mesmo
          // quando o public_url já existe (links antigos apontam para /c/).
          const url = buildPublicUrl(l.public_token);
          linksMap[l.company_id] = { token: l.public_token, url };
        }
      }
    }

    const withEmail = all.filter((c: any) => /.+@.+\..+/.test(c.email || ''));
    const missing = withEmail.filter((c: any) => !linksMap[c.id]);
    if (missing.length > 0) {
      const inserts = missing.map((c: any) => {
        const token = crypto.randomUUID().replace(/-/g, '');
        return {
          company_id: c.id,
          public_token: token,
          token,
          public_url: buildPublicUrl(token),
          checkout_url: buildCheckoutUrl(token),
          active: true,
          status: 'active',
          company_data: {
            cnpj: c.cnpj,
            nome: c.nome_titular_exibicao || c.razao_social_original,
          } as any,
        };
      });
      const { data: inserted, error: insErr } = await supabase
        .from('company_links')
        .insert(inserts)
        .select('company_id, public_token, public_url');
      if (insErr) {
        pushLog(`⚠ Falha ao criar links únicos: ${insErr.message}`);
      } else {
        for (const l of (inserted ?? []) as Array<{ company_id: string | null; public_token: string; public_url: string | null }>) {
          if (l.company_id) {
            linksMap[l.company_id] = {
              token: l.public_token,
              url: buildPublicUrl(l.public_token),
            };
          }
        }
        pushLog(`🔗 Criados ${inserted?.length ?? 0} links únicos.`);
      }
    }

    // Índice de já-enviados (por CNPJ e por e-mail normalizado) para nunca
    // reinserir alguém que já foi disparado — mesmo depois de reload.
    const sentSet = new Set<string>();
    for (const s of envioStore.get().sentEmails) {
      const c = normCnpj(s.cnpj);
      const e = normEmail(s.email);
      if (c) sentSet.add('c:' + c);
      if (e) sentSet.add('e:' + e);
    }

    // Também consulta o banco: qualquer destinatário com sent_at != null em
    // email_campaign_recipients conta como já enviado (sobrevive a limpar
    // histórico local, trocar de navegador, restaurar snapshot, etc.).
    try {
      const emailsToCheck = Array.from(
        new Set(all.map((c: any) => normEmail(c.email || '')).filter(Boolean)),
      );
      const cnpjsToCheck = Array.from(
        new Set(all.map((c: any) => normCnpj(c.cnpj)).filter(Boolean)),
      );
      const CHUNK = 500;
      for (let i = 0; i < emailsToCheck.length; i += CHUNK) {
        const slice = emailsToCheck.slice(i, i + CHUNK);
        const { data } = await supabase
          .from('email_campaign_recipients')
          .select('email, cnpj')
          .not('sent_at', 'is', null)
          .in('email', slice);
        for (const r of (data ?? []) as Array<{ email: string | null; cnpj: string | null }>) {
          const e = normEmail(r.email);
          const c = normCnpj(r.cnpj);
          if (e) sentSet.add('e:' + e);
          if (c) sentSet.add('c:' + c);
        }
      }
      for (let i = 0; i < cnpjsToCheck.length; i += CHUNK) {
        const slice = cnpjsToCheck.slice(i, i + CHUNK);
        const { data } = await supabase
          .from('email_campaign_recipients')
          .select('email, cnpj')
          .not('sent_at', 'is', null)
          .in('cnpj', slice);
        for (const r of (data ?? []) as Array<{ email: string | null; cnpj: string | null }>) {
          const e = normEmail(r.email);
          const c = normCnpj(r.cnpj);
          if (e) sentSet.add('e:' + e);
          if (c) sentSet.add('c:' + c);
        }
      }
    } catch {
      // Se a consulta falhar, seguimos apenas com o índice em memória.
    }




    // IDs / chaves já presentes na fila atual para nunca duplicar.
    const currentQueue = envioStore.get().queue;
    const queuedCnpj = new Set<string>();
    const queuedEmail = new Set<string>();
    const queuedId = new Set<string>();
    for (const q of currentQueue) {
      const c = normCnpj(q.cnpj);
      const e = normEmail(q.email || '');
      if (c) queuedCnpj.add(c);
      if (e) queuedEmail.add(e);
      if (q.id) queuedId.add(q.id);
    }

    // Deduplica por CNPJ e por e-mail; ordem já é mais-recente-primeiro.
    const seenCnpj = new Set<string>();
    const seenEmail = new Set<string>();
    const newItems: QueueItem[] = [];
    let skippedSent = 0;
    for (const c of all) {
      if (newItems.length >= limit) break; // só 1 (ou N) por sincronização
      const cnpjKey = normCnpj(c.cnpj);
      const emailKey = normEmail(c.email || '');
      if (cnpjKey && seenCnpj.has(cnpjKey)) continue;
      if (emailKey && seenEmail.has(emailKey)) continue;
      if (cnpjKey) seenCnpj.add(cnpjKey);
      if (emailKey) seenEmail.add(emailKey);

      const alreadySent =
        (cnpjKey && sentSet.has('c:' + cnpjKey)) ||
        (emailKey && sentSet.has('e:' + emailKey));
      if (alreadySent) { skippedSent++; continue; }



      // Já está na fila (pendente, enviando, enviada, erro) → não reinsere.
      if (queuedId.has(c.id)) continue;
      if (cnpjKey && queuedCnpj.has(cnpjKey)) continue;
      if (emailKey && queuedEmail.has(emailKey)) continue;

      const hasEmail = /.+@.+\..+/.test(c.email || '');
      if (!hasEmail) continue; // só sincroniza contatos com e-mail válido

      newItems.push({
        id: c.id,
        email: c.email || '',
        cnpj: c.cnpj,
        company_name: c.nome_fantasia || c.razao_social_original || c.nome_titular_exibicao || '',
        data_abertura: c.inicio_atividade || '',
        situacao: c.situacao_cadastral_desc || '',
        uf: c.uf || '',
        municipio: c.municipio_descricao || '',
        status: 'pending',
        message: undefined,
        publicToken: linksMap[c.id]?.token || null,
        publicUrl: linksMap[c.id]?.url || null,
      });
    }
    if (newItems.length > 0) {
      // Empresas novas SEMPRE entram no início da fila (prioridade máxima):
      // as que já foram processadas/estão em envio continuam depois delas.
      const inFlight = currentQueue.filter((q) => q.status === 'sending');
      const rest = currentQueue.filter((q) => q.status !== 'sending');
      envioStore.set({ queue: [...inFlight, ...newItems, ...rest] });
      pushLog(`Fila sincronizada: +${newItems.length} nova(s) empresa(s) no topo da fila${skippedSent ? ` (${skippedSent} já enviados ignorados)` : ''}.`);

    } else {
      pushLog(`Fila sincronizada: nenhum novo pendente${skippedSent ? ` (${skippedSent} já enviados ignorados)` : ''}.`);
    }
  } catch (e: any) {
    toast.error('Erro ao carregar destinatários: ' + e.message);
  } finally {
    envioStore.set({ loading: false });
  }
}

export function resetStatuses() {
  envioStore.set((s) => ({
    queue: s.queue.map((q) => ({ ...q, status: 'pending', message: undefined })),
  }));
  pushLog('↻ Status da fila resetados.');
  toast.success('Status resetados.');
}

export function clearQueue() {
  if (running) {
    toast.error('Pare o envio antes de limpar a fila.');
    return;
  }
  envioStore.set({ queue: [] });
  pushLog('🗑 Fila esvaziada.');
  toast.success('Fila limpa.');
}

export function clearPendingQueue() {
  const before = envioStore.get().queue.length;
  envioStore.set((s) => ({
    queue: s.queue.filter((q) => q.status !== 'pending'),
  }));
  const after = envioStore.get().queue.length;
  const removed = before - after;
  if (removed > 0) {
    pushLog(`🗑 ${removed} pendente(s) removido(s) da fila.`);
    toast.success(`${removed} pendente(s) removido(s).`);
  } else {
    toast.info('Nenhum item pendente na fila.');
  }
}


export function clearLogs() {
  envioStore.set({ logs: [] });
}

export function clearSentEmails() {
  envioStore.set({ sentEmails: [] });
  pushLog('🗑 Lista de enviados limpa.');
}

export function removeSentEmail(id: string) {
  envioStore.set((s) => ({ sentEmails: s.sentEmails.filter((e) => e.id !== id) }));
}

export function removeSentEmailsInRange(fromISO?: string, toISO?: string): number {
  const fromMs = fromISO ? new Date(fromISO).getTime() : undefined;
  const toMs = toISO ? new Date(toISO).getTime() : undefined;
  let removed = 0;
  envioStore.set((s) => {
    const kept = s.sentEmails.filter((e) => {
      const t = new Date(e.sentAt).getTime();
      if (fromMs !== undefined && t < fromMs) return true;
      if (toMs !== undefined && t > toMs) return true;
      removed++;
      return false;
    });
    return { sentEmails: kept };
  });
  if (removed > 0) pushLog(`🗑 ${removed} registro(s) de enviados removido(s) do período selecionado.`);
  return removed;
}

/* --------------------------------- send ----------------------------------- */

function buildVarsFor(item: QueueItem) {
  const s = envioStore.get();
  const row: Record<string, any> = {
    NOME_EMPRESARIAL: item.company_name,
    NOME_TITULAR: item.company_name,
    CNPJ: item.cnpj,
    DATA_ABERTURA: item.data_abertura || '',
    SITUACAO: 'CNPJ sem certificado pendente',
    MUNICIPIO: item.municipio || '',
    UF: item.uf || '',
    EMAIL: item.email,
    // O link do e-mail precisa ser SEMPRE absoluto e apontar para /acesso/<token>.
    // (public_url no banco é relativo, ex.: "/c/<token>" — não serve em e-mail.)
    LINK_PUBLICO: item.publicToken
      ? buildPublicUrl(item.publicToken)
      : item.publicUrl && /^https?:\/\//i.test(item.publicUrl)
        ? item.publicUrl
        : `${getPublicBaseUrl()}/modelo`,

    TOKEN: item.publicToken || '',

  };
  return rowToVars(row, {
    name: s.fromName,
    company: s.fromName,
    reference: `MEI-${new Date().getFullYear()}`,
  });
}

async function sendOne(item: QueueItem, channelIndex?: number): Promise<{ ok: boolean; waitSec?: number }> {
  envioStore.set((s) => ({
    queue: s.queue.map((q) =>
      q.id === item.id ? { ...q, status: 'sending', message: undefined } : q,
    ),
  }));
  const cfg = envioStore.get();
  const vars = buildVarsFor(item);
  const variant = variantFor(item.id || item.cnpj || item.email);
  const subj = substitute(variant.subject, vars);
  try {
    const res: any = await sendCampaignEmail({
      data: {
        recipient: item.email,
        subject: subj,
        vars,
        design: variant.design,
        fromName: cfg.fromName,
        fromAddress: cfg.fromAddress,
        replyTo: cfg.replyTo || undefined,
        testMode: cfg.testMode,
        testRecipient: cfg.testMode ? cfg.testRecipient || null : null,
        idempotencyKey: `campaign-${item.id}-${Date.now()}`,
        companyId: item.id,
        cnpj: item.cnpj,
        channelIndex,
      },
    });

    if (res.sent) {
      ensureDailyWindow();
      const nowIso = new Date().toISOString();
      if (cfg.testMode) {
        // Envios de TESTE não contam nos KPIs, painel flutuante nem rate limit.
        // Apenas removem o item da fila e registram no log.
        envioStore.set((s) => ({
          queue: s.queue.filter((q) => q.id !== item.id),
        }));
        pushLog(`✓ (TESTE) Enviado para ${res.recipient} — não contabilizado`);
        return { ok: true };
      }
      const entry: SentEmail = {
        id: item.id + '-' + Date.now(),
        email: res.recipient || item.email,
        cnpj: item.cnpj,
        company_name: item.company_name,
        subject: subj,
        sentAt: nowIso,
        testMode: false,
        publicUrl: item.publicUrl || null,
      };
      envioStore.set((s) => ({
        // Remove imediatamente da fila e move para "Enviados"
        queue: s.queue.filter((q) => q.id !== item.id),
        sentEmails: [entry, ...s.sentEmails].slice(0, 5000),
        sentToday: s.sentToday + 1,
        sentThisHour: s.sentThisHour + 1,
        lastSuccessAt: nowIso,
        lastErrorMsg: null,
      }));
      pushLog(`✓ Enviado para ${res.recipient} (${envioStore.get().sentToday} hoje · ${envioStore.get().sentThisHour} nesta hora)`);
      return { ok: true };
    }


    if (res.reason === 'recipient_suppressed') {
      const { email, cnpj, company_name } = item;
      pushLog(`🚫 Suprimido (${email}) — removendo empresa e registros...`);
      
      // Remove do banco (cleanup imediato para liberar espaço)
      try {
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const cId = item.id;
        
        // Remove registros de histórico de campanha para esse CNPJ/Email
        if (cnpj) {
          await supabaseAdmin.from('email_campaign_recipients').delete().eq('cnpj', cnpj.replace(/\D+/g, ''));
        }
        await supabaseAdmin.from('email_campaign_recipients').delete().eq('email', email.trim().toLowerCase());
        
        // Remove links
        await supabaseAdmin.from('company_links').delete().eq('company_id', cId);
        
        // Remove empresa
        await supabaseAdmin.from('companies').delete().eq('id', cId);
        
        pushLog(`✅ Limpeza concluída para ${company_name} (${cnpj})`);
      } catch (e: any) {
        pushLog(`⚠ Falha na limpeza automática: ${e.message}`);
      }

      envioStore.set((s) => ({
        queue: s.queue.filter((q) => q.id !== item.id),
      }));
      return { ok: true };
    }
    if (res.reason === 'rate_limited') {
      const wait = res.retryAfterSeconds ?? 60;
      const until = new Date(Date.now() + wait * 1000).toISOString();
      const now = new Date().toISOString();
      
      envioStore.set((s) => {
        const windowStart = s.rateLimitWindowStart || now;
        const windowMs = new Date().getTime() - new Date(windowStart).getTime();
        const newCount = windowMs > 3600000 ? 1 : s.rateLimitCount + 1;
        
        // Se 3 ou mais 429 em 1 hora, pausa por 60 min
        let finalWaitUntil = until;
        if (newCount >= 3) {
          finalWaitUntil = new Date(Date.now() + 3600 * 1000).toISOString();
          pushLog(`🚨 Múltiplos 429 detectados (${newCount}). Pausando fila por 60 minutos.`);
        }

        return {
          queue: s.queue.map((q) =>
            q.id === item.id ? { ...q, status: 'pending', message: 'Rate limited (429)' } : q,
          ),
          rateLimitPauseUntil: finalWaitUntil,
          rateLimitCount: newCount,
          rateLimitWindowStart: windowMs > 3600000 ? now : windowStart,
          throttleMode: true, // Ativa modo reduzido após 429
        };
      });
      
      pushLog(`⏸ HTTP 429: Retomada prevista em ${new Date(envioStore.get().rateLimitPauseUntil!).toLocaleTimeString()}`);
      return { ok: false, waitSec: wait };
    }
    const { email, cnpj, company_name } = item;
    pushLog(`✗ Erro ${email}: ${res.message} — apagando empresa automaticamente.`);
    try {
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
      const cId = item.id;
      if (cnpj) {
        await supabaseAdmin.from('email_campaign_recipients').delete().eq('cnpj', cnpj.replace(/\D+/g, ''));
      }
      await supabaseAdmin.from('email_campaign_recipients').delete().eq('email', email.trim().toLowerCase());
      await supabaseAdmin.from('company_links').delete().eq('company_id', cId);
      await supabaseAdmin.from('companies').delete().eq('id', cId);
      pushLog(`✅ Limpeza de erro concluída para ${company_name}`);
    } catch (cleanErr: any) {
      pushLog(`⚠ Falha na limpeza após erro: ${cleanErr.message}`);
    }
    envioStore.set((s) => ({
      queue: s.queue.filter((q) => q.id !== item.id),
      lastErrorMsg: res.message || 'erro desconhecido',
    }));
    return { ok: true };
  } catch (e: any) {
    const isError = true;
    const { email, cnpj, company_name } = item;

    // Se o erro for uma falha definitiva (ex: email não existe, domínio inválido)
    // ou se o usuário pediu para "apagar empresas que não chegou email"
    pushLog(`✗ Falha ${email}: ${e.message} — apagando empresa automaticamente.`);

    try {
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
      const cId = item.id;
      
      if (cnpj) {
        await supabaseAdmin.from('email_campaign_recipients').delete().eq('cnpj', cnpj.replace(/\D+/g, ''));
      }
      await supabaseAdmin.from('email_campaign_recipients').delete().eq('email', email.trim().toLowerCase());
      await supabaseAdmin.from('company_links').delete().eq('company_id', cId);
      await supabaseAdmin.from('companies').delete().eq('id', cId);
      
      pushLog(`✅ Limpeza de erro concluída para ${company_name}`);
    } catch (cleanErr: any) {
      pushLog(`⚠ Falha na limpeza após erro: ${cleanErr.message}`);
    }

    envioStore.set((s) => ({
      queue: s.queue.filter((q) => q.id !== item.id),
      lastErrorMsg: e.message || 'falha de rede',
    }));
    return { ok: true };
  }
}

export async function startSending() {
  if (running || envioStore.get().running) return;
  const cfg = envioStore.get();
  if (cfg.testMode && !cfg.testRecipient) {
    toast.error('Modo teste ativo: informe um e-mail de teste.');
    return;
  }
  running = true;
  paused = false;
  stopFlag = false;
  envioStore.set({ running: true, paused: false });
  pushLog(`▶ Iniciando envio${cfg.testMode ? ' (MODO TESTE)' : ''}. Delay: ${cfg.delaySec}s`);

  // Um clique em "Iniciar envio real" ativa o fluxo completo. Isso elimina o
  // ciclo em que a fila vazia encerrava o envio antes de a importação conseguir
  // inserir a próxima empresa.
  if (!cfg.testMode) {
    try {
      const mod = await import('./consulta-engine');
      // No fluxo de envio contínuo não existe meta de importações: ele só
      // termina quando o operador pressiona "Parar envio real".
      mod.setAutoImportTarget(0);
      if (!mod.consultaStore.get().autoCount) mod.setAutoCount(true);
      if (!mod.consultaStore.get().autoImport) mod.setAutoImport(true);
      pushLog('↻ Fluxo contínuo ativo: consultar recentes → importar → enviar.');
    } catch (error) {
      pushLog(`⚠ Não foi possível iniciar a consulta automática: ${error instanceof Error ? error.message : 'erro desconhecido'}`);
    }
  }

  // Reavaliar a cada iteração com estado atualizado.
  while (!stopFlag) {
    ensureDailyWindow();
    const cur = envioStore.get();
    // Metas e limites pausam o fluxo, mas nunca desligam o botão. O motor só
    // encerra quando o operador chama stopSending().
    if (cur.stopAtDaily > 0 && cur.sentToday >= cur.stopAtDaily) {
      pushLog(`⏸ Meta diária atingida (${cur.sentToday}/${cur.stopAtDaily}). Aguardando o próximo dia sem desligar o fluxo.`);
      while (!stopFlag && envioStore.get().sentDay === todayStr()) {
        await new Promise((resolve) => setTimeout(resolve, 30_000));
        ensureDailyWindow();
      }
      continue;
    }
    if (cur.limitMode === 'daily' && cur.dailyLimit > 0 && cur.sentToday >= cur.dailyLimit) {
      pushLog(
        `⏸ Limite diário atingido (${cur.sentToday}/${cur.dailyLimit}). Aguardando o próximo dia sem desligar o fluxo.`,
      );
      while (!stopFlag && envioStore.get().sentDay === todayStr()) {
        await new Promise((resolve) => setTimeout(resolve, 30_000));
        ensureDailyWindow();
      }
      continue;
    }


    if (cur.limitMode === 'hourly' && cur.hourlyLimit > 0 && cur.sentThisHour >= cur.hourlyLimit) {
      const rest = Math.max(0, cur.hourlyRestMin || 0);
      if (rest > 0) {
        pushLog(`⏸ Limite por hora atingido (${cur.sentThisHour}/${cur.hourlyLimit}). Descansando ${rest} min antes de retomar...`);
        const restMs = rest * 60_000;
        const step = 5_000;
        let waited = 0;
        while (waited < restMs && !stopFlag) {
          await new Promise((r) => setTimeout(r, step));
          waited += step;
        }
        if (stopFlag) break;
        // Reseta a janela horária manualmente para liberar novo lote
        envioStore.set({ sentThisHour: 0, sentHour: hourStr() });
        pushLog(`▶ Descanso concluído. Retomando envios (novo lote de até ${cur.hourlyLimit}).`);
        continue;
      }
      // Aguarda a virada da hora e libera um novo lote automaticamente
      // (não depende de a chave da hora ser recalculada corretamente).
      const waitMs = msToNextHour();
      pushLog(
        `⏸ Limite por hora atingido (${cur.sentThisHour}/${cur.hourlyLimit}). Retomando em ${Math.ceil(waitMs / 60000)} min (virada da hora).`,
      );
      let waitedHour = 0;
      while (waitedHour < waitMs && !stopFlag) {
        await new Promise((r) => setTimeout(r, 5_000));
        waitedHour += 5_000;
      }
      if (stopFlag) break;
      envioStore.set({ sentThisHour: 0, sentHour: hourStr() });
      pushLog(`▶ Nova hora iniciada. Retomando envios (lote de até ${cur.hourlyLimit}).`);
      continue;

    }
    const pendings = cur.queue.filter((x) => x.status === 'pending' || x.status === 'error');
    if (pendings.length === 0) {
      // Fila vazia nunca finaliza o envio real. Reforça os motores automáticos,
      // consulta o topo do dia e aguarda a próxima empresa recente.
      try {
        const mod = await import('./consulta-engine');
        if (!cur.testMode) {
          if (!mod.consultaStore.get().autoCount) mod.setAutoCount(true);
          if (!mod.consultaStore.get().autoImport) mod.setAutoImport(true);
        }
      } catch { /* noop */ }
      pushLog('⏳ Fila vazia. Aguardando importação automática puxar próximo CNPJ...');
      let waited = 0;
      while (waited < 60_000 && !stopFlag) {
        await new Promise((r) => setTimeout(r, 3_000));
        waited += 3_000;
        try { await loadRecipients(); } catch { /* noop */ }
        const has = envioStore.get().queue.some((x) => x.status === 'pending' || x.status === 'error');
        if (has) break;
      }
      if (stopFlag) break;
      continue;
    }

    while (paused && !stopFlag) {
      await new Promise((r) => setTimeout(r, 500));
    }
    if (stopFlag) break;

    // Rigorosamente 100 e-mails por hora (3600s / 100 = 36s de intervalo).
    // O effectiveLimit deve refletir o hourlyLimit configurado (100).
    const effectiveLimit = cur.hourlyLimit || 100;
    if (cur.sentThisHour >= effectiveLimit) {
      const waitMs = msToNextHour();
      pushLog(`⏸ Limite ${effectiveLimit}/h atingido. Aguardando virada da hora...`);

      let waited = 0;
      while (waited < waitMs && !stopFlag) {
        await new Promise((r) => setTimeout(r, 5000));
        waited += 5000;
      }
      continue;
    }

    // Processamento de retoma de rate limit
    if (cur.rateLimitPauseUntil) {
      const until = new Date(cur.rateLimitPauseUntil).getTime();
      const remaining = until - Date.now();
      if (remaining > 0) {
        pushLog(`⏸ Fila pausada por 429. Retomando em ${Math.ceil(remaining / 60000)} min...`);
        let waited = 0;
        while (waited < remaining && !stopFlag) {
          await new Promise((r) => setTimeout(r, 5000));
          waited += 5000;
          if (new Date(envioStore.get().rateLimitPauseUntil || 0).getTime() <= Date.now()) break;
        }
        if (stopFlag) break;
      }
      envioStore.set({ rateLimitPauseUntil: null });
    }

    // Verificação de reset do throttleMode (60 min sem 429)
    if (cur.throttleMode && cur.rateLimitWindowStart) {
       const windowMs = Date.now() - new Date(cur.rateLimitWindowStart).getTime();
       if (windowMs > 3600000 && cur.rateLimitCount === 0) {
          envioStore.set({ throttleMode: false });
          pushLog("✨ Estabilidade confirmada por 60 min. Voltando para cota de 100/h.");

       }
    }

    // CONCORRÊNCIA: Somente 1 envio por vez (conforme instrução).
    // O sistema ignora os workers Lovable para garantir processamento serial único.
    let parallelism = 1;
    
    const batch = pendings.slice(0, parallelism);
    const results = await Promise.all(batch.map((it, i) => sendOne(it, i)));
    
    // Se algum canal disse "rate_limited", o loop principal continuará 
    // e cairá na verificação de rateLimitPauseUntil no topo do while.
    
    if (!stopFlag) {
      // INTERVALO: 36 segundos (ou 72 se throttleMode)
      const baseDelay = cur.throttleMode ? 72 : 36;

      const delay = Math.max(baseDelay, envioStore.get().delaySec);
      await new Promise((r) => setTimeout(r, delay * 1000));
    }
  }

  running = false;
  paused = false;
  // Modo teste nunca persiste entre sessões: ao entrar, sempre desligado.
  envioStore.set({ running: false, paused: false, testMode: false });
  pushLog(stopFlag ? '■ Envio parado pelo operador.' : '■ Envio finalizado.');
}

export function togglePause() {
  if (!running && !envioStore.get().running) return;
  paused = !paused;
  envioStore.set({ paused });
  pushLog(paused ? '⏸ Pausado.' : '▶ Retomando...');
}

export function stopSending() {
  // Sempre sinaliza parada, mesmo se o módulo estiver dessincronizado do store.
  stopFlag = true;
  paused = false;
  running = false;
  envioStore.set({ running: false, paused: false });

  // Desativa também os motores de consulta/importação para garantir parada total
  import('./consulta-engine').then(mod => {
    if (mod.consultaStore.get().autoCount) mod.setAutoCount(false);
    if (mod.consultaStore.get().autoImport) mod.setAutoImport(false);
  }).catch(() => {});

  pushLog('■ Parada solicitada.');
}

export async function sendSingle(item: QueueItem) {
  if (running) {
    toast.error('Aguarde o envio atual terminar (ou pare).');
    return;
  }
  const cfg = envioStore.get();
  if (cfg.testMode && !cfg.testRecipient) {
    toast.error('Modo teste ativo: informe um e-mail de teste.');
    return;
  }
  pushLog(`➤ Envio único para ${item.email}${cfg.testMode ? ' (TESTE)' : ''}`);
  await sendOne(item);
}

/**
 * Dispara UM único e-mail de teste para `testRecipient`, sem depender da fila.
 * Busca no backend a empresa real mais recente com link ativo. Não usa a fila
 * local, pois ela pode manter tokens antigos depois de uma limpeza/importação.
 */
export async function sendTestOnce() {
  if (running) {
    toast.error('Aguarde o envio atual terminar (ou pare).');
    return;
  }
  const cfg = envioStore.get();
  const to = (cfg.testRecipient || '').trim();
  if (!to) {
    toast.error('Informe um e-mail de teste primeiro.');
    return;
  }
  // Usa uma empresa real quando existir. Com a base zerada, cai num
  // exemplo de demonstração — o caminho de envio (remetente, domínio,
  // template e API) é exatamente o mesmo do disparo real.
  let realCompany: any = null;
  try {
    realCompany = await getLatestTestEmailCompany();
  } catch {
    realCompany = null;
  }

  const sample: QueueItem = realCompany
    ? {
        id: realCompany.id,
        email: realCompany.email,
        cnpj: realCompany.cnpj,
        company_name: realCompany.company_name,
        data_abertura: realCompany.data_abertura,
        situacao: 'CNPJ sem certificado pendente',
        uf: realCompany.uf,
        municipio: realCompany.municipio,
        status: 'pending',
        publicToken: realCompany.public_token,
        publicUrl: realCompany.public_url,
      }
    : {
        id: 'demo-test',
        email: to,
        cnpj: '12.345.678/0001-90',
        company_name: 'EMPRESA DEMONSTRACAO MEI',
        data_abertura: '01/01/2024',
        situacao: 'CNPJ sem certificado pendente',
        uf: 'SP',
        municipio: 'São Paulo',
        status: 'pending',
        publicToken: 'demo',
        publicUrl: `${typeof window !== 'undefined' ? window.location.origin : ''}/c/demo`,
      };


  const vars = buildVarsFor(sample);

  const testVariant = variantFor(sample.cnpj || to);
  const subj = substitute(testVariant.subject, vars);
  pushLog(`🧪 Teste com empresa real ${sample.company_name} (${sample.cnpj}) para ${to}...`);
  try {
    const res: any = await sendCampaignEmail({
      data: {
        recipient: to,
        subject: subj,
        vars,
        design: testVariant.design,
        fromName: cfg.fromName,
        fromAddress: cfg.fromAddress,
        replyTo: cfg.replyTo || undefined,
        testMode: true,
        testRecipient: to,
        idempotencyKey: `test-${Date.now()}`,
      },
    });
    if (res.sent) {
      pushLog(`✓ Teste enviado para ${res.recipient}`);
      toast.success(`E-mail de teste enviado para ${res.recipient}`);
    } else {
      pushLog(`✗ Teste falhou: ${res.message ?? res.reason}`);
      toast.error(`Falha no teste: ${res.message ?? res.reason}`);
    }
  } catch (e: any) {
    pushLog(`✗ Teste falhou: ${e.message}`);
    toast.error('Falha no teste: ' + e.message);
  }
}


export function buildVarsForPreview(item: QueueItem) {
  return buildVarsFor(item);
}

/* ------------------------- bootstrap (side-effect) ------------------------ */

let booted = false;
let syncTimer: any = null;
function scheduleAutoSync(delay = 1500) {
  if (typeof window === 'undefined') return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    if (envioStore.get().loading) return;
    void loadRecipients();
  }, delay);
}

export function bootEnvioEngine() {
  if (booted || typeof window === 'undefined') return;
  booted = true;
  envioStore.set({ running: false, paused: false });

  // Auto-sync: qualquer INSERT/DELETE/UPDATE em companies dispara reload
  // debounced, garantindo que a fila sempre espelhe "Empresas Importadas".
  try {
    supabase
      .channel('envio-engine:companies-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'companies' },
        () => scheduleAutoSync(1500),
      )
      .subscribe();
  } catch {
    /* realtime opcional */
  }

  // Fallback polling leve (30s) — cobre casos em que o realtime falhe.
  setInterval(() => {
    if (!envioStore.get().running) scheduleAutoSync(500);
  }, 30_000);
}

