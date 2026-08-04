const $ = (id) => document.getElementById(id);

async function load() {
  const s = await chrome.storage.local.get(['wa_token', 'wa_base', 'wa_running', 'wa_stats']);
  $('token').value = s.wa_token || '';
  $('base').value = s.wa_base || 'https://seu-certificado-mei-digital.online';
  updateUi(!!s.wa_running, s.wa_stats || { sent: 0, failed: 0 });
  // heartbeat pra pegar sent_today e daily_limit
  chrome.runtime.sendMessage({ type: 'PING_HEARTBEAT' }, (resp) => {
    if (resp?.cfg) {
      $('senttoday').textContent = resp.cfg.sent_today ?? 0;
      $('daily').textContent = resp.cfg.daily_limit ?? '-';
    }
  });
  // detecta aba wpp
  const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
  $('tabinfo').textContent = tabs.length ? 'WhatsApp Web ✓' : 'WhatsApp Web ✗';
}

function updateUi(running, stats) {
  $('dot').className = 'dot ' + (running ? 'dot-on' : 'dot-off');
  $('statuslabel').textContent = running ? 'Enviando…' : 'Parado';
  $('sessionsent').textContent = stats.sent || 0;
  $('failed').textContent = stats.failed || 0;
  $('start').style.display = running ? 'none' : 'block';
  $('stop').style.display = running ? 'block' : 'none';
}

$('save').addEventListener('click', async () => {
  await chrome.storage.local.set({ wa_token: $('token').value.trim(), wa_base: $('base').value.trim() });
  $('save').textContent = 'Salvo ✓';
  setTimeout(() => ($('save').textContent = 'Salvar configurações'), 1200);
});

$('start').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'START' }, () => load());
});
$('stop').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'STOP' }, () => load());
});

load();
setInterval(load, 5000);
