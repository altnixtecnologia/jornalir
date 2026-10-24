# Módulo 3 — Financeiro e Comercial: auditoria de integração
Data: 24/10/2026. PR #15, branch `feature/homologacao-integrada-ir-20261023`.

## Entregas em código nesta etapa

1. Venda só pode gerar Financeiro após aprovação, no estado `approved`,
   `active` ou `completed`. Proposta, cancelada, cortesia, valor zero,
   quantidade de parcelas errada, parcela menor que R$ 0,01 e data
   inválida são bloqueadas **antes da primeira inserção**.
2. Repetir geração parcial de parcelas consulta os lançamentos da venda.
   Parcela existente com mesmo número/cliente/valor/vencimento é
   reconhecida como `já existente`, sem criar segunda cobrança.
   Parcela cancelada, com vencimento ou valor divergente **não** é
   recriada automaticamente: reabrir ou ajustar no Financeiro preservando
   histórico. A venda é considerada com Financeiro gerado mesmo que todos
   os títulos estejam cancelados; impede alteração indevida da identidade
   financeira contratada.
3. Cancelamento Pix verifica no servidor se a cobrança pertence ao
   recebível E ao cliente selecionados, em vez de confiar em IDs da URL
   ou enviados pela tela. Exige motivo registrado.
4. Confirmação de Pix de demonstração é negada na Server Action quando
   `SYSTEM_LOCAL_PREVIEW` não está habilitado. A baixa real é feita
   pelo webhook Asaas autenticado e pela RPC transacional
   `confirm_payment_charge` com `service_role`.
5. Após timeout de cancelamento no Asaas, consulta situação remota:
   somente `cancelled`/`expired` autoriza continuar a atualização
   local. Se estiver pago ou a consulta falhar, **não** marca a cobrança
   como cancelada sem prova.
6. Se o provedor recuperar uma cobrança **já paga** antes de persistir
   o registro local, grava como `pending` com referência Asaas
   verdadeira; espera webhook com `service_role`. Nunca tenta
   dar baixa pela sessão de operador com `pix_gerar`.
7. Testes automatizados: `commercial-finance-guards.test.ts`,
   `payment-charge-cancellation.test.ts` e
   `payment-charge-recovery.test.ts`, invocados pelo workflow
   `validate-system.yml`.

## Comportamento que já existia e foi preservado

- Geração de título de venda tem índice único por
  `commercial_sale_id,installment_number`, nunca apaga histórico.
- Créditos excedentes do pagamento Pix confirmado são registrados em
  `client_credits` pela RPC atômica; no recebimento que excede saldo
  não deve nascer recibo maior que saldo.
- Cancelar venda não apaga parcelas pagas; a UI fornece acesso ao
  Financeiro para conciliação.
- A reserva de locação exige venda comercial aprovada/ativa; bloqueia
  sobreposição da mesma máquina e exige vistorias para retirada/devolução.
  Caução e aluguel não geram outra cobrança por si só: o Financeiro
  deriva da venda negociada e deve ser conciliado antes de criar títulos.
- Permissões dos operadores separadas: `pix_gerar`, `pix_enviar`,
  `pix_cancelar`, `recebimentos_baixar`, `recebimentos_estornar`,
  `creditos_aplicar`, `titulos_criar`, etc. Sem visibilidade do
  Financeiro, autorização de ação isolada não basta.
- Asaas e WhatsApp **já possuem** implementações reais no código;
  qualquer comentário legado dizendo que estão apenas planejados
  está desatualizado. Integração real somente quando chaves/configuração
  apropriadas e módulos estiverem homologados.

## Testes reais que NÃO foram realizados nesta sessão

Não fazer cobrança real por conta própria. Em ambiente Asaas SANDBOX
com cliente fictício, titular de testes e sem números telefônicos reais:

1. Criar proposta com vários produtos e converter uma única venda.
   Rejeitar criação indevida de segunda venda; cancelar proposta e
   confirmar que não gera título.
2. Com venda aprovada, gerar 3 parcelas. Interromper entre 1ª e 2ª;
   repetir, conferir que primeira é reconhecida e só restantes nascem;
   não recriar parcela cancelada, quitada ou com valor diferente.
3. Testar operador que **gera/envia Pix**, mas não pode **cancelar,
   estornar nem dar baixa**. Tentar URL direta, Server Action forjada e
   tabela no PostgREST para comprovar RLS.
4. Gerar Pix Asaas SANDBOX, conferir QR e copia/cola no link externo,
   validar payload, webhook com token correto e errado, duplicação,
   liquidação, crédito excedente e impossibilidade de baixa manual
   por operador sem permissão.
5. Simular timeout Asaas no cancelamento, pagamento próximo à revogação
   e reenvio do mesmo webhook (sem recibos ou créditos duplicados).
6. Confirmar WhatsApp de cobrança e pagamento com template Meta aprovado,
   opt-in e destinatário de teste. Não assumir entrega só por status 200.
7. Revisar assinaturas/locações: título só pela origem negociada, caução
   separada, reserva com vistorias e impedimento de dupla locação.
8. Testar devolução/estorno parcial com crédito de origem consistente,
   histórico e permissões de acesso.
9. Não aplicar migrations no Supabase remoto, nem gerar cobranças ou
   enviar mensagens reais antes da autorização explícita.

## Pontos para próximo subbloco

- Revisar mecanismo de concorrência Asaas: duas solicitações simultâneas
  antes do registro local podem atingir o provedor. A consulta por
  `externalReference` ajuda a recuperar após timeout, mas não é uma
  reserva transacional remota. Homologar proteção contra duplicidade em
  ambiente de teste e não presumir idempotência inexistente.
- Notificações WhatsApp emitidas durante reprocessamento de webhook:
  conferir idempotência dos efeitos externos e log durável.
- Reconciliar vendas canceladas com veiculação de anúncios/assinaturas
  sem criar cobrança automática ou apagar evidência.
- Validar condições `trade`, `bailment`, `other` para cada acordo:
  contrato/jurídico define o que é realmente faturável; a regra atual
  impede cortesia, mas **não** decide automaticamente se permuta/comodato
  exige título. Requer aprovação comercial explícita.

## Status
Bloco de proteções implementado na PR, pendente resultado final de CI
da versão mais recente e homologação real Asaas/Meta/operadores.
**Não afirmar que o módulo inteiro está em produção ou homologado.**

### Adendo: data de emissão

A data de emissão de títulos originados de venda é
`todayInSaoPauloISO()`, e a primeira data de vencimento não pode
ser anterior a ela. A mesma data é usada para todas as parcelas
criadas naquela operação, sem divergência UTC perto da meia-noite.
