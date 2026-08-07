# Motor do fluxo: destravar os envios e continuar rodando entre abas

## O que eu verifiquei no banco agora

- 100 empresas importadas, 100 links gerados, **fila de e-mail totalmente vazia** (0 na fila, 0 enviados, 0 falhas).
- Entre as 100 empresas há **94 e-mails distintos** — ou seja, 6 endereços repetidos.
- Existe um índice único que impede dois e-mails de campanha para o mesmo endereço.

Causa confirmada: o lote inteiro é inserido na fila de uma vez só. Como havia e-mails repetidos, o banco recusou **a inserção inteira** (os 100), e o código apenas registra o erro em silêncio e devolve "0 enfileirados". Sem nada na fila, não há o que enviar; e como sobrou "link sem envio", a trava de importação bloqueia o próximo lote. Resultado: importou 100 e parou.

Segundo problema: o motor é desligado de propósito ao sair da aba "Envio em massa" (há um comando de parada no desmonte do componente) e o estado "ligado" não é guardado. Por isso ele aparece desativado quando você volta.

## O que vou fazer

1. **Enfileirar sem quebrar o lote**
   - Inserir na fila em pedaços pequenos e, no caso de conflito, item por item, para que um endereço repetido não derrube os outros 99.
   - E-mails repetidos dentro do mesmo lote passam a ser marcados como "suprimido — e-mail duplicado", liberando a trava do fluxo em vez de travar tudo.
   - Falha ao enfileirar deixa de ser silenciosa: vira erro visível no ciclo e no log do motor.

2. **Destravar o lote atual já existente**
   - No próximo ciclo, as 100 empresas com link e sem fila são enfileiradas normalmente (as duplicadas ficam suprimidas), e o envio começa no ritmo configurado.

3. **Motor continua ligado ao trocar de aba**
   - Guardar o estado "ligado" (junto com o tamanho do lote) para sobreviver à navegação e ao recarregar a página.
   - Remover a parada automática ao sair da aba de envio.
   - Passar o motor para o layout do painel (onde já ficam os painéis flutuantes), de modo que ele siga rodando em Dashboard, Empresas, etc. A trava no banco continua impedindo dois ciclos simultâneos em abas diferentes.
   - Indicador de motor ativo visível em qualquer aba do painel.

4. **Sempre as empresas mais recentes**
   - Manter a ordenação "mais novas primeiro" e, quando a consulta do dia não trouxer nenhuma empresa nova, recuar automaticamente para os dias anteriores (até 7 dias) em vez de ficar parado em "sem empresas novas".

## Detalhes técnicos

- `src/lib/automation/mass-email.server.ts`: `syncMassEmailQueue` passa a inserir em blocos com fallback individual, deduplicar e-mails do lote (marcando `suppressed`) e propagar erro.
- `src/lib/pipeline/tick.functions.ts`: checar `sync.ok` e refletir a falha em `stage`/`error` do ciclo.
- `src/lib/pipeline/pipeline-engine.ts`: `persistKeys` inclui `running`; função de retomada automática do motor na inicialização.
- `src/components/painel/MotorFluxo.tsx`: remover `stopPipelineEngine` do desmonte.
- `src/components/painel/GlobalFloatingPanels.tsx` (ou o layout `_authenticated.painel.tsx`): montar o motor globalmente e mostrar um selo de "motor ativo".
- `src/lib/casa-dos-dados/simple-flow.server.ts` / chamada em `tick.functions.ts`: retroceder a data quando o dia atual não tiver CNPJ novo.
