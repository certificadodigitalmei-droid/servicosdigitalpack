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
} from '@/lib/email-campaign/template';

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
};

type State = {
  // Config persistida
  subject: string;
  delaySec: number;
  batchLimit: number;
  testMode: boolean;
  testRecipient: string;
  fromName: string;
  fromAddress: string;
  replyTo: string;
  showFloating: boolean;
  heroImageUrl: string;

  // Estado
  queue: QueueItem[];
  running: boolean;
  paused: boolean;
  loading: boolean;
  logs: string[];
};

const initial: State = {
  subject: DEFAULT_SUBJECT,
  delaySec: 8,
  batchLimit: 200,
  testMode: true,
  testRecipient: '',
  fromName: 'Certificado Digital MEI',
  fromAddress: 'certificado.mei.estadual@seu-certificado-mei-digital.online',
  replyTo: '',
  showFloating: true,
  heroImageUrl: '',
  queue: [],
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
    'testMode',
    'testRecipient',
    'fromName',
    'fromAddress',
    'replyTo',
    'showFloating',
    'heroImageUrl',
    'queue',
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

export const setSubject = (v: string) => envioStore.set({ subject: v });
export const setDelaySec = (n: number) => envioStore.set({ delaySec: Math.max(1, n) });
export const setBatchLimit = (n: number) => envioStore.set({ batchLimit: Math.max(1, n) });
export const setTestMode = (v: boolean) => envioStore.set({ testMode: v });
export const setTestRecipient = (v: string) => envioStore.set({ testRecipient: v });
export const setFromName = (v: string) => envioStore.set({ fromName: v });
export const setFromAddress = (v: string) => envioStore.set({ fromAddress: v });
export const setReplyTo = (v: string) => envioStore.set({ replyTo: v });
export const setShowFloating = (v: boolean) => envioStore.set({ showFloating: v });
export const setHeroImageUrl = (v: string) => envioStore.set({ heroImageUrl: v });


/* ----------------------------- queue actions ------------------------------ */

export async function loadRecipients() {
  envioStore.set({ loading: true });
  try {
    const { batchLimit } = envioStore.get();
    const { data, error } = await supabase
      .from('companies')
      .select(
        'id, cnpj, razao_social_original, nome_titular_exibicao, nome_fantasia, email, inicio_atividade, situacao_cadastral_desc, uf, municipio_descricao',
      )
      .not('email', 'is', null)
      .neq('email', '')
      .order('created_at', { ascending: false })
      .limit(batchLimit);
    if (error) throw error;

    const companyIds = (data ?? []).map((c: any) => c.id).filter(Boolean);
    const linksMap: Record<string, string> = {};
    if (companyIds.length > 0) {
      const { data: links } = await supabase
        .from('company_links')
        .select('company_id, public_token')
        .in('company_id', companyIds);
      for (const l of (links ?? []) as Array<{ company_id: string | null; public_token: string }>) {
        if (l.company_id && l.public_token && !linksMap[l.company_id]) {
          linksMap[l.company_id] = l.public_token;
        }
      }
    }

    const items: QueueItem[] = (data ?? [])
      .filter((c: any) => /.+@.+\..+/.test(c.email))
      .map((c: any) => ({
        id: c.id,
        email: c.email,
        cnpj: c.cnpj,
        company_name: c.nome_fantasia || c.razao_social_original || c.nome_titular_exibicao || '',
        data_abertura: c.inicio_atividade || '',
        situacao: c.situacao_cadastral_desc || '',
        uf: c.uf || '',
        municipio: c.municipio_descricao || '',
        status: 'pending',
        publicToken: linksMap[c.id] || null,
      }));
    envioStore.set({ queue: items });
    pushLog(`Carregados ${items.length} destinatários (limite ${batchLimit}).`);
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
    LINK_PUBLICO: item.publicToken
      ? `${typeof window !== 'undefined' ? window.location.origin : ''}/c/${item.publicToken}`
      : `${typeof window !== 'undefined' ? window.location.origin : ''}/modelo`,
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
  const subj = substitute(cfg.subject, vars);
  try {
    const res: any = await sendCampaignEmail({
      data: {
        recipient: item.email,
        subject: subj,
        vars,
        fromName: cfg.fromName,
        fromAddress: cfg.fromAddress,
        replyTo: cfg.replyTo || undefined,
        testMode: cfg.testMode,
        testRecipient: cfg.testMode ? cfg.testRecipient || null : null,
        idempotencyKey: `campaign-${item.id}-${new Date().toISOString().slice(0, 10)}`,
      },
    });
    if (res.sent) {
      envioStore.set((s) => ({
        queue: s.queue.map((q) => (q.id === item.id ? { ...q, status: 'sent' } : q)),
      }));
      pushLog(`✓ Enviado para ${res.recipient}`);
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
    }));
    pushLog(`✗ Erro ${item.email}: ${res.message}`);
    return { ok: true };
  } catch (e: any) {
    envioStore.set((s) => ({
      queue: s.queue.map((q) =>
        q.id === item.id ? { ...q, status: 'error', message: e.message } : q,
      ),
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
    const q = envioStore.get().queue;
    const item = q.find((x) => x.status === 'pending' || x.status === 'error');
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

export function buildVarsForPreview(item: QueueItem) {
  return buildVarsFor(item);
}

/* ------------------------- bootstrap (side-effect) ------------------------ */

let booted = false;
export function bootEnvioEngine() {
  if (booted || typeof window === 'undefined') return;
  booted = true;
  // Loops assíncronos não retomam sozinhos após reload — o usuário reinicia.
  // Mas a fila e logs persistidos já são visíveis.
  envioStore.set({ running: false, paused: false });
}
