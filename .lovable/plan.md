# Deixar o envio em um único modo: 1 e-mail a cada 36 s (100/h)

## O que os dados mostram agora

- Enviados por hora hoje: 86, 81, 84, 85, 91, 66 e apenas 14 na hora atual — está caindo.
- Fila: 865 aguardando, 507 enviados, 1 preso em "enviando".
- 102 itens da fila carregam código 429 (limite do provedor) com nova tentativa reagendada.
- Espaçamento real dos últimos envios: 38 s, 38 s, 38 s… e então **um buraco de 16 minutos sem nenhum envio**.

## Causa do erro

A cada execução do agendador o sistema tenta disparar **até 5 e-mails seguidos com 1,2 s entre eles**. Esse pequeno "tiro" estoura o limite do Gmail, que responde 429. Quando isso acontece, o código **pausa a fila inteira** pelo tempo que o provedor pedir (60 s ou mais) — daí os buracos de 16 minutos e o total ficar abaixo de 100/h. Ou seja: o próprio disparo em bloco é o que gera o erro que trava o envio.

Existe ainda um segundo caminho que dispara em bloco: a rotina de lembretes de PIX chama o mesmo motor pedindo 25 e-mails de uma vez.

## O que será feito

### 1. Um único modo de envio, sem blocos
- O motor passa a enviar **no máximo 1 e-mail por execução**, e só se já tiverem passado **36 segundos** desde o último envio bem-sucedido. Nada de lotes, nada de paralelismo.
- Resultado: ritmo constante de ~100 e-mails por hora, sem estourar o limite do provedor.
- O teto da janela de 1 hora continua valendo como segurança (não passa de 100 na janela).

### 2. Tratar o 429 sem parar a fila toda
- Se ainda vier um 429 isolado, apenas aquele item espera o tempo pedido pelo provedor; a fila inteira **não** é mais congelada.
- Os 102 itens hoje marcados com 429 voltam a ficar liberados para envio imediato.

### 3. Fechar os outros caminhos de disparo
- A rotina de lembretes de PIX passa a usar o mesmo envio único (1 por vez), em vez de pedir 25.
- O envio manual do painel também respeita o mesmo espaçamento.

### 4. Destravar o que está parado
- O item preso em "enviando" volta para a fila.
- Com isso, ao religar, ele envia os 865 pendentes no ritmo de 100/h antes de importar qualquer empresa nova (a trava de importação já está ativa).

## Detalhes técnicos

- `src/lib/gmail/queue.server.ts`: `MAX_PER_TICK` passa a 1; remoção do laço de lote e do `SPACING_MS`; nova checagem "último envio há ≥ `pacedDelaySec`" antes de despachar; em 429, atualizar apenas a linha afetada (remover o `update ... .in('status', ['queued','pending'])` que pausa a fila inteira).
- `src/lib/gmail/queue.server.ts`: função para limpar `next_retry_at` de itens `queued` cujo último erro foi 429.
- `src/routes/api/public/hooks/full-automation.ts`: chamada continua igual, passando o limite por hora vindo das configurações.
- `src/routes/api/public/hooks/pix-reminders.ts`: `processQueueInternal(25)` → `processQueueInternal()`.
- `src/lib/gmail/send.functions.ts`: `maxBatch` limitado a 1.
- Ajuste de dados: item em `sending` devolvido para `queued`; `next_retry_at` dos 429 zerado.
- É preciso **publicar** depois, porque o agendador da nuvem chama a versão publicada.
