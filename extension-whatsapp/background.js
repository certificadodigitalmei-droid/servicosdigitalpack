// Service worker: puxa fila do painel e agenda envios com delay aleatório.
const DEFAULT_BASE = 'https://seu-certificado-mei-digital.online';
const STORAGE_KEYS = { token: 'wa_token', base: 'wa_base', running: 'wa_running', stats: 'wa_stats', batchCount: 'wa_batch_count', consec_fail: 'wa_consec_fail' };

async function getState() {
  const s = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
  return {
    token: s[STORAGE_KEYS.token] || '',
    base: s[STORAGE_KEYS.base] || DEFAULT_BASE,
    running: !!s[STORAGE_KEYS.running],
    stats: s[STORAGE_KEYS.stats] || { sent: 0, failed: 0 },
    batchCount: s[STORAGE_KEYS.batchCount] || 0,
    consecFail: s[STORAGE_KEYS.consec_fail] || 0,
  };
}
async function setState(patch) {
  const map = {};
  if ('running' in patch) map[STORAGE_KEYS.running] = patch.running;
  if ('stats' in patch) map[STORAGE_KEYS.stats] = patch.stats;
  if ('batchCount' in patch) map[STORAGE_KEYS.batchCount] = patch.batchCount;
  if ('consecFail' in patch) map[STORAGE_KEYS.consec_fail] = patch.consecFail;
  await chrome.storage.local.set(map);
}

function rand(min, max) { return Math.floor(min + Math.random() * (max - min + 1)); }

async function api(path, opts = {}) {
  const { token, base } = await getState();
  const res = await fetch(base.replace(/\/+$/, '') + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'X-Extension-Token': token, ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function heartbeat() {
  try {
    const j = await api('/api/public/whatsapp/heartbeat', { method: 'POST', body: '{}' });
    return j.config;
  } catch (e) {
    return null;
  }
}

async function fetchNext() {
  const { token } = await getState();
  if (!token) return null;
  try {
    const j = await api(`/api/public/whatsapp/next?token=${encodeURIComponent(token)}`, { method: 'GET' });
    return j.item || null;
  } catch { return null; }
}

async function report(id, status, error) {
  try { await api('/api/public/whatsapp/report', { method: 'POST', body: JSON.stringify({ id, status, error }) }); }
  catch { /* noop */ }
}

async function findWhatsAppTab() {
  const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
  return tabs[0] || null;
}

async function sendOne(item) {
  const tab = await findWhatsAppTab();
  if (!tab) return { ok: false, error: 'WhatsApp Web não está aberto' };
  // Abrimos o chat SEM texto pré-preenchido — a extensão vai digitar letra por letra.
  const url = `https://web.whatsapp.com/send?phone=${encodeURIComponent(item.phone)}`;
  await chrome.tabs.update(tab.id, { url });
  // aguarda a página processar (delay aleatório humano)
  await new Promise((r) => setTimeout(r, rand(5500, 9000)));
  // pede ao content script para digitar e enviar
  const result = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, error: 'timeout content script' }), 180000);
    chrome.tabs.sendMessage(tab.id, { type: 'SEND_CURRENT', message: item.message }, (resp) => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) return resolve({ ok: false, error: chrome.runtime.lastError.message });
      resolve(resp || { ok: false, error: 'sem resposta' });
    });
  });
  return result;
}

async function tick() {
  const st = await getState();
  if (!st.token) return schedule(30000);
  const cfg = await heartbeat();
  if (!cfg) { console.warn('[wa] heartbeat falhou - token invalido ou painel offline'); return schedule(60000); }

  // O painel manda: se cfg.running=false, a extensão pausa (mesmo se local estiver ligado).
  // Se cfg.running=true e local estiver desligado, ligamos automaticamente.
  if (!cfg.running) {
    if (st.running) await setState({ running: false });
    return schedule(30000);
  }
  if (cfg.running && !st.running) {
    await setState({ running: true, consecFail: 0 });
  }

  if (st.consecFail >= 5) {
    // pausa longa após muitas falhas seguidas
    await setState({ running: false });
    chrome.runtime.sendMessage({ type: 'AUTO_PAUSED', reason: 'muitas falhas seguidas' }).catch(() => {});
    return;
  }

  // limite diário
  if (cfg.sent_today >= cfg.daily_limit) {
    return schedule(15 * 60000);
  }

  // pausa longa a cada N envios
  if (st.batchCount > 0 && st.batchCount % cfg.batch_size === 0) {
    await setState({ batchCount: st.batchCount + 1 }); // avança pra não repetir
    return schedule(cfg.long_pause_ms);
  }

  const item = await fetchNext();
  if (!item) return schedule(rand(30000, 60000));

  const res = await sendOne(item);
  if (res.ok) {
    await report(item.id, 'sent');
    await setState({
      stats: { sent: (st.stats.sent || 0) + 1, failed: st.stats.failed || 0 },
      batchCount: (st.batchCount || 0) + 1,
      consecFail: 0,
    });
  } else if (res.notOnWhatsApp) {
    // número não tem WhatsApp — não conta como falha e não zera streak
    await report(item.id, 'skipped', 'WhatsApp não encontrado');
    await setState({
      stats: st.stats,
      batchCount: (st.batchCount || 0) + 1,
      consecFail: 0,
    });
  } else {
    await report(item.id, 'failed', res.error);
    await setState({
      stats: { sent: st.stats.sent || 0, failed: (st.stats.failed || 0) + 1 },
      consecFail: (st.consecFail || 0) + 1,
    });
  }

  const delay = rand(cfg.min_delay_ms, cfg.max_delay_ms);
  schedule(delay);
}

function schedule(ms) {
  const minutes = Math.max(0.5, ms / 60000);
  chrome.alarms.create('wa-tick', { delayInMinutes: minutes });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.type === 'START') { await setState({ running: true, consecFail: 0 }); tick(); sendResponse({ ok: true }); }
    else if (msg?.type === 'STOP') { await setState({ running: false }); chrome.alarms.clear('wa-tick'); sendResponse({ ok: true }); }
    else if (msg?.type === 'STATUS') { sendResponse(await getState()); }
    else if (msg?.type === 'PING_HEARTBEAT') { const cfg = await heartbeat(); sendResponse({ cfg }); }
    else sendResponse({ ok: false });
  })();
  return true;
});

// Loop principal a cada 1 min: sempre roda tick() para respeitar o botão do painel
// (mesmo com a extensão "parada" localmente ela verifica se o painel foi ligado).
chrome.alarms.create('wa-loop', { periodInMinutes: 1, delayInMinutes: 0.1 });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'wa-loop' || a.name === 'wa-tick') tick(); });
chrome.runtime.onInstalled.addListener(() => { tick(); });
chrome.runtime.onStartup.addListener(() => { tick(); });
