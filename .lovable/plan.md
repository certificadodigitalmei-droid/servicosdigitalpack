# Fase 1 — Consulta Automática (Casa dos Dados) + Auth real

## Objetivo

Substituir a senha `117711` por autenticação real com Supabase Auth + role `admin`, e entregar a funcionalidade **Consulta Automática** ligada à API oficial da Casa dos Dados, rodando em background via server route interna acionada por `pg_cron`. Sem atalhos de segurança, sem inventar endpoints.

## O que será entregue

### 1. Autenticação real (substitui 117711)
- Migration cria enum `app_role` (`admin`, `user`), tabela `user_roles` (RLS, policies via `has_role`), função `public.has_role(_user_id, _role)` SECURITY DEFINER com search_path fixo.
- Rota pública `/auth` com formulário e-mail + senha (sign in + sign up desabilitado por padrão — só admin existente pode entrar; sign up fica atrás de flag).
- Layout `_authenticated/route.tsx` (integração-gerenciado, `ssr: false`) já existe → substitui o gate atual por `supabase.auth.getUser()` + redirect `/auth`.
- Novo layout aninhado `_authenticated/_admin.tsx` que valida `has_role(uid,'admin')` via server fn `requireAdmin`; redireciona não-admin para `/`.
- Painel inteiro (`/painel/*`) move-se para `_authenticated/_admin/painel.*` para exigir role admin.
- Header do painel mostra e-mail do usuário e botão “Sair” (`supabase.auth.signOut` + cache teardown + navigate `/auth`).
- Remoção completa: constante `PANEL_PASSWORD`, `STORAGE_KEY`, leitura/escrita `localStorage.panel_auth_v1`, formulário de senha estática.

### 2. Casa dos Dados — backend
- Secrets solicitados: `CASA_DOS_DADOS_API_KEY`, `CASA_DOS_DADOS_API_BASE_URL` (default `https://api.casadosdados.com.br`), `CASA_DOS_DADOS_CRON_SECRET` (gerado), `PUBLIC_APP_URL` (definido).
- Client server-only em `src/lib/casa-dos-dados/client.server.ts`: envia header `api-key`, base URL configurável, timeout, tratamento 401/403/429.
- Endpoints oficiais usados:
  - `POST /v5/cnpj/pesquisa` — pesquisa avançada (modo "empresas abertas hoje" com `data_abertura.inicio/fim` no fuso `America/Sao_Paulo`).
  - `GET /v4/dashboard/cnpj/empresas-abertas/hoje` — botão “Consultar quantidade de hoje”.
  - `GET /v4/cnpj/{cnpj}` — apenas quando explicitamente pedido (não automático nesta fase).
  - `GET /v5/saldo` — apenas botão “Testar API” (sem gating de saldo nesta fase).

### 3. Tabelas novas
- `automatic_company_queries` — configuração da automação (uma por admin nesta fase, mas schema já suporta várias).
- `automatic_company_query_runs` — histórico de cada execução.
- `automatic_company_queue` — fila diária com `UNIQUE (automation_id, query_date, cnpj)`.
- Todas com RLS: `SELECT/INSERT/UPDATE/DELETE` gated por `has_role(auth.uid(),'admin')`. Nada de `USING (true)`. Grants para `authenticated` + `service_role`; sem grant `anon`.

### 4. Server route interna
- `POST /api/internal/casa-dos-dados-worker` (não `/api/public/*`).
- Exige header `x-cron-secret` == `CASA_DOS_DADOS_CRON_SECRET` (comparação timing-safe). Sem secret → 401 e nada é executado.
- Fluxo:
  1. `SELECT ... FOR UPDATE SKIP LOCKED` (via RPC SECURITY DEFINER) para pegar automações `enabled = true AND next_run_at <= now() AND status != 'running'`.
  2. Marca `status='running'`.
  3. Consulta Casa dos Dados com filtros salvos.
  4. Dedupe por CNPJ (checa `companies` + `automatic_company_queue`).
  5. Insere/atualiza `companies`; para novas ou sem link ativo, gera token cripto (`crypto.randomUUID`), cria `link_generations` + `company_links`, monta `LINK_PUBLICO = ${PUBLIC_APP_URL}/c/{token}` e `LINK_CHECKOUT = ${PUBLIC_APP_URL}/checkout/{token}`.
  6. Reutiliza link ativo existente quando já houver.
  7. Grava contagens no run e no queue.
  8. `finally`: atualiza `last_run_at`, `next_run_at = last_run_at + interval_minutes`, `status='active'` (ou `'error'` com `last_error`).
- Registra `skipped_concurrent_run` no run quando lock falhar.

### 5. pg_cron
- Extensões `pg_cron` + `pg_net` habilitadas.
- Job `casa-dos-dados-dispatch` a cada minuto: `net.http_post` para `https://project--{id}.lovable.app/api/internal/casa-dos-dados-worker` com header `x-cron-secret`. O cron só dispara — a decisão de bater na Casa dos Dados fica no worker.

