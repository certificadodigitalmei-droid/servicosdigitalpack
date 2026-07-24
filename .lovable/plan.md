# Integração Gmail API (Google Workspace)

## Objetivo
- Site continua em `https://certificadodigitalccmei.online` (nada muda).
- E-mails passam a sair **somente** de `certificadomeidigital@seu-certificado-mei-digital.online` via **Gmail API HTTPS + OAuth2** (nunca SMTP direto — Cloudflare Workers não suporta TCP).

## O que será criado

### 1. Segredos (backend, nunca no frontend)
Solicitados via `add_secret`:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `GOOGLE_SENDER_EMAIL` (fixo: `certificadomeidigital@seu-certificado-mei-digital.online`)

### 2. Banco de dados (migration)
Nova tabela `email_send_queue`:
- `id`, `to_email`, `subject`, `html`, `text`, `idempotency_key` (único), `status` (`queued|sending|sent|failed|suppressed`), `attempts`, `last_error`, `next_retry_at`, `sent_message_id`, `created_by`, `created_at`, `updated_at`.
- RLS fechada: só `service_role` escreve; `authenticated` com role `admin` pode ler seus registros.
- GRANTs corretos.

### 3. Backend — módulo Gmail (`src/lib/gmail/`)
- `gmail.server.ts`: helper `getAccessToken()` (refresh via `oauth2.googleapis.com/token`), `sendGmailMessage()` (POST `gmail.googleapis.com/gmail/v1/users/me/messages/send`), montagem RFC 2822 base64url.
- Validação: sanitiza `to/subject`, rejeita `\r\n` em headers (bloqueio de header injection), Zod schemas.
- Remetente **hardcoded** a partir de `process.env.GOOGLE_SENDER_EMAIL` — o cliente nunca envia `from`.

### 4. Server functions (`src/lib/gmail/send.functions.ts`)
Todas com `requireSupabaseAuth` + check `has_role(admin)`:
- `enqueueWorkspaceEmail({ to, subject, html, text?, idempotencyKey })` — insere na fila.
- `sendWorkspaceEmailNow(id)` — processa 1 item (usado por retry/test).
- `testWorkspaceConnection()` — só faz refresh token + `GET users/me/profile`. **Não envia e-mail.**
- `sendWorkspaceTestEmail()` — envia teste **apenas para o próprio `GOOGLE_SENDER_EMAIL`** (destino não é escolhido pelo admin).
- Rate limit em memória por processo (janela de 1s) + respeito a `429 Retry-After` e `5xx` com backoff exponencial (attempts até 5, `next_retry_at`).

### 5. Route pública para webhook interno de processamento
`src/routes/api/internal/gmail-queue-worker.ts` — processa próximos itens `queued/next_retry_at<=now()`. Chamado internamente/manual. Sem PII em logs.

### 6. UI — nova aba **Configurações → Google Workspace**
`src/routes/_authenticated.painel.google-workspace.tsx`:
- Cards informativos:
  - **Site:** `certificadodigitalccmei.online`
  - **Remetente Google Workspace:** `certificadomeidigital@seu-certificado-mei-digital.online`
- Status: mostra se os 4 secrets estão configurados.
- Botão **"Testar conexão"** → chama `testWorkspaceConnection` (não envia e-mail).
- Botão **"Enviar teste para o próprio remetente"** com `AlertDialog` de confirmação → chama `sendWorkspaceTestEmail`.
- Nada de host/porta/senha SMTP na tela.

### 7. CORS
Server functions do TanStack são same-origin — sem CORS. A route interna do worker responde apenas para origem própria; se precisar de CORS, allowlist explícita: `https://certificadodigitalccmei.online` + preview atual. **Nunca `*`.**

## O que NÃO muda
- `send.functions.ts` do Lovable Emails atual permanece funcionando.
- Aba SMTP existente permanece (cadastro informativo).
- Templates, campanhas, links, checkout: intactos.

## Detalhes técnicos
- Gmail API endpoint: `POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send` com header `Authorization: Bearer <access_token>` e body `{ raw: base64url(RFC2822) }`.
- Refresh: `POST https://oauth2.googleapis.com/token` com `grant_type=refresh_token`. Cache do access_token em memória do worker até `expires_in - 60s`.
- BCC opcional para envio agrupado (parâmetro futuro; primeira versão faz envio individual).
- Logs: só id da fila, status HTTP, código de erro do Google. Nunca token, corpo, destinatário completo em log de erro (mascarar `n***@dominio`).

## Passos manuais do Google Cloud / Workspace (listarei ao final)
1. Criar projeto no Google Cloud Console.
2. Ativar **Gmail API**.
3. Configurar OAuth consent screen (Internal, se Workspace).
4. Criar credencial OAuth 2.0 Client ID tipo **Desktop app** (ou Web + redirect).
5. Rodar fluxo OAuth uma vez com escopo `https://www.googleapis.com/auth/gmail.send` (ou `gmail.compose`) usando conta `certificadomeidigital@seu-certificado-mei-digital.online`, obter `refresh_token`.
6. Colar os 4 valores no formulário seguro que abrirei com `add_secret`.

## Ordem de execução após aprovação
1. Migration da tabela `email_send_queue`.
2. `add_secret` dos 4 segredos.
3. Módulo `gmail.server.ts` + server functions.
4. Route interna worker.
5. Página UI + entrada no menu Configurações.
6. Build/typecheck.
7. Relatório final com o que falta configurar do lado do Google.
