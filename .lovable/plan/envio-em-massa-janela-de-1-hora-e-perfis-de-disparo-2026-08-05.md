# Envio em Massa — janela de 1 hora e perfis de disparo

Reconstruir a aba "Envio em Massa" em torno de uma janela de envio real (ancorada no 1º e-mail), com perfis de disparo pré-configurados (do mais rápido possível até o moderado 100/h) e acompanhamento claro de sucesso, erros e rate limit.

## 1. Janela de 1 hora (o coração da aba)

Hoje os contadores usam uma janela deslizante de 60 min, que nunca "zera" — por isso o painel parece confuso.

Novo comportamento:

- A janela abre no **primeiro e-mail enviado** depois de a janela anterior fechar.
- Enquanto aberta, mostra:
  - **Início da janela** (hora do 1º envio)
  - **Enviados na janela** (ex.: 37 de 100)
  - **Restam nesta janela** (ex.: 63)
  - **Zera em** — contagem regressiva ao vivo (ex.: 42:17)
- Ao completar 1 hora, o contador **zera automaticamente** e a próxima janela só abre quando sair o próximo e-mail.
- Barra de progresso da janela + aviso quando a cota da janela acaba ("aguardando abrir nova janela às 11:04").

A janela é calculada no servidor (a partir dos envios confirmados), então continua correta mesmo com o painel fechado ou com a automação em nuvem rodando.

## 2. Perfis de disparo pré-configurados

Cartão único de seleção, um clique aplica tudo:

| Perfil | Lote/janela | Ritmo |
|---|---|---|
| Turbo (máximo) | 100 | tudo de uma vez, 10 em paralelo |
| Rápido | 100 | tudo de uma vez, 5 em paralelo |
| Equilibrado | 100 | blocos de 20, pausa curta entre blocos |
| Moderado (uso normal) | 100 | 1 a cada 36s |
| Personalizado | você escolhe | você escolhe |

- O **tamanho do lote** é escolhido por você (25 / 50 / 100 / valor livre).
- No Turbo, o objetivo é esvaziar o lote da janela em segundos; se o provedor devolver HTTP 429, o sistema recua sozinho e retoma sem perder ninguém.
- Cada perfil mostra em texto simples o que vai acontecer ("100 e-mails o mais rápido possível; próxima leva às 11:04").

## 3. Acompanhamento (o que aparece)

Um único bloco de status, sem números duplicados:

- Enviados na janela / restantes / tempo até zerar
- Enviados hoje e total confirmado
- Na fila, enviando agora
- Erros definitivos, suprimidos/bounces
- Retries por rate limit (HTTP 429) e horário previsto de retomada
- Log de eventos com filtro (tudo / só erros)

## 4. Limpeza da aba

- Remover os cartões antigos e repetidos ("Cota Configurada 100/h", "Cota Efetiva", "Intervalo 36s", os três grids de MiniStat sobrepostos, o alerta indigo fixo no topo).
- Manter: barra do pipeline, **Fila Única**, perfis de disparo, status da janela, controles (Iniciar / Pausar / Parar, modo teste, destinatário de teste) e a pré-visualização do e-mail.
- Ordem final da página: título → janela de envio → perfis de disparo → fila única → controles e teste → log → pré-visualização.

## Detalhes técnicos

- `src/lib/pipeline/pipeline.server.ts`: nova função `computeSendWindow(client)` — busca o `sent_at`/`updated_at` mais antigo dos envios `sent` dentro dos últimos 60 min; esse é o início da janela. Retorna `{ windowStart, windowEnd, sentInWindow, remaining, limit, secondsToReset, open }`. Exposta por `getSendWindow` em `pipeline.functions.ts`, com refetch de 5s no painel e countdown local entre refetches.
- Perfis: acrescentar `send_profile` e `burst_concurrency` a `cloud_automation_settings` (migração), mapeados em `FlowSettings` (`sendMode`, `hourlyBatchSize`, `pacedDelaySec`, `burstConcurrency`). `updateFlowSettings` aceita os novos campos.
- `src/lib/gmail/queue.server.ts`: `processQueueInternal` passa a receber a concorrência do perfil e a respeitar o limite da janela vinda de `computeSendWindow` (em vez do cálculo próprio de última hora); em 429 registra o retry e agenda `next_retry_at` conforme `Retry-After`.
- `src/routes/api/public/hooks/full-automation.ts`: usa `computeSendWindow` para decidir quantos e-mails cabem no tick e passa `burstConcurrency`.
- `src/components/painel/FilaUnica.tsx`: `FlowSettingsCard` vira `SendProfileCard` (perfis + lote); novo `SendWindowCard`; `SendHealthCard` consolidado com contadores de 429.
- `src/routes/_authenticated.painel.envio-massa.tsx`: remoção dos blocos duplicados e remontagem na ordem acima; `envio-engine.ts` passa a ler o ritmo do perfil em vez das constantes fixas de 36s.
