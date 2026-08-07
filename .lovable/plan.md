# Fluxo sincronizado: Consulta → Importação → Links → Envio

Hoje existem dois motores rodando ao mesmo tempo (o do navegador e o da nuvem), cada um com sua própria contagem. Por isso a importação passa na frente do envio e os números do painel não batem. A proposta é ter **um único motor, manual, controlado por você no painel**: você entra no site, aperta "Iniciar", ele roda sozinho até você apertar "Parar".

## Como vai funcionar

Ritmo escolhido: **lote por hora**.

```text
[LOTE]  importa X empresas  ->  gera X links  ->  enfileira X e-mails
           ->  envia os X, espaçados dentro da hora
           ->  lote fechado  ->  só então importa o próximo lote
```

Regras da trava:

- Nunca importa um novo lote enquanto sobrar qualquer item do lote atual (empresa sem link, link sem fila, e-mail na fila).
- O tamanho do lote é o mesmo número do limite por hora (você escolhe: 100, 200, 500...). Importar e enviar usam **o mesmo número**, então é impossível importar mais do que se envia.
- Espaçamento automático = 3600 s ÷ tamanho do lote (ex.: 100/h → 1 e-mail a cada 36 s).
- Se a cota da hora acabar antes de o lote terminar, o motor espera abrir slot; não importa nada nesse meio-tempo.
- Empresa sem e-mail válido é marcada como suprimida na hora, para não travar o lote.

## Painel (uma única tela de controle)

Na aba **Envio em Massa**, um painel "Motor do fluxo" com:

- Botão único **Iniciar / Parar** (fica ligado enquanto a aba estiver aberta).
- Campo do tamanho do lote por hora + atalhos (100 / 200 / 500).
- Quatro contadores do lote atual, na ordem real: Consulta → Importadas → Links → Enviados, com barra de progresso do lote.
- Linha de status ao vivo: "enviando 37/100 — próximo em 22 s" ou "lote completo, importando próximo lote".
- Aviso claro quando o motor está parado ou quando a aba for fechada (o fluxo pausa; ao reabrir e apertar Iniciar, ele continua de onde parou, porque o estado real fica no banco).

As abas Consulta Automática e Importação Automática deixam de ter loops próprios de automação: viram consulta/importação manual pontual e leitura do mesmo estado, sem concorrer com o motor.

## Detalhes técnicos

- Nova função de servidor `runPipelineTick` (`src/lib/pipeline/tick.functions.ts`, protegida por auth) que executa, em ordem e em uma só chamada: `ensureLinksForImported` → `syncMassEmailQueue` → `processQueueInternal` → (se `importacaoLiberada`) `runImportBatch` com `limit = hourlyBatchSize`. Retorna o estado consolidado do lote.
- Trava de concorrência: coluna/registro de lock em `cloud_automation_settings` (`lock_token` + `heartbeat_at`) para que dois ticks nunca rodem em paralelo, mesmo com duas abas abertas.
- `computePipelineState` passa a usar `count: 'exact', head: true` em vez de ler todas as linhas com paginação (hoje lê tabelas inteiras a cada tick — fica lento conforme a base cresce).
- Um único loop no cliente (`pipeline-engine.ts`) chamando `runPipelineTick` a cada ~5 s, substituindo `restartImportLoop` do `consulta-engine.ts` e os loops do `envio-engine.ts`.
- `pacedDelaySec` passa a ser derivado de `hourlyBatchSize` (3600/N) em vez de configurado à parte, eliminando a combinação incoerente entre importar e enviar.
- Cron/nuvem: o endpoint `api/public/hooks/full-automation` fica desativado (retorna `skipped: manual_mode`) e o job agendado é removido, conforme sua escolha de rodar só manualmente.

## Fora do escopo

Não muda template de e-mail, gateways de pagamento, pop-ups nem as telas públicas.
