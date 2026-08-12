# Piloto automático de campanhas de WhatsApp

Objetivo: em vez de um disparo grande, a aba **WhatsApp em Massa** passa a rodar lotes pequenos
em sequência, sozinha: envia N empresas com intervalos irregulares, descansa X minutos, cria a
próxima campanha e continua — sempre respeitando o teto de 250 envios por 24 h da Meta.

## 1. Piloto automático (lotes encadeados)

Novo bloco no topo da aba, com liga/desliga e estes ajustes:

- Empresas por campanha (ex.: 20)
- Descanso entre campanhas (ex.: 25 min)
- Ritmo: intervalo mínimo e máximo entre mensagens (ex.: 40 s a 110 s) — cada mensagem sorteia
  um tempo diferente dentro dessa faixa, nada de cadência robótica
- Teto de 24 h (padrão 250) e janela de horário permitido (ex.: 08:00–20:00)
- Modelo aprovado e remetente usados nos lotes

Comportamento: ao terminar um lote, a campanha é encerrada, o sistema espera o descanso e cria
automaticamente a próxima com o mesmo nome-base + sequência (ex.: "Auto 12/08 · lote 3").
Se o teto de 24 h for atingido, ele apenas aguarda a janela liberar e retoma sozinho.
Isso roda no servidor, com o painel fechado (mesmo cron que já existe).

## 2. Empresas sempre as mais recentes do dia

Cada novo lote abastece a fila puxando as empresas mais recentes da Consulta Automática do dia
atual (celular brasileiro válido + link ativo). Nada de empresas de outros dias. Se não houver
empresas suficientes, o lote sai menor e o piloto continua esperando novas chegarem.

## 3. Filtro de período na aba

Barra "Período: Hoje, Ontem, 7 dias, 15 dias, 30 dias, Tudo, Personalizado" no topo da aba,
aplicada aos cards e à lista de campanhas: envios, entregues, lidas, rejeitadas e número de
campanhas do período escolhido. O card de 24 h continua fixo, pois é o que controla o teto.

## 4. Limpeza da fila atual

Botão para esvaziar a fila de prontidão (as 31 empresas atuais), removendo as reservas sem
tocar em vendas pagas. O piloto reabastece com empresas novas do dia.

## Detalhes técnicos

- Migração: tabela `whatsapp_autopilot_settings` (enabled, batch_size, rest_minutes,
  min_interval_seconds, max_interval_seconds, daily_cap, window_start, window_end,
  template_name, sender_phone_number_id, last_batch_at, next_batch_at, sequence, last_error)
  com GRANTs + RLS para `authenticated`/`service_role`; e colunas
  `min_interval_seconds` / `max_interval_seconds` em `whatsapp_campaigns`.
- `src/lib/whatsapp/campaign-logic.ts`: `pickJitterInterval(min,max,rand)` e
  `shouldStartNextBatch({ enabled, lastFinishedAt, restMinutes, sent24, dailyCap, now, window })`
  — funções puras, cobertas por testes.
- `src/lib/whatsapp/campaign.server.ts`: `runCampaignTick` passa a usar o intervalo sorteado ao
  gravar `next_send_at`; novo `runAutopilot()` que, após o tick das campanhas, encerra lotes
  concluídos, respeita o descanso/janela/teto e cria o próximo lote via
  `fillCampaignQueueToTarget` + `startCampaignChecked`, com refil vindo da consulta do dia.
- `src/routes/api/public/hooks/whatsapp-campaign-tick.ts`: chama `runAutopilot()` depois de
  `runAllRunningCampaigns()`.
- Novas server functions em `src/lib/whatsapp/campaigns.functions.ts`:
  `getWaAutopilot`, `saveWaAutopilot`, `clearWaReadyQueue`, e `getWaCampaignDashboard` aceitando
  `{ from, to }` para o filtro de período.
- UI: `src/routes/_authenticated.painel.whatsapp-massa.tsx` ganha o cartão do piloto automático e
  o `DateRangeFilter` já existente em `src/components/painel/DateRangeFilter.tsx`;
  `WhatsappReadyPanel.tsx` ganha o botão de esvaziar fila.
- Nada é enviado durante a implementação: sem tick manual, sem chamada à Chakra, sem publicar.
