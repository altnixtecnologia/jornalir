import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allocatePaymentAcrossReceivables,
  buildReceivableComposition,
  computeAmountToCollect,
  creditMatchesReceivableOrigin,
  planCreditApplication,
  splitOverpayment,
} from "../src/financeiro";

// Cenários A-I exigidos pela Parte 3B.1 (crédito do cliente / saldo
// anterior / composição da fatura) — cada teste usa só as funções puras
// de packages/types/src/financeiro/index.ts, sem banco (Supabase
// continua bloqueado por quota nesta fase).

test("A) 200 devido / 220 pago => 20 de crédito, título quitado", () => {
  const result = splitOverpayment(220, 200);
  assert.equal(result.appliedToReceivable, 200);
  assert.equal(result.creditAmount, 20);
});

test("B) 200 devido / 20 de crédito anterior => 180 a pagar", () => {
  const { applications, remainingReceivableBalance } = planCreditApplication([{ id: "c1", balance: 20 }], 200);
  assert.deepEqual(applications, [{ creditId: "c1", amount: 20 }]);
  assert.equal(remainingReceivableBalance, 180);
});

test("C) 200 atual / 20 anterior em aberto => 220 total apresentado", () => {
  const composition = buildReceivableComposition({
    currentChargeLabel: "Cobrança atual",
    currentChargeAmount: 200,
    priorOpenBalance: 20,
  });
  assert.equal(composition.total, 220);
});

test("D) 20 antigo + 200 atual / pagamento 220 => quita antigo e atual, sem excedente", () => {
  const { allocations, remainingPayment } = allocatePaymentAcrossReceivables(
    [
      { id: "old", balance: 20 },
      { id: "new", balance: 200 },
    ],
    220,
  );
  assert.deepEqual(allocations, [
    { id: "old", amount: 20 },
    { id: "new", amount: 200 },
  ]);
  assert.equal(remainingPayment, 0);
});

test("E) 20 antigo + 200 atual / pagamento 180 => quita antigo, aplica 160 no atual, saldo 40", () => {
  const { allocations, remainingPayment } = allocatePaymentAcrossReceivables(
    [
      { id: "old", balance: 20 },
      { id: "new", balance: 200 },
    ],
    180,
  );
  assert.deepEqual(allocations, [
    { id: "old", amount: 20 },
    { id: "new", amount: 160 },
  ]);
  assert.equal(remainingPayment, 0);
  const newAllocation = allocations.find((item) => item.id === "new");
  const resultingBalance = 200 - (newAllocation?.amount ?? 0);
  assert.equal(resultingBalance, 40);
});

test("F) 250 de crédito / cobrança de 200 => título quitado, 50 de crédito restante", () => {
  const { applications, remainingReceivableBalance } = planCreditApplication([{ id: "c1", balance: 250 }], 200);
  assert.deepEqual(applications, [{ creditId: "c1", amount: 200 }]);
  assert.equal(remainingReceivableBalance, 0);
  const creditBalanceAfter = 250 - applications.reduce((sum, item) => sum + item.amount, 0);
  assert.equal(creditBalanceAfter, 50);
});

test("G) 250 de crédito / três cobranças de 100 => 100 + 100 + 50 aplicados, terceira fica com 50 em aberto", () => {
  let creditBalance = 250;

  const month1 = planCreditApplication([{ id: "c1", balance: creditBalance }], 100);
  assert.deepEqual(month1.applications, [{ creditId: "c1", amount: 100 }]);
  assert.equal(month1.remainingReceivableBalance, 0);
  creditBalance -= month1.applications[0].amount;
  assert.equal(creditBalance, 150);

  const month2 = planCreditApplication([{ id: "c1", balance: creditBalance }], 100);
  assert.deepEqual(month2.applications, [{ creditId: "c1", amount: 100 }]);
  assert.equal(month2.remainingReceivableBalance, 0);
  creditBalance -= month2.applications[0].amount;
  assert.equal(creditBalance, 50);

  const month3 = planCreditApplication([{ id: "c1", balance: creditBalance }], 100);
  assert.deepEqual(month3.applications, [{ creditId: "c1", amount: 50 }]);
  assert.equal(month3.remainingReceivableBalance, 50);
  creditBalance -= month3.applications[0].amount;
  assert.equal(creditBalance, 0);
});

test("H) crédito de Publicidade + cobrança de Assinatura => NÃO aplica automaticamente", () => {
  const matches = creditMatchesReceivableOrigin(
    { sourceType: "advertising", subscriptionId: undefined, contractId: undefined },
    { sourceType: "subscription", subscriptionId: "sub-1", contractId: undefined },
  );
  assert.equal(matches, false);
});

test("I) crédito da mesma Assinatura => aplica automaticamente", () => {
  const matches = creditMatchesReceivableOrigin(
    { sourceType: "subscription", subscriptionId: "sub-1", contractId: undefined },
    { sourceType: "subscription", subscriptionId: "sub-1", contractId: undefined },
  );
  assert.equal(matches, true);
});

