# Corrigir o envio (100/h) e travar a importação por lote

## O que os dados mostram agora

- Envios por hora hoje: 86, 81, 84, 85, 91 — sempre abaixo dos 100 da janela.
- Fila: 776 aguardando, 479 enviados, 1 travado em "enviando".
- Empresas importadas por hora hoje: 328, 65, 112, 300, 173 — muito acima do ritmo de envio.
- Configuração atual no banco: perfil "moderado", 1 e-mail a cada 36 s, 100 por hora, lote de importação 100.

## Causas identificadas

1. **Nunca chega a 100/h.** O fluxo da nuvem manda um número fixo por execução (60 ÷ 36 = ~2 e-mails por minuto). Se uma execução do agendador falha, atrasa ou demora (cada execução varre todas as tabelas antes de enviar), aquele e-mail é perdido para sempre — não existe recuperação do atraso. Daí o resultado ficar em 84–91 em vez de 100.
2. **Importa muito mais do que envia.** Existe um segundo endpoint de importação (`auto-import-mei`) que roda sozinho e **não respeita a trava do pipeline**. Enquanto o fluxo principal só importa com a fila zerada, esse outro importa continuamente — foi ele que gerou 965 links com 761 ainda na fila.
3. **Excesso de modos de envio.** Turbo / Rápido / Equilibrado / rajada continuam no código e na tela, atrapalhando e podendo voltar a causar 429.

## O que será feito

### 1. Envio: bater exatamente 100 por hora
- O despacho passa a ser **por saldo da janela deslizante**, não por número fixo: a cada execução o sistema calcula quantos e-mails saíram nos últimos 60 minutos e envia o que faltar para completar o ritmo, com no máximo um pequeno bloco por execução (espaçamento de ~1 s entre eles).
- Assim, se uma execução falhar, a seguinte recupera o atraso automaticamente, sem nunca ultrapassar 100 na janela de 1 hora.
- O item preso em "enviando" volta para a fila (itens presos há mais de 10 minutos são liberados automaticamente).

### 2. Um único modo de envio
- Remover Turbo, Rápido, Equilibrado, o modo rajada e a concorrência paralela — do motor, das configurações e da aba **Envio em Massa**.
- Fica apenas: **100 e-mails por hora, 1 a cada 36 segundos**, com o lote por hora ainda ajustável (padrão 100).
- A aba mostra: janela de 1 hora (usado / restante / tempo para liberar), enviados, fila, falhas reais e 429.

### 3. Importar só depois de enviar o lote
- **Desativar o endpoint `auto-import-mei`** (passa a responder "desativado"), eliminando a importação paralela sem trava.
- A importação passa a ser feita **exclusivamente** pelo fluxo único, obedecendo a regra: só importa quando **não há empresa sem link, nem link sem fila, nem e-mail na fila**.
- Importa então **um lote de 100**, gera os links, envia os 100 e só depois busca as próximas 100.

### 4. Retomada correta ao religar
- Ao reativar a nuvem, com 761 pendentes na fila, ele enviará todos esses primeiro (100 por hora) e **não importará nenhuma empresa nova** até a fila zerar.

## Detalhes técnicos

- `src/lib/gmail/queue.server.ts`: despacho baseado em saldo (`limit − enviados na última hora`), teto por execução, remoção do caminho `burst`/`concurrency`, liberação de itens presos em `sending`.
- `src/lib/pipeline/pipeline.server.ts`: `FlowSettings` reduzido (sem `sendMode`, `sendProfile`, `burstConcurrency`); presets removidos; padrão 100/h e 36 s.
- `src/routes/api/public/hooks/full-automation.ts`: chamada de despacho simplificada; a trava de importação continua sendo a única porta de entrada de novas empresas.
- `src/routes/api/public/hooks/auto-import-mei.ts`: desativado (retorna 200 com `{ disabled: true }`), para não quebrar o agendamento existente.
- `src/routes/_authenticated.painel.envio-massa.tsx` e `src/components/painel/FilaUnica.tsx`: remoção dos cartões de perfil/modo, mantendo janela, contadores e fila única.
- Ajuste de dados: item travado em `sending` devolvido para `queued`.
- É necessário **publicar** depois, porque o agendador chama a versão publicada.
