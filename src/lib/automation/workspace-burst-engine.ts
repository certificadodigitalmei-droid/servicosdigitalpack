/**
 * Engine de "Envio Google Workspace em Rajadas".
 *
 * Diferente do Envio em Massa via Lovable Emails, este módulo:
 * - Puxa até 100 empresas por ciclo (respeitando duplicatas e teto diário).
 * - Envia TODAS de uma vez, em paralelo, via Gmail API (Google Workspace).
 * - Depois aguarda um "descanso" configurável (1 a 5 minutos) e repete.
 * - Cap diário fixo em 2000 envios/dia (limite oficial da Gmail API para
 *   contas Google Workspace no plano básico).
 */

import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { createStore } from './store';
import { sendWorkspaceBurst } from '@/lib/gmail/burst.functions';
import {
  DEFAULT_DESIGN,
  DEFAULT_SUBJECT,
  renderHtml,
  renderText,
  rowToVars,
  substitute,
  type CampaignDesign,
} from '@/lib/email-campaign/template';
import { PUBLIC_BASE_URL } from '@/lib/public-base-url';
import {
  loadSavedDesign,
  loadSavedSubject,
  loadSavedFromName,
} from './envio-engine';

export const DAILY_HARD_CAP = 2000;
export const BURST_SIZE = 100;

export type BurstQueueItem = {
  id: string; // company_id
  email: string;
  cnpj: string;
  company_name: string;
  publicUrl: string;
  ok?: boolean;
  message?: string;
  sentAt?: string;
};

type State = {
  running: boolean;
  paused: boolean;
  restingUntil: string | null; // ISO
  delayMinMin: number; // minutos mínimos entre lotes
  delayMinMax: number; // minutos máximos entre lotes
  testMode: boolean;
  testRecipient: string;
  sentToday: number;
  sentDay: string; // YYYY-MM-DD
  cycles: number;
  lastBatchAt: string | null;
  lastBatchSent: number;
  lastBatchFailed: number;
  lastBatch: BurstQueueItem[];
  logs: string[];
};

function todayStr() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

const initial: State = {
  running: false,
  paused: false,
  restingUntil: null,
  delayMinMin: 1,
  delayMinMax: 3,
  testMode: false,
  testRecipient: '',
  sentToday: 0,
  sentDay: todayStr(),
  cycles: 0,
  lastBatchAt: null,
  lastBatchSent: 0,
  lastBatchFailed: 0,
  lastBatch: [],
  logs: [],
};

export const wsBurstStore = createStore<State>(initial, {
  storageKey: 'automation:ws-burst:v1',
  persistKeys: [
    'delayMinMin',
    'delayMinMax',
    'testMode',
    'testRecipient',
    'sentToday',
    'sentDay',
    'cycles',
    'lastBatchAt',
    'lastBatchSent',
    'lastBatchFailed',
    'lastBatch',
    'logs',
    'restingUntil',
  ],
});

// Controles do loop fora do store para não thrashear renders.
let running = false;
let paused = false;
let stopFlag = false;

export function isBurstEngineRunning() {
  return running;
}

function pushLog(msg: string) {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
  wsBurstStore.set((s) => ({ logs: [line, ...s.logs].slice(0, 500) }));
}

function ensureDailyWindow() {
  const s = wsBurstStore.get();
  const today = todayStr();
  if (s.sentDay !== today) {
    wsBurstStore.set({ sentDay: today, sentToday: 0 });
    pushLog(`📆 Novo dia (${today}) — contador diário zerado.`);
  }
}

/* ------------------------------- setters ---------------------------------- */

export const setDelayRange = (min: number, max: number) => {
  const lo = Math.max(1, Math.min(5, Math.round(min)));
  const hi = Math.max(lo, Math.min(5, Math.round(max)));
  wsBurstStore.set({ delayMinMin: lo, delayMinMax: hi });
};
export const setTestMode = (v: boolean) => wsBurstStore.set({ testMode: v });
export const setTestRecipient = (v: string) => wsBurstStore.set({ testRecipient: v });
export const resetDailyCounter = () => {
  wsBurstStore.set({ sentToday: 0, sentDay: todayStr() });
  pushLog('↻ Contador diário zerado manualmente.');
};
export const clearLogs = () => wsBurstStore.set({ logs: [] });

