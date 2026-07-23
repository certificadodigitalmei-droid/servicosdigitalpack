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
import {
  DEFAULT_SUBJECT,
  rowToVars,
  substitute,
  type CampaignDesign,
} from '@/lib/email-campaign/template';

/** Lê o design salvo pela aba "Modelo de Mensagem" para aplicar no envio real. */
export function loadSavedDesign(): Partial<CampaignDesign> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem('campanha:design:v1');
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}
export function loadSavedSubject(): string | null {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage.getItem('campanha:subject:v1'); } catch { return null; }
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
export function mergedDesign(heroImageUrl?: string): Partial<CampaignDesign> {
  const saved = loadSavedDesign();
  return heroImageUrl ? { ...saved, heroImageUrl } : saved;
}

/** Sincroniza assunto/remetente do Modelo de Mensagem para a engine de Envio em Massa. */
export function syncFromMessageModel() {
  const subject = loadSavedSubject();
  const fromName = loadSavedFromName();
  const fromAddress = loadSavedFromAddress();
  const replyTo = loadSavedReplyTo();
  envioStore.set((s) => ({
    ...s,
    ...(subject ? { subject } : {}),
    ...(fromName ? { fromName } : {}),
    ...(fromAddress ? { fromAddress } : {}),
    ...(replyTo !== null ? { replyTo } : {}),
  }));
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
  const d = new Date();
  // chave YYYY-MM-DDTHH em horário de São Paulo (aproximação: usa offset local)
  return todayStr() + 'T' + String(d.getHours()).padStart(2, '0');
}