### 6. UI `/painel/consulta-automatica`
- Aba nova acima de “Filtrar Empresas MEI” no sidebar.
- Cards: **Status**, **Última execução**, **Fila do dia**, **Histórico**.
- Formulário de configuração: modo (padrão “Empresas abertas hoje — RECOMENDADO”), quantidade por execução (1/5/10/20/50/100/500/Todas/Personalizada com `maximum_all_results_per_run` = 1000 default), filtros mínimos (somente MEI = Sim, situação ATIVA, somente matriz = Sim, com e-mail = Sim).
- Botões: **Ativar automação**, **Desativar automação**, **Executar agora** (chama a server fn com role admin, mesma lógica do worker), **Testar API** (chama `/v5/saldo` sanitizado), **Consultar quantidade de hoje**, **Salvar configurações**.
- Primeiro teste real: quantidade fixa em **1** e um botão explícito “Rodar teste com 1 empresa”.

### 7. Preservado
- `companies`, `link_generations`, `company_links`, páginas `/c/$token`, `/checkout/$token`, importador de planilha, gerador manual de links, campanhas de e-mail — nada alterado além do necessário para roteamento admin.

## Detalhes técnicos

### Arquivos

Criados:
- `src/routes/auth.tsx` — login e-mail/senha.
- `src/routes/_authenticated/_admin.tsx` — gate admin.
- `src/routes/_authenticated/_admin.painel.consulta-automatica.tsx` — UI.
- `src/lib/casa-dos-dados/client.server.ts` — client HTTP com `api-key`.
- `src/lib/casa-dos-dados/worker.server.ts` — lógica de execução (dedupe, links, run tracking).
- `src/lib/casa-dos-dados/automation.functions.ts` — server fns (ativar/desativar/executar/testar/consultar-saldo/consultar-hoje/listar histórico) todas com `requireSupabaseAuth` + check `has_role`.
- `src/routes/api/internal/casa-dos-dados-worker.ts` — server route com `x-cron-secret`.
- Migration única com: enum, `user_roles`, `has_role`, três tabelas de automação, RPC de lock, RLS/grants, extensões `pg_cron`/`pg_net`.

Movidos (renomeados para exigir admin):
- `src/routes/_authenticated.painel.*` → `src/routes/_authenticated/_admin.painel.*` (todas as 6 rotas do painel).
- `src/routes/_authenticated.tsx` → substituído pelo layout gerenciado da integração (deleta password gate).

Não tocados: `checkout*`, `c.$token`, `certificado-mei.$token`, `index`, `login` (renomeio se conflitar), páginas legais, `SiteChrome`.

### RLS crítica

```sql
create policy "admin manage automations" on public.automatic_company_queries
  for all to authenticated
  using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));
```
Mesma forma para as outras duas tabelas. `user_roles` com policy de leitura própria + admin gerencia.

### Trava anti-concorrência
RPC SECURITY DEFINER retornando `automation_id` com `SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1` + `UPDATE ... SET status='running'` na mesma transação. Sem lock adquirido → retorna null → worker responde 200 sem trabalho.

### Cron
```sql
select cron.schedule(
  'casa-dos-dados-dispatch',
  '* * * * *',
  $$ select net.http_post(
       url:='https://project--59d22abc-af86-4ff1-bb47-5435d899aa25.lovable.app/api/internal/casa-dos-dados-worker',
       headers:=jsonb_build_object('content-type','application/json','x-cron-secret', current_setting('app.cron_secret', true)),
       body:='{}'::jsonb
     ) $$
);
```
O `x-cron-secret` será colocado via `insert` após o secret ser gerado (o valor bruto não pode ser lido depois, então setamos `alter database ... set app.cron_secret = '...'` numa `supabase--insert` que o usuário aprova).

### Fora de escopo (Fase 2)
Webhook Casa dos Dados; filtros avançados (UF/município/CNAE/etc.); gating por saldo; execução acima do limite de segurança; consulta individual `/v4/cnpj/{cnpj}` automática; múltiplos admins simultâneos; exportação de lote; testes automatizados das 20 condições listadas.

## Testes que executarei ao final

1. `Testar API` → mostra status HTTP retornado por `/v5/saldo`.
2. `Consultar quantidade de hoje` → mostra número retornado.
3. `Rodar teste com 1 empresa` → uma execução real com `quantity_per_run=1`, mostrando: run id, `api_total`, empresa importada (CNPJ, nome), token gerado, `LINK_PUBLICO`, `LINK_CHECKOUT`, saldo antes/depois.
4. Segunda execução imediata → confirma dedupe (0 novas, 1 duplicada).
5. Dispatcher pg_cron → uma passada real (aciono via `select cron.schedule` de teste ou chamada direta com secret).

## Configuração manual necessária depois

- Você preenche os secrets `CASA_DOS_DADOS_API_KEY` e (se quiser sobrescrever) `CASA_DOS_DADOS_API_BASE_URL`. `CASA_DOS_DADOS_CRON_SECRET` e `PUBLIC_APP_URL` eu configuro automaticamente.
- Criar o primeiro admin: no Supabase Auth criar o usuário (email/senha), depois rodar via SQL (te passo o comando pronto) `insert into public.user_roles(user_id, role) values ('<uuid>', 'admin')`.

## Se aprovar

Executo nesta ordem: migration → secrets → arquivos → cron → subo os testes reais e colo os resultados no chat. Sem afirmar “funciona” sem output real.