/* ------------------------- loading recipients ----------------------------- */

const normCnpj = (v: string | null | undefined) => (v || '').replace(/\D+/g, '');
const normEmail = (v: string | null | undefined) => (v || '').trim().toLowerCase();

async function loadNextBatch(limit: number): Promise<BurstQueueItem[]> {
  // Traz até `limit * 5` candidatos ordenados por mais recentes,
  // depois filtra em memória os já enviados e sem e-mail.
  const overFetch = Math.max(limit * 5, 500);
  const { data, error } = await supabase
    .from('companies')
    .select('id, cnpj, razao_social_original, nome_titular_exibicao, nome_fantasia, email')
    .order('created_at', { ascending: false })
    .limit(overFetch);
  if (error) throw error;
  const all = data ?? [];

  const withEmail = all.filter((c: any) => /.+@.+\..+/.test(c.email || ''));
  if (withEmail.length === 0) return [];

  const emails = Array.from(new Set(withEmail.map((c: any) => normEmail(c.email)).filter(Boolean)));
  const cnpjs = Array.from(new Set(withEmail.map((c: any) => normCnpj(c.cnpj)).filter(Boolean)));

  // Deduplicação durável via email_campaign_recipients.sent_at
  const sentSet = new Set<string>();
  const CHUNK = 500;
  for (let i = 0; i < emails.length; i += CHUNK) {
    const slice = emails.slice(i, i + CHUNK);
    const { data: r } = await supabase
      .from('email_campaign_recipients')
      .select('email, cnpj')
      .not('sent_at', 'is', null)
      .in('email', slice);
    for (const row of (r ?? []) as Array<{ email: string | null; cnpj: string | null }>) {
      const e = normEmail(row.email);
      const c = normCnpj(row.cnpj);
      if (e) sentSet.add('e:' + e);
      if (c) sentSet.add('c:' + c);
    }
  }
  for (let i = 0; i < cnpjs.length; i += CHUNK) {
    const slice = cnpjs.slice(i, i + CHUNK);
    const { data: r } = await supabase
      .from('email_campaign_recipients')
      .select('email, cnpj')
      .not('sent_at', 'is', null)
      .in('cnpj', slice);
    for (const row of (r ?? []) as Array<{ email: string | null; cnpj: string | null }>) {
      const e = normEmail(row.email);
      const c = normCnpj(row.cnpj);
      if (e) sentSet.add('e:' + e);
      if (c) sentSet.add('c:' + c);
    }
  }

  // Filtra e dedup local por CNPJ/email
  const seenC = new Set<string>();
  const seenE = new Set<string>();
  const filtered: any[] = [];
  for (const c of withEmail) {
    if (filtered.length >= limit) break;
    const ck = normCnpj(c.cnpj);
    const ek = normEmail(c.email);
    if (ck && seenC.has(ck)) continue;
    if (ek && seenE.has(ek)) continue;
    if (ck && sentSet.has('c:' + ck)) continue;
    if (ek && sentSet.has('e:' + ek)) continue;
    if (ck) seenC.add(ck);
    if (ek) seenE.add(ek);
    filtered.push(c);
  }
  if (filtered.length === 0) return [];

  // Garante link público único (mesma lógica do envio em massa)
  const ids = filtered.map((c: any) => c.id);
  const linksMap: Record<string, { token: string; url: string }> = {};
  const { data: linksData } = await supabase
    .from('company_links')
    .select('company_id, public_token')
    .in('company_id', ids)
    .eq('active', true);
  for (const l of (linksData ?? []) as Array<{ company_id: string | null; public_token: string }>) {
    if (l.company_id && l.public_token && !linksMap[l.company_id]) {
      linksMap[l.company_id] = {
        token: l.public_token,
        url: `${PUBLIC_BASE_URL}/acesso/${l.public_token}`,
      };
    }
  }
  const missing = filtered.filter((c: any) => !linksMap[c.id]);
  if (missing.length > 0) {
    const inserts = missing.map((c: any) => {
      const token = crypto.randomUUID().replace(/-/g, '');
      return {
        company_id: c.id,
        public_token: token,
        token,
        public_url: `${PUBLIC_BASE_URL}/acesso/${token}`,
        checkout_url: `${PUBLIC_BASE_URL}/checkout/${token}`,
        active: true,
        status: 'active',
        company_data: {
          cnpj: c.cnpj,
          nome: c.nome_titular_exibicao || c.razao_social_original,
        } as any,
      };
    });
    const { data: inserted } = await supabase
      .from('company_links')
      .insert(inserts)
      .select('company_id, public_token');
    for (const l of (inserted ?? []) as Array<{ company_id: string | null; public_token: string }>) {
      if (l.company_id) {
        linksMap[l.company_id] = {
          token: l.public_token,
          url: `${PUBLIC_BASE_URL}/acesso/${l.public_token}`,
        };
      }
    }
  }

  return filtered.map((c: any) => ({
    id: c.id,
    email: c.email,
    cnpj: c.cnpj,
    company_name: c.nome_fantasia || c.razao_social_original || c.nome_titular_exibicao || '',
    publicUrl: linksMap[c.id]?.url || `${PUBLIC_BASE_URL}/modelo`,
  }));
}