const initial: State = {
  subject: DEFAULT_SUBJECT,
  delaySec: 60,
  batchLimit: 200,
  limitMode: 'daily',
  dailyLimit: 50,
  hourlyLimit: 30,
  hourlyRestMin: 0,
  stopAtDaily: 0,

  sentToday: 0,
  sentThisHour: 0,
  sentDay: todayStr(),
  sentHour: hourStr(),
  testMode: true,
  testRecipient: '',
  fromName: 'Certificado Digital MEI',
  fromAddress: 'certificado.mei.estadual@seu-certificado-mei-digital.online',
  replyTo: '',
  showFloating: true,
  heroImageUrl: '',
  lastSuccessAt: null,
  lastErrorMsg: null,
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
    'testMode',
    'testRecipient',
    'fromName',
    'fromAddress',
    'replyTo',
    'showFloating',
    'heroImageUrl',
    'lastSuccessAt',
    'lastErrorMsg',
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
import { PUBLIC_BASE_URL } from '@/lib/public-base-url';

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

function ensureDailyWindow() {
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

export async function loadRecipients() {
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
          let url = l.public_url || '';
          // URL quebrada (`http:///c/...`, sem host, apontando pro preview do
          // Lovable ou pro domínio antigo de envio) → reconstruir a partir do token.
          if (
            !url ||
            /^https?:\/\/\/?/i.test(url) ||
            !/^https?:\/\/[^/]+/i.test(url) ||
            /lovable\.app|localhost|127\.0\.0\.1|seu-certificado-mei-digital\.online/i.test(url)
          ) {
            url = `${PUBLIC_BASE_URL}/c/${l.public_token}`;
          }
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
          public_url: `${PUBLIC_BASE_URL}/c/${token}`,
          checkout_url: `${PUBLIC_BASE_URL}/checkout/${token}`,
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
              url: l.public_url || `${PUBLIC_BASE_URL}/c/${l.public_token}`,
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

    // Deduplica por CNPJ e por e-mail; ordem já é mais-recente-primeiro.
    const seenCnpj = new Set<string>();
    const seenEmail = new Set<string>();
    const items: QueueItem[] = [];
    let skippedSent = 0;
    for (const c of all) {
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

      const hasEmail = /.+@.+\..+/.test(c.email || '');
      items.push({
        id: c.id,
        email: c.email || '',
        cnpj: c.cnpj,
        company_name: c.nome_fantasia || c.razao_social_original || c.nome_titular_exibicao || '',
        data_abertura: c.inicio_atividade || '',
        situacao: c.situacao_cadastral_desc || '',
        uf: c.uf || '',
        municipio: c.municipio_descricao || '',
        status: hasEmail ? 'pending' : 'skipped',
        message: hasEmail ? undefined : 'Sem e-mail',
        publicToken: linksMap[c.id]?.token || null,
        publicUrl: linksMap[c.id]?.url || null,
      });
    }
    envioStore.set({ queue: items });
    const pendingCount = items.filter((i) => i.status === 'pending').length;
    pushLog(`Fila sincronizada: ${items.length} únicos (${pendingCount} pendentes, ${skippedSent} já enviados excluídos).`);
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

/* --------------------------------- send ----------------------------------- */

function buildVarsFor(item: QueueItem) {
  const s = envioStore.get();
  const row: Record<string, any> = {
    NOME_EMPRESARIAL: item.company_name,
    NOME_TITULAR: item.company_name,
    CNPJ: item.cnpj,
    DATA_ABERTURA: item.data_abertura || '',
    SITUACAO: item.situacao || 'CNPJ sem certificado ativo',
    MUNICIPIO: item.municipio || '',
    UF: item.uf || '',
    EMAIL: item.email,
    LINK_PUBLICO: item.publicUrl
      ? item.publicUrl
      : item.publicToken
        ? `${PUBLIC_BASE_URL}/c/${item.publicToken}`
        : `${PUBLIC_BASE_URL}/modelo`,
    TOKEN: item.publicToken || '',

  };
  return rowToVars(row, {
    name: s.fromName,
    company: s.fromName,
    reference: `MEI-${new Date().getFullYear()}`,
  });
}

async function sendOne(item: QueueItem): Promise<{ ok: boolean; waitSec?: number }> {
  envioStore.set((s) => ({
    queue: s.queue.map((q) =>
      q.id === item.id ? { ...q, status: 'sending', message: undefined } : q,
    ),
  }));
  const cfg = envioStore.get();
  const vars = buildVarsFor(item);
  const subj = substitute(loadSavedSubject() || cfg.subject, vars);
  try {
    const res: any = await sendCampaignEmail({
      data: {
        recipient: item.email,
        subject: subj,
        vars,
        design: mergedDesign(cfg.heroImageUrl || undefined),
        fromName: cfg.fromName,
        fromAddress: cfg.fromAddress,
        replyTo: cfg.replyTo || undefined,
        testMode: cfg.testMode,
        testRecipient: cfg.testMode ? cfg.testRecipient || null : null,
        idempotencyKey: `campaign-${item.id}-${Date.now()}`,
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
      envioStore.set((s) => ({
        queue: s.queue.map((q) =>
          q.id === item.id ? { ...q, status: 'suppressed', message: res.message } : q,
        ),
      }));
      pushLog(`⊘ Suprimido ${item.email}: ${res.message ?? ''}`);
      return { ok: true };
    }
    if (res.reason === 'rate_limited') {
      envioStore.set((s) => ({
        queue: s.queue.map((q) =>
          q.id === item.id ? { ...q, status: 'pending', message: res.message } : q,
        ),
      }));
      pushLog(`⏸ Rate-limited: aguardando ${res.retryAfterSeconds ?? 60}s`);
      return { ok: false, waitSec: res.retryAfterSeconds ?? 60 };
    }
    envioStore.set((s) => ({
      queue: s.queue.map((q) =>
        q.id === item.id ? { ...q, status: 'error', message: res.message } : q,
      ),
      lastErrorMsg: res.message || 'erro desconhecido',
    }));
    pushLog(`✗ Erro ${item.email}: ${res.message}`);
    return { ok: true };
  } catch (e: any) {
    envioStore.set((s) => ({
      queue: s.queue.map((q) =>
        q.id === item.id ? { ...q, status: 'error', message: e.message } : q,
      ),
      lastErrorMsg: e.message || 'falha de rede',
    }));
    pushLog(`✗ Falha ${item.email}: ${e.message}`);
    return { ok: true };
  }
}

export async function startSending() {
  if (running) return;
  const cfg = envioStore.get();
  if (cfg.testMode && !cfg.testRecipient) {
    toast.error('Modo teste ativo: informe um e-mail de teste.');
    return;
  }
  if (cfg.queue.length === 0) {
    toast.error('Nenhum destinatário na fila.');
    return;
  }
  running = true;
  paused = false;
  stopFlag = false;
  envioStore.set({ running: true, paused: false });
  pushLog(`▶ Iniciando envio${cfg.testMode ? ' (MODO TESTE)' : ''}. Delay: ${cfg.delaySec}s`);

  // Reavaliar a cada iteração com estado atualizado.
  while (!stopFlag) {
    ensureDailyWindow();
    const cur = envioStore.get();
    // "Parar tudo" (meta diária): interrompe envio, importação e consultas.
    if (cur.stopAtDaily > 0 && cur.sentToday >= cur.stopAtDaily) {
      pushLog(`🛑 Meta diária atingida (${cur.sentToday}/${cur.stopAtDaily}). Parando envio + importação automática.`);
      toast.info(`Meta diária atingida (${cur.stopAtDaily}). Tudo pausado até amanhã.`);
      try {
        const mod = await import('./consulta-engine');
        mod.setAutoImport(false);
      } catch { /* opcional */ }
      break;
    }
    if (cur.limitMode === 'daily' && cur.dailyLimit > 0 && cur.sentToday >= cur.dailyLimit) {
      pushLog(`🛑 Limite diário atingido (${cur.sentToday}/${cur.dailyLimit}). Envio parado.`);
      toast.info(`Limite diário atingido (${cur.dailyLimit}).`);
      break;
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
      pushLog(`⏸ Limite por hora atingido (${cur.sentThisHour}/${cur.hourlyLimit}). Aguardando próxima hora...`);
      // aguarda 60s e reavalia — ensureDailyWindow reseta ao virar a hora
      await new Promise((r) => setTimeout(r, 60_000));
      continue;
    }
    const item = cur.queue.find((x) => x.status === 'pending' || x.status === 'error');
    if (!item) break;

    while (paused && !stopFlag) {
      await new Promise((r) => setTimeout(r, 500));
    }
    if (stopFlag) break;



    const res = await sendOne(item);
    if (!res.ok && res.waitSec) {
      const waitMs = Math.min(res.waitSec, 300) * 1000;
      await new Promise((r) => setTimeout(r, waitMs));
      if (!stopFlag) await sendOne(item);
    }
    if (!stopFlag) {
      const delay = Math.max(1, envioStore.get().delaySec);
      await new Promise((r) => setTimeout(r, delay * 1000));
    }
  }

  running = false;
  paused = false;
  envioStore.set({ running: false, paused: false });
  pushLog('■ Envio finalizado.');
}

export function togglePause() {
  if (!running) return;
  paused = !paused;
  envioStore.set({ paused });
  pushLog(paused ? '⏸ Pausado.' : '▶ Retomando...');
}

export function stopSending() {
  if (!running) return;
  stopFlag = true;
  paused = false;
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
 * Usa o primeiro item da fila para preencher variáveis (nome, CNPJ etc.)
 * — se a fila estiver vazia, usa dados fictícios.
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
  const sample: QueueItem = cfg.queue[0] || {
    id: 'demo-' + Date.now(),
    email: to,
    cnpj: '00000000000000',
    company_name: 'Empresa Exemplo LTDA',
    data_abertura: '01/01/2024',
    situacao: 'CNPJ sem certificado ativo',
    uf: 'SP',
    municipio: 'São Paulo',
    status: 'pending',
    publicToken: null,
  };
  const vars = buildVarsFor(sample);
  const subj = substitute(loadSavedSubject() || cfg.subject, vars);
  pushLog(`🧪 Enviando 1 e-mail de teste para ${to}...`);
  try {
    const res: any = await sendCampaignEmail({
      data: {
        recipient: to,
        subject: subj,
        vars,
        design: mergedDesign(cfg.heroImageUrl || undefined),
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

