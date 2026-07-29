// Content script rodando em web.whatsapp.com
// Recebe SEND_CURRENT e clica no botão de envio da conversa aberta.
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function waitFor(selector, timeout = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const el = document.querySelector(selector);
    if (el) return el;
    await sleep(300);
  }
  return null;
}

async function isInvalidNumberDialog() {
  // WhatsApp mostra popup "número compartilhado inválido"
  const texts = ['número de telefone compartilhado', 'phone number shared', 'não faz parte do whatsapp'];
  const dialogs = document.querySelectorAll('[role="dialog"], [role="alertdialog"]');
  for (const d of dialogs) {
    const t = (d.innerText || '').toLowerCase();
    if (texts.some((x) => t.includes(x))) return true;
  }
  return false;
}

async function clickSend() {
  // aguarda footer/caixa de mensagem carregar
  const composer = await waitFor('footer [contenteditable="true"], footer div[role="textbox"]', 20000);
  if (!composer) {
    if (await isInvalidNumberDialog()) return { ok: false, error: 'número inválido no WhatsApp' };
    return { ok: false, error: 'caixa de mensagem não carregou' };
  }
  await sleep(800 + Math.random() * 1500);
  // procura botão enviar
  let sendBtn = document.querySelector('button[aria-label="Enviar"], button[aria-label="Send"], [data-icon="send"]');
  if (sendBtn && sendBtn.tagName !== 'BUTTON') sendBtn = sendBtn.closest('button');
  if (!sendBtn) {
    // fallback: dispara Enter
    composer.focus();
    const ev = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13 });
    composer.dispatchEvent(ev);
    await sleep(1500);
    return { ok: true };
  }
  sendBtn.click();
  await sleep(1500);
  return { ok: true };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'SEND_CURRENT') {
    (async () => {
      try {
        const r = await clickSend();
        sendResponse(r);
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();
    return true;
  }
});
