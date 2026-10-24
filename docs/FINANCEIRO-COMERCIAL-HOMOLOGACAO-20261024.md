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

## Continuação 24/10 — concorrência Pix / webhook e envio Meta (PR #15)

- Antes da chamada externa Asaas, `PaymentChargeService` cria reserva `payment_charges` pendente sem id remoto. O índice único por título impede que dois cliques concorrentes cheguem ao POST remoto. Se houver timeout/falha antes de persistir o id Asaas, a reserva permanece: **não cancelar, enviar link nem repetir o POST automaticamente**. Conciliar manualmente a cobrança remota pelo `externalReference=receivable:<uuid>` e regularizar o vínculo/documentar eventual inexistência remota antes de desbloquear.
- O adaptador preview não usa reserva remota. Testes de concorrência e timeout em `payment-charge-creation-concurrency.test.ts`.
- `billing_webhook_events` possui token/lease de processamento exclusivo por evento. A entrega simultânea espera reenvio (HTTP 503) e só a vencedora grava `processed_at`. Lease de 15 minutos para recuperação pós-crash.
- `billing_notification_dispatches`: uma reserva única `(payment_charge_id,notification_kind)` ANTES de chamar a Meta; duplicatas de webhook não reenviam. Falhas/timeout Meta ficam `uncertain` para conferência manual, pois é impossível provar que a Meta não enviou. Registros `billing_message_logs` e notificações continuam auxiliares.
- Migrations locais novas: `20261120100000_finance_webhook_dispatch_idempotency.sql` e `20261120110000_payment_charge_update_restricted.sql`. A segunda impede INSERT/PATCH direto de `payment_charges` por colaboradores autenticados (inclusive admin). Criação/finalização feitas pela Server Action com service_role, após checar `pix_gerar` e validar cliente/saldo; baixa apenas pela RPC idempotente service_role.
- O sistema ainda exige homologação real **Asaas Sandbox**, falhas intercaladas, créditos/estornos, Meta/WhatsApp em ambiente controlado e liberação segura de reservas abandonadas após conferência. Nenhum envio real foi feito; não aplicar as migrations remotamente sem autorização.

### Recuperação sem emissão duplicada

A tela Pix oferece `Consultar cobrança existente no Asaas` quando existe reserva local pendente sem ID do provedor. A nova action `reconcilePixReservationAction` exige `pix_gerar` e verifica título/cliente; a consulta externa usa **somente GET** por `externalReference`, exige modalidade PIX, valor idêntico e QR válido para pendências, depois vincula o ID remoto ao registro reservado. Não encontra => mantém bloqueio; não faz novo POST nem cancela a reserva automaticamente. Se retornar pago, somente webhook autenticado/service_role realiza a baixa. Sem Asaas sandbox e casos de rede reais, esse fluxo continua pendente de homologação operacional.

### Guarda adicional de corrida cancelamento vs recebimento

Atualização local de cobrança para `cancelled` exige `WHERE status='pending'` mesmo usando `service_role`; uma confirmação que venceu a corrida jamais deve ser sobrescrita por um DELETE tardio. O webhook `PAYMENT_OVERDUE`/`PAYMENT_DELETED` também usa UPDATE condicional e evita notificar falsamente um cancelamento se o status mudou entre leitura e escrita. Registros locais com vinculação remota já estabelecida recusam nova substituição do ID Asaas. Homologar estes interleavings no sandbox.

### Recebimento manual e quitação com diferença (24/10)

- Adicionada `record_manual_receivable_payment`, RPC transacional com `FOR UPDATE` no título e permissões distintas `recebimentos_baixar` / `recebimentos_quitar_diferenca`. Recibo, crédito excedente, abatimento da quitação e status do título são gravados juntos ou desfeitos juntos.
- `manual_receivable_operations` mantém operação imutável por UUID da tela, com snapshot/autor, retornando a mesma operação no retry e recusando UUID reaproveitado com dados alterados. Formulários guardam UUID até sucesso/cancelamento.
- Preview mantém o comportamento anterior. Pendente homologação autenticada com falhas de rede e recebimentos concorrentes; `payCompositionAction`, descontos avulsos e estornos ainda são multietapa e pertencem à próxima frente do Módulo 3.

- Revisão de segurança adicional: `manual_receivable_operations` agora só aceita INSERT pela RPC `SECURITY DEFINER` após conferência de permissão; operadores não podem forjar antecipadamente registros de idempotência via PostgREST.

### Composição de vários títulos — etapa transacional isolada (24/10/2026)

- `record_manual_composition_payment` valida sessão/permissão de baixa, UUID da operação, até 50 títulos únicos, mesmo cliente e mesma origem (assinatura ou contrato), lista completa de títulos anteriores e ordem de vencimento; retorna erro explícito para seleção obsoleta, cruzamento de contratos e manipulação de ordem.
- Adquire row locks **sempre pela ordem dos UUIDs** para reduzir deadlocks entre composições concorrentes; distribui o valor em ordem financeira com limite de saldo por título, registra `receivable_receipts`, atualiza o status e cria crédito do excedente **na mesma transação**. `manual_composition_operations` grava snapshot e lista dos recibos com chave idempotente; mesmo UUID/snapshot retorna mesmos resultados sem duplicar.
- Fora do preview, `payCompositionAction` agora invoca a RPC em vez de gravar título por título. `CompositionPaymentPanel` mantém UUID estável em retries de rede, renovado ao fechar/reabrir ou após sucesso. Preview continua sem integração externa.
- Teste em banco descartável no CI: pagamentos por ordem, saldo excedente, retry, origem cruzada, permissão, lista incompleta e acesso negado à gravação direta do ledger. Não mexer no Supabase remoto antes de homologação.
- Ainda pendentes neste Módulo 3: abatimentos avulsos e estornos completamente transacionais, cenários reais de concorrência PostgreSQL em sessões paralelas e fluxos Asaas/Meta Sandbox.