// Extras — item 6 (crédito maior que a cobrança) e item 9 (Pix/cartão
// considerando crédito), cobertos à parte dos cenários A-I nomeados.

test("item 6: crédito de 250 numa cobrança de 200 — mesmo resultado de F via computeAmountToCollect", () => {
  const { amountToCollect, creditApplied } = computeAmountToCollect(200, 250);
  assert.equal(creditApplied, 200);
  assert.equal(amountToCollect, 0);
});

test("item 9: Pix/cartão deve pedir só a diferença depois do crédito", () => {
  const { amountToCollect, creditApplied } = computeAmountToCollect(200, 20);
  assert.equal(creditApplied, 20);
  assert.equal(amountToCollect, 180);
});

test("item 10: composição combinada — 200 atual + 20 saldo anterior - 10 crédito = 210", () => {
  const composition = buildReceivableComposition({
    currentChargeLabel: "Cobrança outubro/2026",
    currentChargeAmount: 200,
    priorOpenBalance: 20,
    availableCredit: 10,
  });
  assert.equal(composition.total, 210);
});

// Cenários acrescentados no ajuste de integridade financeira
// (atomicidade do crédito + pagamento pela composição sempre
// respeitando a dívida mais antiga).

test("J) 20 antigo + 200 atual / pagamento 250 => quita os dois, 30 viram crédito da mesma origem", () => {
  const { allocations, remainingPayment } = allocatePaymentAcrossReceivables(
    [
      { id: "old", balance: 20 },
      { id: "new", balance: 200 },
    ],
    250,
  );
  assert.deepEqual(allocations, [
    { id: "old", amount: 20 },
    { id: "new", amount: 200 },
  ]);
  assert.equal(remainingPayment, 30);
  // O crédito resultante (remainingPayment) é criado com a origem do
  // título mais novo (último alvo) — mesma origem, nunca cruzada (ver H/I).
  const matches = creditMatchesReceivableOrigin(
    { sourceType: "subscription", subscriptionId: "sub-1" },
    { sourceType: "subscription", subscriptionId: "sub-1" },
  );
  assert.equal(matches, true);
});

test("M) pagamento pela composição sempre quita a dívida mais antiga primeiro, nunca pula pra uma mais nova", () => {
  // Três títulos da mesma origem, já ordenados do mais antigo pro mais
  // novo (mesma pré-condição exigida de quem chama
  // allocatePaymentAcrossReceivables/payAcrossReceivables).
  const targets = [
    { id: "ago", balance: 10 },
    { id: "set", balance: 20 },
    { id: "out", balance: 200 },
  ];
  const { allocations, remainingPayment } = allocatePaymentAcrossReceivables(targets, 25);
  // Quita ago (10) inteiro, depois parte de set (15) — "out" (o mais
  // novo) nunca recebe nada enquanto ago/set não estiverem quitados,
  // mesmo tendo saldo suficiente pra isso se a ordem fosse ignorada.
  assert.deepEqual(allocations, [
    { id: "ago", amount: 10 },
    { id: "set", amount: 15 },
  ]);
  assert.equal(remainingPayment, 0);
  assert.equal(allocations.some((item) => item.id === "out"), false);
});

// K) e L) — duas tentativas concorrentes de consumir o mesmo crédito, e
// aplicação parcial concorrente nunca superando original_amount — SÓ
// podem ser validadas de verdade contra um PostgreSQL real (a proteção
// é o `select ... for update` da RPC `apply_client_credit`, ver
// supabase/migrations/20261019100000_financeiro_credito_cliente.sql).
// Não há como simular lock de linha/transação concorrente contra as
// funções puras deste pacote nem contra um mock em memória sem
// reproduzir o próprio Postgres. Documentado aqui como teste de
// INTEGRAÇÃO a ser executado manualmente quando o Supabase voltar:
//
// Teste de integração K (consumo duplicado):
//   1. Criar um client_credit com original_amount = 100.
//   2. Disparar duas chamadas a `apply_client_credit` SIMULTANEAMENTE
//      (ex.: duas abas/processos, cada uma pedindo requested_amount=80,
//      contra DOIS títulos abertos diferentes do mesmo cliente/origem,
//      cada um com saldo >= 80).
//   3. Esperado: a soma de `applied_amount` das duas chamadas nunca
//      pode superar 100 (ex.: 80 + 20, nunca 80 + 80) — a segunda
//      chamada só deve ver o saldo já reduzido pela primeira, nunca o
//      saldo original de 100 de novo.
//   4. Confirmar via `select sum(amount) from receivable_adjustments
//      where credit_id = :id and reversed_at is null` <= 100.
//
// Teste de integração L (aplicação parcial concorrente):
//   1. Mesmo crédito de 100, só que as duas chamadas concorrentes
//      pedem requested_amount=60 cada (overlap: juntas excedem 100).
//   2. Esperado: uma aplica até 60 (se chegou primeiro) e a outra
//      aplica no máximo o que restou (<=40) — nunca as duas aplicam 60
//      cheios. Mesma verificação do passo 4 de K.