/* --------------------------- rendering per item --------------------------- */

function buildDesignAndSubject(): { design: CampaignDesign; subjectTpl: string; fromName: string } {
  const design: CampaignDesign = { ...DEFAULT_DESIGN, ...loadSavedDesign() };
  const subjectTpl = loadSavedSubject() || DEFAULT_SUBJECT;
  const fromName = loadSavedFromName() || 'Certificado Digital MEI';
  return { design, subjectTpl, fromName };
}

function renderMessage(item: BurstQueueItem, design: CampaignDesign, subjectTpl: string, fromName: string) {
  const row: Record<string, any> = {
    NOME_EMPRESARIAL: item.company_name,
    NOME_TITULAR: item.company_name,
    CNPJ: item.cnpj,
    DATA_ABERTURA: '',
    SITUACAO: 'CNPJ sem certificado pendente',
    MUNICIPIO: '',
    UF: '',
    EMAIL: item.email,
    LINK_PUBLICO: item.publicUrl,
    TOKEN: '',
  };
  const vars = rowToVars(row, {
    name: fromName,
    company: fromName,
    reference: `MEI-${new Date().getFullYear()}`,
  });
  return {
    to: item.email,
    subject: substitute(subjectTpl, vars),
    html: renderHtml(design, vars),
    text: renderText(design, vars),
    companyId: item.id,
    cnpj: item.cnpj,
  };
}

/* -------------------------------- burst ----------------------------------- */

async function runBurstOnce(): Promise<{ done: boolean; reason?: string }> {
  ensureDailyWindow();
  const s = wsBurstStore.get();
  const remaining = DAILY_HARD_CAP - s.sentToday;
  if (remaining <= 0) {
    return { done: true, reason: `Teto diário de ${DAILY_HARD_CAP} atingido.` };
  }
  const size = Math.min(BURST_SIZE, remaining);

  pushLog(`⏳ Buscando até ${size} destinatários novos…`);
  const items = await loadNextBatch(size);
  if (items.length === 0) {
    pushLog('Nenhuma empresa nova disponível para envio.');
    return { done: false, reason: 'empty' };
  }
  pushLog(`✉ Preparando disparo em rajada de ${items.length} e-mail(s)…`);

  const { design, subjectTpl, fromName } = buildDesignAndSubject();
  const messages = items.map((it) => renderMessage(it, design, subjectTpl, fromName));

  try {
    const res: any = await (sendWorkspaceBurst as any)({
      data: {
        messages,
        testMode: s.testMode,
        testRecipient: s.testMode ? s.testRecipient || null : null,
      },
    });
    const results: any[] = res.results ?? [];
    const marked: BurstQueueItem[] = items.map((it) => {
      const r = results.find((x) => (x.companyId === it.id) || (x.to.toLowerCase() === it.email.toLowerCase()));
      return {
        ...it,
        ok: r ? !!r.ok : false,
        message: r ? (r.ok ? `Enviado (${r.messageId})` : `${r.code || 'erro'}: ${r.error}`) : 'sem resposta',
        sentAt: new Date().toISOString(),
      };
    });

    wsBurstStore.set((st) => ({
      sentToday: st.sentToday + (res.sent ?? 0),
      cycles: st.cycles + 1,
      lastBatchAt: new Date().toISOString(),
      lastBatchSent: res.sent ?? 0,
      lastBatchFailed: res.failed ?? 0,
      lastBatch: marked,
    }));
    pushLog(`✅ Rajada concluída — ${res.sent ?? 0} enviado(s), ${res.failed ?? 0} falha(s).`);
    return { done: false };
  } catch (e: any) {
    pushLog(`❌ Falha na rajada: ${e?.message ?? 'erro'}`);
    return { done: false, reason: 'error' };
  }
}

