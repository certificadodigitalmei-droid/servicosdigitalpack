# Automação WhatsApp Web via Extensão Chrome

Vamos criar uma **extensão de navegador** que roda dentro do WhatsApp Web (web.whatsapp.com) e se conecta ao painel. Você seleciona a lista (ex: "nunca visitaram", "geraram PIX pendente", etc.), aperta "Iniciar envio", e a extensão simula você enviando manualmente — com pausas aleatórias para ficar natural e reduzir risco de bloqueio ao mínimo.

## Arquitetura

```text
[Painel Web]  <-->  [Fila no banco]  <-->  [Extensão Chrome]  -->  [WhatsApp Web]
    |                     |                       |
 escolhe                salva                   envia 1 msg
 lista                pendentes              marca enviada
 e ritmo                                     pega próxima
```

## Parte 1 - Banco de dados

Nova tabela `whatsapp_queue`:
- `id`, `phone`, `message`, `company_name`, `cnpj`, `company_link_id`
- `status`: pending | sending | sent | failed | skipped
- `sent_at`, `error_message`, `attempts`
- `batch_id` (agrupa envios do mesmo lote)
- `owner_user_id`

Nova tabela `whatsapp_batch_config`:
- Guarda perfil ativo de envio (ritmo, pausas, limites)
- Token único de autenticação da extensão (para não expor sessão)

## Parte 2 - Aba "Mensagem para Zap" (mudanças no painel)

Adicionar na aba existente:

**Bloco "Envio Automático via Extensão"**
- Status da extensão: Conectada ✅ / Desconectada ❌ (heartbeat)
- Botão "Baixar extensão" (baixa `.zip` de `/public/whatsapp-extension.zip`)
- Botão "Como instalar" (modal com passo a passo)
- Campo token único (copiar/colar na extensão uma vez)

**Perfis de ritmo (escolher um):**
| Perfil | Envios/hora | Pausa entre msgs | Pausa longa |
|---|---|---|---|
| Ultra Seguro | 20 | 90-180s aleatório | 15min a cada 15 |
| Seguro (recomendado) | 40 | 45-120s aleatório | 10min a cada 20 |
| Moderado | 80 | 25-60s aleatório | 8min a cada 30 |
| Rápido (mais risco) | 150 | 15-30s aleatório | 5min a cada 40 |

Toda pausa usa **randomização** (ex: 45-120s = sorteia valor a cada msg) para não parecer bot.

**Limite diário:** configurável (padrão 200/dia). Extensão para sozinha ao atingir.

**Botões de ação:**
- "Adicionar seleção à fila" (usa filtros atuais + template atual da aba)
- "Iniciar envio" / "Pausar" / "Zerar fila"
- Progresso em tempo real: `Enviadas: 47 / Fila: 153 / Falhas: 2 / Próxima em: 34s`

**Tabela de fila** com status ao vivo (pending, sent com hora, failed com motivo).

## Parte 3 - Endpoints públicos (extensão consome)

Todos autenticados por `X-Extension-Token` (token único gerado no painel):

- `GET /api/public/whatsapp/next?token=...` - retorna próximo `{id, phone, message}` pendente
- `POST /api/public/whatsapp/report` - `{id, status: sent|failed, error?}` marca resultado
- `POST /api/public/whatsapp/heartbeat` - extensão bate a cada 30s pra painel mostrar "Conectada"
- `GET /api/public/whatsapp/config?token=...` - retorna perfil de ritmo atual

## Parte 4 - Extensão Chrome (arquivo baixável)

Arquivos:
- `manifest.json` (MV3, permissions: web.whatsapp.com, storage)
- `background.js` - service worker: agenda próximo envio, gerencia delays, chama endpoints
- `content.js` - injetado no WhatsApp Web: abre chat, digita mensagem, clica enviar
- `popup.html` + `popup.js` - UI simples: campo token, botão ligar/desligar, status
- `icon.png`

**Fluxo da extensão:**
1. Usuário abre WhatsApp Web e faz login normal (uma vez)
2. Abre popup da extensão → cola token do painel → clica "Conectar"
3. Extensão puxa config (perfil de ritmo)
4. Loop:
   - Chama `/next` → pega `{phone, message}`
   - Content script abre `https://web.whatsapp.com/send?phone=X&text=Y`
   - Aguarda 3-8s (carregar chat)
   - Simula clique no botão enviar (busca por `[data-icon="send"]` ou `[aria-label="Enviar"]`)
   - Aguarda confirmação (check verde)
   - Reporta `sent` ou `failed`
   - Aguarda delay aleatório (do perfil)
   - Se atingiu lote (ex: 20 msgs), aguarda pausa longa
   - Repete

**Proteções anti-bloqueio:**
- Delay aleatório entre 2 valores (nunca fixo)
- "Digitação humana" simulada: pequena pausa antes de clicar enviar
- Detecta captcha / bloqueio do WhatsApp e para automaticamente
- Máximo 1 mensagem por número em 24h (dedupe local)
- Para envio se >5 falhas seguidas

## Parte 5 - Download da extensão

- Build da extensão empacotada em `public/whatsapp-extension.zip`
- Botão no painel usa `fetch + blob` (padrão exigido em preview do Lovable)
- Modal de instruções: descompactar → chrome://extensions → dev mode → carregar sem compactação

## Detalhes técnicos

**Segurança:**
- Token da extensão é aleatório 32 chars, salvo em `whatsapp_batch_config.extension_token`
- Endpoints `/api/public/whatsapp/*` validam token antes de qualquer operação
- Token não expira mas pode ser regenerado no painel (invalida extensões antigas)

**Persistência:**
- Fila fica no Supabase → se fechar navegador, retoma de onde parou ao reabrir WhatsApp Web
- Extensão salva último ID processado em `chrome.storage.local` (evita reenvio)

**Limitações honestas (aviso no painel):**
- Precisa manter aba do WhatsApp Web aberta e logada
- Não é oficial da Meta - risco existe mesmo com delay (recomendar número secundário)
- Se WhatsApp mudar layout, seletores podem quebrar (fácil de ajustar)

## O que fica pronto ao final

1. Nova seção "Envio Automático" dentro da aba Mensagem para Zap
2. Extensão `.zip` disponível pra download no painel
3. Fila persistente com status em tempo real
4. 4 perfis de ritmo com delays randomizados
5. Heartbeat mostrando se extensão está online
6. Instruções de instalação embutidas
