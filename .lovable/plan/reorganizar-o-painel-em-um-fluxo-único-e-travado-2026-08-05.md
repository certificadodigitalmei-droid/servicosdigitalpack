# Reorganizar o painel em um fluxo único e travado

## O que eu verifiquei agora no banco

- 1.357 empresas importadas e 1.362 links gerados.
- Somente 1.005 chegaram à fila de e-mail; 993 enviados, 8 na fila, 0 falhas.
- Ou seja: cerca de 357 links foram gerados sem nunca entrar na fila de envio — exatamente o "importou demais, enviou de menos".
- O agendamento na nuvem existe e roda a cada minuto (além do de PIX a cada 5 min), e o modo nuvem está ligado.

Causa: a importação e o envio são etapas independentes. A automação só pula a importação se, naquele instante exato, achou algo prioritário para enfileirar — não existe uma trava que olhe o estoque total pendente.

## O novo modelo (como vai passar a funcionar)

Um pipeline linear, com trava, sempre nesta ordem:

```text
Consulta (Casa dos Dados)  ->  Fila de novas empresas do dia
        |
        v
Importação (lote pequeno, só se o estoque pendente estiver zerado)
        |
        v
Empresas Importadas  ->  Link gerado  ->  Fila de envio  ->  E-mail enviado
```

Regra central (a trava): a importação só acontece quando **não existe nenhuma empresa importada aguardando link nem nenhum link aguardando envio**. Enquanto houver pendência, o sistema só envia. Isso impede permanentemente o descompasso atual.

### Aba por aba

**Consulta Automática**
- Consulta as empresas do dia a cada intervalo e mostra o total disponível do dia.
- Nova lista, ordenada com as mais recentes no topo, numerada, com CNPJ, nome, município/UF e horário em que apareceu.

**Importação Automática**
- Em cima: a mesma fila de candidatas (as novas primeiro).
- Embaixo: o bloco de importação, que puxa sempre do topo dessa fila, em lotes de 5.
- Indicador claro de por que não está importando agora ("aguardando envio de X e-mails pendentes").

**Empresas Importadas**
- Mostra o estado de cada empresa no pipeline: importada / com link / na fila / enviada.

**Links Gerados**
- Cada link com seu estado de envio, além dos indicadores de visita e clique já existentes.

**Envio em Massa**
- Passa a exibir a fila real de espera do banco (não o estado do navegador): quem está aguardando envio, ritmo da última hora, saldo restante da hora, próximo despacho.

**E-mails Enviados**
- Lista os envios confirmados, com filtro de período, busca e exportação.

**Dashboard**
- Cards na ordem do funil, todos vindos da mesma fonte: Disponíveis do dia -> Importadas -> Links gerados -> Na fila -> Enviados -> Acessos -> Cliques -> Checkout -> Pagos.
- Um alerta quando a diferença entre links e envios passar de zero, com a contagem exata.

### Nuvem

Tudo isso continua rodando com o navegador fechado, pelo agendamento que já existe de 1 em 1 minuto. A aba aberta só acompanha. Ritmo mantido em 100 e-mails/hora com janela deslizante.

### Recuperação do atraso atual

Antes de qualquer nova importação, o sistema vai enfileirar e enviar os ~357 links pendentes. No ritmo de 100/h, isso leva cerca de 3h30 e acontece sozinho.

## Detalhes técnicos

- Nova função de servidor `src/lib/pipeline/pipeline.functions.ts`: estado único do funil (disponíveis, importadas sem link, links sem fila, fila, enviados) — consumida por Dashboard, Links Gerados, Envio em Massa e Importação Automática.
- `src/routes/api/public/hooks/full-automation.ts`: trava de importação baseada no estoque pendente total (contagem no banco), não no resultado da chamada anterior; ordem fixa sync -> gerar links faltantes -> despachar -> importar só se pendência = 0.
- `src/lib/automation/mass-email.server.ts`: enfileirar por link pendente (LEFT JOIN em `email_send_queue` via `idempotency_key`), removendo a dependência de `email_campaign_recipients` como marcador de "já enviado".
- `src/lib/casa-dos-dados/simple-flow.server.ts`: importação em lote de 5, sempre ordenada pelas mais recentes.
- `src/lib/dashboard/overview.functions.ts` e `src/lib/emails/email-metrics.functions.ts`: unificados sobre a nova função de pipeline; cortes de dia em horário de Brasília.
- Rotas de painel atualizadas: `consulta-automatica`, `importacao-automatica`, `empresas-importadas`, `links-gerados`, `envio-massa`, `enviados`, `painel.index`.
- `src/hooks/use-realtime-sync.ts`: incluir a nova chave de consulta do pipeline.

## Fora de escopo

Nenhuma mudança de identidade visual; apenas reorganização de cards, listas e rótulos.