async function loop() {
  running = true;
  wsBurstStore.set({ running: true, paused: false });
  pushLog('▶ Envio Google Workspace iniciado.');

  while (!stopFlag) {
    if (paused) {
      await sleep(1000);
      continue;
    }
    const r = await runBurstOnce();
    if (stopFlag) break;
    if (r.done) {
      pushLog(`⏹ Loop finalizado: ${r.reason}`);
      break;
    }

    // Descanso entre lotes: sorteia entre delayMinMin e delayMinMax
    const st = wsBurstStore.get();
    const min = Math.max(1, st.delayMinMin);
    const max = Math.max(min, st.delayMinMax);
    const chosen = min + Math.random() * (max - min);
    const restMs = Math.round(chosen * 60_000);
    const until = new Date(Date.now() + restMs).toISOString();
    wsBurstStore.set({ restingUntil: until });
    pushLog(`💤 Descansando ${chosen.toFixed(1)} min antes da próxima rajada…`);
    await sleepUntil(until);
    wsBurstStore.set({ restingUntil: null });
  }

  running = false;
  stopFlag = false;
  wsBurstStore.set({ running: false, paused: false, restingUntil: null });
  pushLog('■ Envio Google Workspace parado.');
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
async function sleepUntil(iso: string) {
  const target = new Date(iso).getTime();
  while (!stopFlag && !paused) {
    const remaining = target - Date.now();
    if (remaining <= 0) return;
    await sleep(Math.min(1000, remaining));
  }
}

/* ------------------------------ public API -------------------------------- */

export function startBurstEngine() {
  if (running) return;
  ensureDailyWindow();
  const s = wsBurstStore.get();
  if (s.sentToday >= DAILY_HARD_CAP) {
    toast.error(`Teto diário de ${DAILY_HARD_CAP} envios já foi atingido hoje.`);
    return;
  }
  paused = false;
  stopFlag = false;
  void loop();
  toast.success('Rajadas iniciadas.');
}

export function pauseBurstEngine() {
  if (!running) return;
  paused = !paused;
  wsBurstStore.set({ paused });
  pushLog(paused ? '⏸ Pausado.' : '▶ Retomado.');
}

export function stopBurstEngine() {
  if (!running) return;
  stopFlag = true;
  pushLog('■ Parada solicitada.');
}

/**
 * Envia um único e-mail de teste imediato usando o Modelo de Mensagem atual.
 * Não conta no teto diário e não grava histórico.
 */
export async function sendBurstTestEmail(to: string, sampleCompany?: {
  cnpj?: string;
  company_name?: string;
}): Promise<{ ok: boolean; message: string }> {
  if (!/.+@.+\..+/.test(to)) return { ok: false, message: 'E-mail inválido' };
  const { design, subjectTpl, fromName } = buildDesignAndSubject();
  const item: BurstQueueItem = {
    id: '00000000-0000-0000-0000-000000000000',
    email: to,
    cnpj: sampleCompany?.cnpj || '00.000.000/0001-00',
    company_name: sampleCompany?.company_name || 'EMPRESA TESTE LTDA',
    publicUrl: `${PUBLIC_BASE_URL}/modelo`,
  };
  const msg = renderMessage(item, design, subjectTpl, fromName);
  try {
    const res: any = await (sendWorkspaceBurst as any)({
      data: {
        messages: [{ to: msg.to, subject: msg.subject, html: msg.html, text: msg.text }],
        testMode: true,
        testRecipient: to,
      },
    });
    const r = (res.results ?? [])[0];
    if (r?.ok) {
      pushLog(`🧪 Teste enviado com sucesso para ${to}.`);
      return { ok: true, message: `Enviado — messageId ${r.messageId}` };
    }
    pushLog(`🧪 Falha no teste para ${to}: ${r?.error ?? 'erro'}`);
    return { ok: false, message: r?.error || 'Falha desconhecida' };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? 'erro' };
  }
}
