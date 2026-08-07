# Saúde de envio perfeita no Motor Automático

Objetivo: o motor nunca ultrapassa o limite por hora, e quando algo sai do normal (limite do provedor, falhas, erro de credencial) ele espera sozinho até tudo voltar ao normal antes de retomar.

## O que está errado hoje (verificado no código)

- O despacho da fila (`processQueueInternal`) recebe o limite por hora mas **não o usa**: o ritmo depende só do intervalo entre envios. Com duas abas, um clique extra ou um ciclo mais rápido, dá para passar do limite da hora.
- A janela deslizante de 1 hora já é calculada (`computeSendWindow`), mas serve só para mostrar no painel — não trava o envio.
- Falhas técnicas (429/5xx) são recolocadas na fila a cada ciclo, sem teto, o que pode gerar repique em cima do provedor logo depois de um limite.
- O motor só considera "saudável" quando houve um envio; não existe uma medida objetiva de saúde (taxa de falha, itens presos, espera do provedor).

## O que será feito

### 1. Trava real do limite por hora (nunca extrapola)
Antes de cada envio, o ciclo consulta a janela deslizante de 60 minutos. Se o saldo da hora for zero, nenhum e-mail sai e o motor mostra quanto falta para liberar a próxima vaga. O limite passa a ser respeitado mesmo com várias abas abertas, porque a contagem vem do banco, não da memória do navegador.

### 2. Margem de segurança
O envio para ao atingir uma folga configurável abaixo do limite (por padrão 5%), evitando bater exatamente no teto do provedor.

### 3. Índice de saúde do envio
Um indicador único (Saudável / Atenção / Em espera) calculado a partir de:
- taxa de falhas recentes,
- itens aguardando por limite do provedor (429),
- itens presos em "enviando",
- uso da cota da hora.

Esse índice aparece no card do Motor do Fluxo com as contagens que o sustentam.

### 4. Pausa automática por saúde, não só por erro
Além do 429 e do erro de ciclo que já pausam, o motor entra em espera quando a saúde cai para "Em espera" (ex.: falhas acima do limite aceitável ou fila travada). A espera é progressiva e sempre respeita o tempo pedido pelo provedor.

### 5. Retomada só quando estiver tudo ok
Ao fim da pausa, o motor faz uma verificação de saúde antes de voltar a enviar. Se ainda não estiver saudável, ele estende a espera em vez de tentar e falhar de novo. Só volta ao ritmo normal quando o indicador estiver verde — e registra isso no log.

### 6. Reprocessamento controlado de falhas
A recuperação automática de falhas técnicas passa a ter teto por ciclo e a respeitar o tempo de espera do provedor, para não empilhar tentativas logo após um limite.

## Detalhes técnicos

- `src/lib/gmail/queue.server.ts`: `processQueueInternal` passa a checar a janela deslizante (saldo da hora com margem) antes de selecionar a linha da fila; `recoverRetryableFailures` ganha limite por ciclo e filtro por `next_retry_at`.
- `src/lib/pipeline/pipeline.server.ts`: nova função de saúde derivada de `computeSendHealth` + `computeSendWindow`, devolvendo `status` (`healthy` | `warning` | `blocked`), motivo e o tempo sugerido de espera.
- `src/lib/pipeline/tick.functions.ts`: o resultado do ciclo passa a incluir `health` (status, motivo, espera sugerida) e `quotaExhausted`.
- `src/lib/pipeline/pipeline-engine.ts`: novo motivo de pausa `unhealthy`; a checagem de saúde acontece antes de retomar e o retorno ao normal só ocorre com status saudável.
- `src/components/painel/MotorFluxo.tsx`: selo de saúde do envio com as contagens (fila, enviados na hora, aguardando limite, falhas) e o motivo da espera.

Sem mudança de banco de dados.
