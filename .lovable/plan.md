# Pausa e retomada automática no Motor do fluxo (Envio em Massa)

Quando o motor automático estiver ligado na aba "Envio em Massa", ele passa a tratar sozinho os erros de envio: detecta limite de e-mail (429), falha de autenticação/servidor ou erro no ciclo, entra em pausa pelo tempo necessário e volta a enviar sozinho quando tudo normalizar. Nada disso acontece com o motor desligado — só liga/pausa/retoma enquanto você tiver ativado.

## Comportamento

- **Limite de envio (429 / rate limit):** o motor mostra "pausado por limite" e espera o tempo indicado pelo provedor (mínimo 60s). Se o limite se repetir várias vezes na mesma hora, a espera cresce progressivamente (até 60 min).
- **Erro no ciclo (falha de rede, servidor, banco):** espera com recuo progressivo (1, 2, 4, 8... min, teto de 30 min) e tenta de novo sozinho. Ao primeiro ciclo bem-sucedido, volta ao ritmo normal.
- **Falhas de envio repetidas:** se vários e-mails seguidos falharem (ex.: problema de credencial de envio), pausa por 15 min e tenta novamente, sem desligar o motor.
- **Retomada:** automática, assim que o tempo de espera termina. Nenhum clique necessário.
- **Parar:** o botão "Parar" continua encerrando tudo imediatamente, inclusive uma pausa em andamento.

## O que muda na tela

No card "Motor do fluxo":
- Estado passa a mostrar, quando pausado: motivo (limite de e-mail / erro no ciclo / falhas seguidas) e a contagem regressiva para retomar.
- Log registra: "pausado por limite — retomando em X min" e "retomado automaticamente".
- Um selo amarelo "em espera" enquanto pausado (hoje só existe verde "ativo" e cinza parado).

## Detalhes técnicos

1. `src/lib/gmail/queue.server.ts` já devolve `rateLimited` e `retryAfterSec` de `processQueueInternal`; hoje o tick descarta isso.
2. `src/lib/pipeline/tick.functions.ts`: incluir `rateLimited: boolean` e `retryAfterSec: number` no `PipelineTickResult` (propagados do resultado da fila) e, no bloco `catch`, marcar o erro como recuperável.
3. `src/lib/pipeline/pipeline-engine.ts`:
   - Novos campos no `pipelineStore`: `pausedUntil: string | null`, `pauseReason: 'rate_limit' | 'cycle_error' | 'send_failures' | null`, `consecutiveErrors`, `consecutiveFailures`, `rateLimitHits`.
   - No `tick()`: se `pausedUntil` no futuro, apenas atualiza o `stage` com a contagem e retorna sem chamar o servidor.
   - Se `r.rateLimited`: define `pausedUntil = agora + max(retryAfterSec, 60s)`, escalando conforme `rateLimitHits` na hora (60s → 5min → 15min → 60min).
   - Se `!r.ok` ou exceção: `consecutiveErrors++` e `pausedUntil = agora + min(2^n minutos, 30min)`.
   - Se `r.failed > 0 && r.sent === 0` em 3 ciclos seguidos: pausa de 15 min com motivo `send_failures`.
   - Qualquer ciclo com sucesso zera os contadores e limpa `pausedUntil` ("retomado automaticamente").
   - `stopPipelineEngine()` limpa `pausedUntil`/motivo.
4. `src/components/painel/MotorFluxo.tsx`: badge "em espera" + linha de status com motivo e contagem regressiva, lendo os novos campos do store.

Sem mudanças de banco de dados e sem alterar o comportamento do motor desligado.
