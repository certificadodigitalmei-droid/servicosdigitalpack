# WhatsApp em Massa: consulta, importação e limpeza no mesmo lugar

Objetivo: a aba Painel > WhatsApp em Massa passa a ter, de cima para baixo, um bloco de
Consulta Automática igual ao da aba dedicada, o importador logo abaixo alimentado por essa
consulta, a fila de prontidão com botões de limpeza, e a campanha consumindo tudo isso
sozinha — inclusive puxando novas empresas quando a fila esvazia.

## 1. Consulta automática dentro da aba

- Novo bloco no topo da aba, reaproveitando o mesmo motor da aba Consulta Automática
  (nenhuma lógica duplicada): escolha de data (hoje ou dia específico), filtros MEI/ativa/matriz,
  contagem grátis do dia e lista de CNPJs encontrados em tempo real.
- Trocar a data limpa os resultados anteriores na hora, sem recarregar a página.
- O filtro "somente celular" fica sempre ligado nesse contexto: empresa sem celular nem
  aparece na consulta, então nenhum crédito é gasto com ela.

## 2. Importador ligado à consulta

- O importador abaixo da consulta passa a usar a data e os filtros escolhidos ali em cima
  (hoje ele tem uma data própria e separada).
- Ele importa sempre as empresas mais recentes da lista do dia, na ordem em que chegaram,
  e só considera "pronta" a empresa com celular brasileiro válido e link ativo.
- A barra de progresso conta apenas empresas prontas, e o resumo mostra prontas,
  rejeitadas e ignoradas.

## 3. Campanha se abastece sozinha

- Ao ativar/rodar uma campanha, se a fila de prontidão ficar abaixo do necessário, o motor
  chama a mesma importação (data do dia, filtro de celular) para completar a fila antes de
  enviar. Isso vale também com o painel fechado, no motor que roda no servidor.
- Nada é enviado durante a importação: importar continua separado de enviar.

## 4. Comandos de limpeza na aba

Nova seção "Manutenção da base", com confirmação em cada ação:

- Excluir empresas com falha de envio: remove empresas cujas tentativas de WhatsApp
  falharam de forma definitiva, junto com seus itens de fila e links.
- Excluir empresas sem celular: apaga empresas importadas e links gerados sem celular
  brasileiro válido (é o número que hoje aparece como "Sem celular: 13").
- Botão de exclusão direto no card "Empresas prontas para WhatsApp", ao lado do contador
  "Sem celular", com o mesmo efeito.
- Vendas pagas e seus dados nunca são apagados por nenhuma dessas ações.

## Detalhes técnicos

- UI: `src/routes/_authenticated.painel.whatsapp-massa.tsx` ganha o bloco de consulta
  (componente novo `src/components/painel/ConsultaInline.tsx` extraído do que já existe em
  `_authenticated.painel.consulta-automatica.tsx`, usando `src/lib/automation/consulta-engine.ts`
  como store único).
- `src/components/painel/WhatsappReadyPanel.tsx`: recebe data/filtros por props vindas do
  store da consulta; some o seletor de data próprio; ganha os botões de limpeza.
- Novo `src/lib/whatsapp/maintenance.server.ts` + `maintenance.functions.ts` (admin-only,
  via `requireSupabaseAuth`) com `purgeCompaniesWithoutMobile()` e `purgeFailedCompanies()`,
  reaproveitando `admin_purge_company_permanent` quando houver telefone, e apagando
  `whatsapp_ready_queue` / `company_links` / `companies` sem pedido pago caso contrário.
- `src/lib/whatsapp/campaign.server.ts`: em `buildCampaignQueue`, quando
  `wa_reserve_ready` devolver menos itens que o alvo, dispara o refil chamando
  `runImportBatch` de `src/lib/casa-dos-dados/simple-flow.server.ts` com a data de hoje e
  `require_mobile_phone: true`, com teto por tick para não estourar tempo nem créditos.
- Nenhuma migração nova: as tabelas `whatsapp_ready_queue`, `blocked_import_cnpjs` e a
  função de expurgo já existem.
