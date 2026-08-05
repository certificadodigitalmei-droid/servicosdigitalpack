# Sincronizar envios, métricas e modo nuvem

## O que está errado hoje (verificado no projeto e no banco)

1. **A aba "E-mails Enviados" e o Dashboard leem fontes diferentes.**
   A aba de enviados mostra apenas o que está guardado no navegador (estado local do motor de envio), enquanto o Dashboard e a aba "Links Gerados" contam registros reais da fila do banco. Por isso os números nunca batem (419 x 411) e, se você abrir em outro dispositivo, a aba de enviados aparece quase vazia.

2. **A contagem de "hoje" usa meia-noite UTC, não horário de Brasília.**
   Isso desloca o corte do dia em 3 horas: envios entre 21h e 00h caem no "dia seguinte".

3. **A contagem usa a data de criação do registro, não a data do envio.**
   Um e-mail enfileirado ontem e enviado hoje conta no dia errado.

4. **O card "Fila" do Dashboard sempre mostra 0.**
   Ele procura registros com situação "pending", mas a fila real grava "queued". No banco existem hoje 747 enviados, 5 na fila e 2 suprimidos.

5. **O modo nuvem não roda de fato.**
   Existe o endpoint de automação completa, mas **não existe nenhum agendamento chamando ele** — o único agendamento ativo é o de lembretes de PIX (a cada 5 min). Com a aba fechada, nada é importado nem enviado. Além disso, cada chamada do endpoint despacha só 4 e-mails e não respeita um teto por hora.

## O que será feito

### 1. Fonte única de verdade para métricas de e-mail
- Todas as telas (Dashboard, Links Gerados, E-mails Enviados) passam a ler da fila real do banco, por meio de uma única função de servidor compartilhada.
- A aba "E-mails Enviados" deixa de depender do navegador: passa a listar os envios reais, com filtro de período, busca e exportação — funcionando em qualquer dispositivo.
- Contagens padronizadas: dia/período em horário de Brasília e baseados na data de envio confirmado.
- Correção do card de fila (situações corretas: fila, enviados, falhas, suprimidos).

### 2. Ritmo garantido de 100 e-mails por hora
- O despacho passa a calcular quantos e-mails já saíram na última hora e libera apenas o saldo restante até 100.
- O agendamento na nuvem roda a cada minuto, despachando em pequenas levas — resultado: distribuição uniforme, sem estouro e sem ficar abaixo do alvo.
- O painel mostra: enviados na última hora, saldo restante da hora, ritmo médio, próximo despacho e falhas.

### 3. Modo nuvem realmente automático
- Criação do agendamento no servidor chamando o endpoint de automação completa a cada minuto.
- Um interruptor global (Nuvem: Ativo/Off) passa a ser respeitado pelo endpoint: desligado, ele não importa nem envia.
- Fluxo mantido conforme já definido: importar lote de 5 → enviar → quando a fila cair para 1–2, importar mais 5.
- Tudo funciona com o navegador fechado; a aba aberta apenas acompanha.

### 4. Organização e sincronização do painel
- Atualização em tempo real já existente estendida às telas de envio, para os números mudarem sozinhos sem recarregar.
- Rótulos padronizados entre abas ("enviados no período" significa a mesma coisa em todos os lugares).

## Detalhes técnicos

- Nova função de servidor `src/lib/emails/email-metrics.functions.ts` (contagens agregadas sobre `email_send_queue`, cortes em `America/Sao_Paulo`, baseadas em `updated_at` para itens `sent`).
- `src/lib/dashboard/overview.functions.ts`: substituir `startOfDayISO` UTC pelo corte BRT, trocar `created_at` por data de envio nos contadores de envio e corrigir `status: 'pending'` → `'queued'`.
- `src/routes/_authenticated.painel.enviados.tsx`: trocar `envioStore.sentEmails` por consulta ao servidor (TanStack Query).
- `src/routes/_authenticated.painel.links-gerados.tsx`: usar a mesma função de métricas.
- `src/lib/gmail/queue.server.ts`: `processQueueInternal` passa a receber o teto horário e calcular o saldo da hora antes de despachar.
- `src/routes/api/public/hooks/full-automation.ts`: checar o interruptor global antes de executar e usar o novo cálculo de saldo.
- Novo agendamento (`cron`) de 1 em 1 minuto para `/api/public/hooks/full-automation`, criado via ferramenta de dados (não em migração), pois contém chave.
- `src/hooks/use-realtime-sync.ts`: já escuta `email_send_queue`; ligar as novas chaves de consulta.

## Fora de escopo
Nenhuma mudança visual de layout além dos rótulos e novos indicadores citados.
