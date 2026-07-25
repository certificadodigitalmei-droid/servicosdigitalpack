# Painel Geral Sincronizado

Objetivo: um Dashboard mestre em `/painel` mostrando o estado de TODOS os módulos ao vivo, e cada aba lateral reformulada para exibir dados completos do seu módulo — tudo sincronizado via Supabase Realtime.

## 1. Dashboard mestre (`/painel/index`)

Página única com 6 blocos, cada um com KPIs + mini-tabela viva:

```text
┌─────────────────────────────────────────────────────────┐
│  STATUS GERAL (bolinhas verde/vermelho + últimos 60s)   │
│  Importação • Envio • Antenas • Gateway PIX • Casa Dados│
├──────────────────────┬──────────────────────────────────┤
│ IMPORTAÇÃO           │ ENVIO                            │
│ Fila pronta / meta   │ Enviados hoje / limite           │
│ Última empresa +hora │ Perfil ativo • Restante hora     │
│ Casa Dados: saldo    │ Falhas 24h • Próximo disparo     │
├──────────────────────┼──────────────────────────────────┤
│ LINKS                │ PAGAMENTOS                       │
│ Gerados hoje/total   │ PIX gerados / Pagos hoje         │
│ Cliques emitir/guia  │ Ticket médio • Conversão %       │
│ Copy PIX / Acessos   │ Últimos 5 pagos (nome, valor)    │
├──────────────────────┼──────────────────────────────────┤
│ ANTENAS              │ AUTOMAÇÃO                        │
│ N antenas online     │ Rodando / pausadas               │
│ Jobs reservados/fila │ Última execução • Erros          │
│ Envios por antena    │ Próximo ciclo em Xs              │
└──────────────────────┴──────────────────────────────────┘
```

Cada bloco tem link "ver tudo" para a aba correspondente.

## 2. Sincronia (Supabase Realtime)

Um único hook `useRealtimeSync()` monta canais em `postgres_changes` para:
`orders`, `company_links`, `link_events`, `email_send_queue`,
`automatic_company_query_runs`, `satellite_jobs`, `email_workers`,
`companies` (INSERT), `payment_gateways`.

Cada mudança invalida a query TanStack correspondente
(`queryClient.invalidateQueries({ queryKey: [...] })`). Fallback: refetch
a cada 15s se o socket cair.

Migração ativa realtime nas tabelas listadas.

## 3. Reformulação por aba (mantém rotas atuais)

Cada aba passa a mostrar 3 seções fixas: **KPIs do módulo**, **Ao vivo** (últimos 20 eventos), **Ações/config**. Vou padronizar um layout com `<ModulePage title kpis liveFeed>`.

- `painel/index` — Dashboard mestre novo (item 1)
- `consulta-automatica` — saldo Casa Dados formatado, ciclos, últimas empresas puxadas, erros
- `importacao-automatica` — fila pronta ao vivo, buffer, últimas importações
- `envio-massa` — perfil, contador hora/dia, próximas 20 na fila, últimas 20 enviadas
- `monitor-envio` — já é painel externo, garanto realtime igual
- `links-gerados` — já reformulado; adiciono canal realtime para eventos
- `pagamentos` — realtime de `orders`, filtro por gateway, últimos 20 pagos
- `satelites` — heartbeat/última atividade por antena, jobs pendentes por antena
- `campanhas-email` / `enviados` — status live de `email_send_queue`
- `configuracoes-pagamento`, `precos`, `pop-up-site`, `exibicao-site`, `modelo-mensagem`, `api-casa-dos-dados`, `google-workspace` — mantém, adiciono cabeçalho de status ("Gateway ativo: X", "Preço atual: R$ Y") sincronizado

## 4. Detalhes técnicos

- Hook central: `src/hooks/use-realtime-sync.ts` (monta canais no `_authenticated` layout, remove no unmount).
- Cada aba usa `useQuery` com `staleTime: 15_000` + invalidação por realtime.
- Server fn nova: `src/lib/dashboard/overview.functions.ts` retorna todos os KPIs do mestre em UMA chamada (evita 8 requests).
- Migração: `ALTER PUBLICATION supabase_realtime ADD TABLE ...` para as 9 tabelas.
- Cards reaproveitam `Card` shadcn já existente; sem novas libs.
- Zero mudança de esquema de negócio — só leitura + realtime.

## 5. Fora de escopo (não mexo)

- Regras de envio, pricing, webhooks de pagamento, lógica das antenas, template de e-mail. Só leitura/visualização + realtime.

## Entrega

Faço em 1 turno só, na ordem: migração realtime → hook → server fn overview → dashboard mestre → padroniza cada aba com KPIs + feed live.
