# Confirmação automática de pagamento no link da empresa

## O que aconteceu (verificado)

O pedido de R$ 5,00 criado hoje (06:41 UTC) está no nosso banco como **"aguardando pagamento"**, mas ao consultar o Mercado Pago diretamente a mesma cobrança aparece como **processada e creditada (paga)**.

Ou seja: o dinheiro entrou, mas o aviso automático do Mercado Pago (webhook) não chegou até o nosso sistema — e hoje a página do certificado **só olha o nosso banco**. Como o banco nunca foi atualizado, a empresa continuou vendo a tela de "pendente".

Pontos frágeis confirmados no código:

- A página `/c/{token}` consulta apenas a tabela de pedidos; se o webhook falha, nada mais corrige.
- A rotina de reconciliação existente (usada na aba Pagamentos) não tem tratamento para Mercado Pago — só SigiloPay e SyncPay.
- A busca do gateway usa "qualquer gateway ativo" em vez de buscar pelo provedor do pedido.
- A verificação contra o provedor só roda enquanto o modal do PIX está aberto.

## O que será feito

1. **Página do certificado passa a confirmar no provedor**
   A checagem de pagamento do link (`getLinkPaymentStatus`) deixa de ser apenas leitura do banco: quando existir um pedido pendente com cobrança no provedor, ela reconsulta o Mercado Pago (ou SigiloPay/SyncPay, conforme o pedido), marca como pago no banco, dispara o e-mail de confirmação e devolve "pago". Assim, mesmo sem webhook, ao abrir/atualizar o link a empresa vê o certificado vinculado.
   - Consulta com cache curto (não reconsulta o provedor mais de uma vez a cada ~20s por token) para não pesar no carregamento.
   - Se o provedor não responder, a página segue funcionando normalmente (nunca quebra).

2. **Correção do reconciliador**
   Adicionar o ramo Mercado Pago na rotina de reconciliação e passar a buscar o gateway pelo `provider_type` do pedido, em vez de "qualquer ativo". Isso conserta também a aba Pagamentos.

3. **Reconciliação periódica automática**
   Endpoint público de cron (`/api/public/hooks/reconcile-payments`, protegido por segredo) que varre pedidos pendentes das últimas 48h, confirma no provedor e marca os pagos + envia e-mail de confirmação. Rede de segurança para qualquer falha de webhook.

4. **Endurecer o webhook do Mercado Pago**
   Manter o comportamento atual, mas casar o pedido também por `external_reference` mesmo quando o ID vier como Order, e registrar log claro quando nenhum pedido for encontrado.

5. **Corrigir o pedido atual**
   Marcar o pedido já pago como pago (com a data real) para que aquela empresa veja imediatamente o certificado vinculado.

6. **Verificar a URL do webhook**
   O sistema espera notificações em:
   `https://servicosdigitalpack.lovable.app/api/public/webhook-mercadopago`
   É preciso confirmar que é exatamente essa URL cadastrada no painel do Mercado Pago (notificações de "Pagamentos" e "Ordens"). Sem isso o webhook continua não chegando — mas, com os itens 1 e 3, o pagamento passa a ser confirmado de qualquer forma.

## Detalhes técnicos

- `src/lib/company-links.functions.ts`: `getLinkPaymentStatus` passa a chamar um helper novo `ensureOrderPaid` (server-only) que reconsulta o provedor do pedido pendente mais recente do link.
- Novo `src/lib/payments/verify.server.ts`: função única `verifyAndSettleOrder(orderId)` reutilizada por `status.functions.ts`, `reconcile.functions.ts`, o cron e o webhook — elimina as três cópias divergentes da lógica de status.
- `src/lib/payments/status.functions.ts` e `reconcile.functions.ts`: passam a usar o helper único, com seleção de gateway por `provider_type`.
- Novo `src/routes/api/public/hooks/reconcile-payments.ts` validando `CASA_DOS_DADOS_CRON_SECRET` (ou segredo dedicado) no header.
- Envio de e-mail de confirmação permanece idempotente (só quando o pedido muda de pendente para pago).
