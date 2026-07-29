// Content script — assume o controle do WhatsApp Web e digita letra por letra.
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function rand(a, b) { return a + Math.random() * (b - a); }

async function waitFor(selector, timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const el = document.querySelector(selector);
    if (el) return el;
    await sleep(250);
  }
  return null;
}

function isInvalidNumberDialog() {
  const texts = [
    'número de telefone compartilhado', 'phone number shared',
    'não faz parte do whatsapp', 'isn\'t on whatsapp', 'não está no whatsapp',
    'número inválido', 'invalid',
  ];
  const dialogs = document.querySelectorAll('[role="dialog"], [role="alertdialog"]');
  for (const d of dialogs) {
    const t = (d.innerText || '').toLowerCase();
    if (texts.some((x) => t.includes(x))) return true;
  }
  return false;
}

async function dismissDialogs() {
  const btns = document.querySelectorAll('[role="dialog"] button, [role="alertdialog"] button');
  for (const b of btns) {
    const t = (b.innerText || '').toLowerCase();
    if (t.includes('ok') || t.includes('fechar') || t.includes('close')) { b.click(); await sleep(400); }
  }
}

// Insere UM caractere no compositor contenteditable disparando eventos como se fosse digitação real.
function typeChar(el, ch) {
  el.focus();
  // 1) usa a API oficial de execCommand quando disponível (mantém emojis, quebras)
  if (ch === '\n') {
    // Shift+Enter → nova linha no WhatsApp Web
    const ev = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13, shiftKey: true });
    el.dispatchEvent(ev);
    document.execCommand('insertLineBreak');
    return;
  }
  // dispara keydown "invisível" para simular a tecla
  el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: ch }));
  const inserted = document.execCommand('insertText', false, ch);
  if (!inserted) {
    // fallback: manipulação direta com InputEvent
    const ev = new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: ch });
    el.dispatchEvent(ev);
  }
  el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: ch }));
}

async function typeMessageHuman(el, message) {
  el.focus();
  // pequeno "pensando antes de começar"
  await sleep(rand(400, 1200));
  const chars = Array.from(message); // suporta emojis multibyte
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    typeChar(el, ch);
    // ritmo humano
    let delay = rand(35, 110);
    if (ch === ' ') delay = rand(60, 160);
    if (ch === '.' || ch === ',' || ch === '!' || ch === '?') delay = rand(200, 500);
    if (ch === '\n') delay = rand(250, 600);
    // ocasional "pausa para pensar"
    if (Math.random() < 0.015) delay += rand(600, 1600);
    await sleep(delay);
  }
  // pausa antes de mandar
  await sleep(rand(500, 1400));
}

async function clickSendButton(composer) {
  let sendBtn = document.querySelector('button[aria-label="Enviar"], button[aria-label="Send"], [data-icon="send"], [data-testid="send"]');
  if (sendBtn && sendBtn.tagName !== 'BUTTON') sendBtn = sendBtn.closest('button');
  if (sendBtn) {
    sendBtn.click();
    return true;
  }
  // fallback: Enter
  composer.focus();
  composer.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13 }));
  composer.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13 }));
  composer.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13 }));
  return true;
}

async function sendCurrent(message) {
  await sleep(rand(1200, 2500));
  await dismissDialogs();
  if (isInvalidNumberDialog()) return { ok: false, error: 'número inválido no WhatsApp' };

  // aguarda caixa de mensagem (footer com contenteditable)
  const composer = await waitFor('footer div[contenteditable="true"], footer [role="textbox"][contenteditable="true"]', 25000);
  if (!composer) {
    if (isInvalidNumberDialog()) return { ok: false, error: 'número inválido no WhatsApp' };
    return { ok: false, error: 'caixa de mensagem não carregou' };
  }

  // se veio via ?text= no URL, o WhatsApp pode já ter preenchido — limpamos para digitar do zero
  try {
    composer.focus();
    document.execCommand('selectAll', false, undefined);
    document.execCommand('delete', false, undefined);
  } catch { /* noop */ }

  if (message && message.length > 0) {
    await typeMessageHuman(composer, message);
  }

  await clickSendButton(composer);
  await sleep(rand(1200, 2200));
  return { ok: true };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'SEND_CURRENT') {
    (async () => {
      try { sendResponse(await sendCurrent(msg.message || '')); }
      catch (e) { sendResponse({ ok: false, error: String(e?.message || e) }); }
    })();
    return true;
  }
});
