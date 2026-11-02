import test from "node:test";
import assert from "node:assert/strict";
import type { Receivable, ReceivableWithBalance } from "@ir/types";
import { ReceivableService } from "../src/financeiro/receivable-service";
import { ReceivableDuplicateSubscriptionChargeError } from "../src/financeiro/receivable-repository";
import type { ReceivableRepository, NewReceivableRecord } from "../src/financeiro/receivable-repository";
import type { ClientCreditRepository } from "../src/financeiro/client-credit-repository";

/**
 * Bloco 4 (01/11/2026) — ReceivableService.registerFromSubscription nunca
 * tinha teste nenhum (achado real: nem este arquivo, nem nenhum outro no
 * repositório, cobria a peça mais crítica contra cobrança duplicada de
 * assinatura). Simula os dois mecanismos de proteção documentados no
 * próprio código: a pré-checagem em TypeScript (findBySubscriptionAndCompetency)
 * E o índice único do banco como rede de segurança sob corrida real
 * (aqui simulado como o repositório lançando o erro cru do Postgres que
 * o service precisa traduzir).
 */
function fixture(): { service: ReceivableService; created: NewReceivableRecord[] } {
  const created: NewReceivableRecord[] = [];
  const byKey = new Map<string, Receivable>();

  const repository: ReceivableRepository = {
    async list() { return []; },
    async getById(id: string) {
      const found = [...byKey.values()].find((r) => r.id === id);
      return found ? ({ ...found, totalReceived: 0, totalReversed: 0, totalAdjustments: 0, balance: found.originalAmount } as ReceivableWithBalance) : null;
    },
    async create(record: NewReceivableRecord) {
      created.push(record);
      const key = `${record.subscriptionId}:${record.competencyDate}`;
      if (record.subscriptionId && byKey.has(key)) {
        // Simula a violação real do índice único parcial do Postgres
        // (receivables_subscription_competency_unique) quando a
        // pré-checagem do service, por algum motivo, não pegou a
        // duplicata antes (corrida real).
        throw new Error('duplicate key value violates unique constraint "receivables_subscription_competency_unique"');
      }
      const receivable: Receivable = {
        id: `rec-${created.length}`,
        internalReference: `IR-REC-${created.length}`,
        createdAt: "2026-11-01T10:00:00Z",
        updatedAt: "2026-11-01T10:00:00Z",
        status: "open",
        ...record,
      } as unknown as Receivable;
      if (record.subscriptionId) byKey.set(key, receivable);
      return receivable;
    },
    async update(id: string, changes) {
      const found = [...byKey.values()].find((r) => r.id === id)!;
      const updated = { ...found, ...changes } as Receivable;
      byKey.set(`${updated.subscriptionId}:${updated.competencyDate}`, updated);
      return updated;
    },
    async findBySubscriptionAndCompetency(subscriptionId: string, competencyDate: string) {
      return byKey.get(`${subscriptionId}:${competencyDate}`) ?? null;
    },
    async findByCommercialSaleAndInstallment() { return null; },
    async listOpenForOrigin() { return []; },
    async listReceipts() { return []; },
    async addReceipt() { throw new Error("não usado neste teste"); },
    async reverseReceipt() { throw new Error("não usado neste teste"); },
    async listAdjustments() { return []; },
    async addAdjustment() { throw new Error("não usado neste teste"); },
    async reverseAdjustment() { throw new Error("não usado neste teste"); },
  };

  const credits: ClientCreditRepository = {
    async list() { return []; },
    async getById() { return null; },
    async create() { throw new Error("não usado neste teste"); },
    async reverse() { throw new Error("não usado neste teste"); },
    async apply() { throw new Error("não usado neste teste"); },
  } as unknown as ClientCreditRepository;

  return { service: new ReceivableService(repository, credits), created };
}

const baseInput = {
  clientId: "cliente-1",
  description: "Assinatura anual do Informativo Regional",
  sourceType: "subscription" as const,
  sourceId: "assinatura-1",
  sourceReference: "Assinatura IR-ASS-000001",
  subscriptionId: "assinatura-1",
  originalAmount: 180,
  issueDate: "2026-11-01",
  dueDate: "2026-11-04",
  competencyDate: "2026-11-01",
};

test("primeira cobrança de uma assinatura/competência é criada normalmente", async () => {
  const { service, created } = fixture();
  const receivable = await service.registerFromSubscription(baseInput);
  assert.equal(created.length, 1);
  assert.equal(receivable.originalAmount, 180);
});

test("segunda tentativa para a MESMA assinatura+competência é bloqueada pela pré-checagem, sem nem chegar a tentar criar", async () => {
  const { service, created } = fixture();
  await service.registerFromSubscription(baseInput);
  await assert.rejects(
    () => service.registerFromSubscription(baseInput),
    ReceivableDuplicateSubscriptionChargeError,
  );
  // A pré-checagem evitou até a segunda chamada de create() — nunca duas linhas no banco.
  assert.equal(created.length, 1);
});

test("mesma assinatura, competência DIFERENTE, não é bloqueada — duplicidade é por competência, nunca por assinatura isolada", async () => {
  const { service, created } = fixture();
  await service.registerFromSubscription(baseInput);
  await service.registerFromSubscription({ ...baseInput, competencyDate: "2027-11-01", issueDate: "2027-11-01", dueDate: "2027-11-04" });
  assert.equal(created.length, 2);
});

test("corrida real (TOCTOU): pré-checagem passa (ainda não viu a outra chamada), mas o índice único do banco pega — o service traduz pro erro de domínio, nunca deixa a mensagem bruta do Postgres escapar", async () => {
  // Pré-checagem sempre "null" (simula duas chamadas quase simultâneas,
  // nenhuma vendo a outra ainda) — só create() detecta a duplicidade,
  // exatamente como a constraint real do banco faria sob corrida.
  const repository: ReceivableRepository = {
    async list() { return []; },
    async getById() { return null; },
    async create() {
      throw new Error('duplicate key value violates unique constraint "receivables_subscription_competency_unique"');
    },
    async update() { throw new Error("não usado neste teste"); },
    async findBySubscriptionAndCompetency() { return null; },
    async findByCommercialSaleAndInstallment() { return null; },
    async listOpenForOrigin() { return []; },
    async listReceipts() { return []; },
    async addReceipt() { throw new Error("não usado neste teste"); },
    async reverseReceipt() { throw new Error("não usado neste teste"); },
    async listAdjustments() { return []; },
    async addAdjustment() { throw new Error("não usado neste teste"); },
    async reverseAdjustment() { throw new Error("não usado neste teste"); },
  };
  const credits = { async list() { return []; }, async getById() { return null; } } as unknown as ClientCreditRepository;
  const service = new ReceivableService(repository, credits);
  await assert.rejects(() => service.registerFromSubscription(baseInput), ReceivableDuplicateSubscriptionChargeError);
});

test("sourceType diferente de subscription nunca passa por esta rota — erro de validação explícito, não tenta adivinhar", async () => {
  const { service } = fixture();
  await assert.rejects(
    () => service.registerFromSubscription({ ...baseInput, sourceType: "advertising" as const, subscriptionId: undefined }),
  );
});

test("sem competência informada, recusa — nunca assume a data de emissão no lugar", async () => {
  const { service } = fixture();
  await assert.rejects(() => service.registerFromSubscription({ ...baseInput, competencyDate: undefined }));
});
