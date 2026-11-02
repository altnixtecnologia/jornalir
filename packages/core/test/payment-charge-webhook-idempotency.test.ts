import test from "node:test";
import assert from "node:assert/strict";
import type { PaymentCharge } from "@ir/types";
import { PaymentChargeService } from "../src/financeiro/payment-charge-service";
import type { PaymentChargeRepository, ConfirmChargeResult } from "../src/financeiro/payment-charge-repository";
import type { PixProvider } from "../src/financeiro/pix-provider";

/**
 * Bloco 4, item 6/7 (01/11/2026) — simula a entrega REPETIDA de um
 * webhook "PAYMENT_RECEIVED" (comportamento real e documentado do
 * Asaas: o mesmo pagamento pode gerar mais de uma notificação). O
 * dedup por evento (billing_webhook_events) fica fora deste teste —
 * aqui simula especificamente o caso em que dois EVENTOS DIFERENTES
 * (ids diferentes) confirmam a MESMA cobrança, que é o cenário que a
 * idempotência dentro de confirm_payment_charge (status='paid' sob
 * row lock) precisa cobrir. O contrato do repositório
 * (confirmCharge) já documenta "nunca cria um segundo receipt/crédito
 * pra uma cobrança já confirmada" — este teste prova que o SERVICE
 * (camada que o webhook de verdade chama) repassa esse resultado sem
 * reprocessar nem mascarar o sinal de "já confirmada".
 */
function fixture() {
  let status: PaymentCharge["status"] = "pending";
  let confirmCalls = 0;
  let receiptId: string | undefined;

  const repository: PaymentChargeRepository = {
    async getById(id) {
      return { id, status, receivableId: "rec-1", clientId: "cliente-1", amount: 100 } as unknown as PaymentCharge;
    },
    async listForReceivable() { return []; },
    async findPendingForReceivable() { return null; },
    async create() { throw new Error("não usado neste teste"); },
    async update() { throw new Error("não usado neste teste"); },
    async confirmCharge(id, input): Promise<ConfirmChargeResult> {
      confirmCalls += 1;
      if (status === "paid") {
        // Mesma fonte de verdade documentada na migration real
        // (20261027100500): status, nunca receiptId isolado.
        return {
          charge: { id, status, receivableId: "rec-1", clientId: "cliente-1", amount: 100 } as unknown as PaymentCharge,
          receiptId,
          alreadyConfirmed: true,
          overpaymentAmount: 0,
        };
      }
      status = "paid";
      receiptId = "receipt-1";
      return {
        charge: { id, status, receivableId: "rec-1", clientId: "cliente-1", amount: 100 } as unknown as PaymentCharge,
        receiptId,
        alreadyConfirmed: false,
        overpaymentAmount: 0,
      };
    },
  };

  const provider: PixProvider = {
    async createCharge() { throw new Error("não usado neste teste"); },
    async getCharge() { throw new Error("não usado neste teste"); },
    async cancelCharge() { throw new Error("não usado neste teste"); },
  };

  return { service: new PaymentChargeService(repository, provider), confirmCallsRef: () => confirmCalls };
}

test("primeira entrega do webhook confirma a cobrança e cria o receipt", async () => {
  const { service } = fixture();
  const result = await service.confirmPixCharge("charge-1", "2026-11-01");
  assert.equal(result.alreadyConfirmed, false);
  assert.equal(result.receiptId, "receipt-1");
});

test("segunda entrega do MESMO webhook (reenvio real do Asaas) nunca cria um segundo receipt — o service repassa alreadyConfirmed=true, nunca mascara nem reprocessa", async () => {
  const { service, confirmCallsRef } = fixture();
  const first = await service.confirmPixCharge("charge-1", "2026-11-01");
  const second = await service.confirmPixCharge("charge-1", "2026-11-01");
  assert.equal(first.alreadyConfirmed, false);
  assert.equal(second.alreadyConfirmed, true);
  // Mesmo receiptId nas duas respostas — nunca um segundo receipt criado.
  assert.equal(second.receiptId, first.receiptId);
  // O repositório (que simula o lock/idempotência real do banco) foi
  // chamado duas vezes — o SERVICE não tenta "otimizar" guardando estado
  // em memória; delega inteiramente a atomicidade pro banco, como o
  // comentário da classe documenta.
  assert.equal(confirmCallsRef(), 2);
});

test("três entregas seguidas do mesmo webhook continuam idempotentes — não é só a segunda chamada que é segura", async () => {
  const { service } = fixture();
  const results = await Promise.all([
    service.confirmPixCharge("charge-1", "2026-11-01"),
    service.confirmPixCharge("charge-1", "2026-11-01"),
    service.confirmPixCharge("charge-1", "2026-11-01"),
  ]);
  const confirmedCount = results.filter((r) => !r.alreadyConfirmed).length;
  assert.equal(confirmedCount, 1, "só uma das três chamadas deveria processar a confirmação de verdade");
});
