import test from "node:test";
import assert from "node:assert/strict";
import type { Subscription } from "@ir/types";
import { SubscriptionService, SubscriptionStatusTransitionError } from "../src/assinaturas/subscription-service";
import type { SubscriptionRepository, NewSubscriptionRecord, SubscriptionChanges } from "../src/assinaturas/subscription-repository";

/** Mesmo padrão de fakeSubscriptionRepository em
 * apps/sistema/test/bloco4-subscription-contract-financeiro-integration.test.ts
 * — repositório em memória, nunca Supabase real. */
function fakeSubscriptionRepository(): SubscriptionRepository {
  const rows = new Map<string, Subscription>();
  let n = 0;
  return {
    async list() {
      return [...rows.values()];
    },
    async getById(id: string) {
      return rows.get(id) ?? null;
    },
    async create(record: NewSubscriptionRecord) {
      n += 1;
      const sub = { id: `assinatura-${n}`, reference: `IR-ASS-${n}`, createdAt: "2026-11-02T10:00:00Z", updatedAt: "2026-11-02T10:00:00Z", ...record } as Subscription;
      rows.set(sub.id, sub);
      return sub;
    },
    async update(id: string, changes: SubscriptionChanges) {
      const current = rows.get(id);
      if (!current) throw new Error("não encontrada");
      const updated = { ...current, ...changes } as Subscription;
      rows.set(id, updated);
      return updated;
    },
  };
}

function baseInput(): { clientId: string; serviceType: "impresso"; amount: number; periodicity: "annual"; startsAt: string } {
  return { clientId: "cliente-1", serviceType: "impresso", amount: 180, periodicity: "annual", startsAt: "2026-11-02" };
}

test("register() sem status explícito cria a assinatura como pending_formalization (Bloco E) — criar nunca ativa direto", async () => {
  const service = new SubscriptionService(fakeSubscriptionRepository());
  const subscription = await service.register(baseInput());
  assert.equal(subscription.status, "pending_formalization");
});

test("register() com status explícito (ex.: importação de dados antigos) continua honrando o valor informado", async () => {
  const service = new SubscriptionService(fakeSubscriptionRepository());
  const subscription = await service.register({ ...baseInput(), status: "active" });
  assert.equal(subscription.status, "active");
});

test("activate() transiciona pending_formalization -> active, e só isso — nunca cria/toca nenhum título financeiro (SubscriptionService não tem dependência de ReceivableRepository)", async () => {
  const service = new SubscriptionService(fakeSubscriptionRepository());
  const created = await service.register(baseInput());
  assert.equal(created.status, "pending_formalization");
  const activated = await service.activate(created.id);
  assert.equal(activated.status, "active");
  // Nenhum outro campo financeiro/contratual foi alterado pela ativação.
  assert.equal(activated.amount, created.amount);
  assert.equal(activated.clientId, created.clientId);
});

test("pending_formalization só pode ir para active ou cancelled — nunca direto para suspended (precisa ser ativada primeiro)", async () => {
  const service = new SubscriptionService(fakeSubscriptionRepository());
  const created = await service.register(baseInput());
  await assert.rejects(
    () => service.update(created.id, { ...baseInput(), status: "suspended" }),
    SubscriptionStatusTransitionError,
  );
});

test("pending_formalization pode ser cancelada diretamente (desistência antes da formalização), sem precisar passar por active", async () => {
  const service = new SubscriptionService(fakeSubscriptionRepository());
  const created = await service.register(baseInput());
  const cancelled = await service.cancel(created.id, "Cliente desistiu antes da formalização.");
  assert.equal(cancelled.status, "cancelled");
});

test("uma assinatura ATIVA preexistente nunca é afetada ao criar uma assinatura NOVA (pending_formalization) para o mesmo ou outro cliente — preserva histórico/assinaturas antigas", async () => {
  const repository = fakeSubscriptionRepository();
  const service = new SubscriptionService(repository);
  const old = await service.register({ ...baseInput(), status: "active" });
  const fresh = await service.register(baseInput());
  assert.equal(old.status, "active");
  assert.equal(fresh.status, "pending_formalization");
  const reloadedOld = await service.getById(old.id);
  assert.equal(reloadedOld.status, "active");
});

test("cancelada é estado final mesmo vindo de pending_formalization — nunca pode ser reativada depois (mesma regra já existente para as demais)", async () => {
  const service = new SubscriptionService(fakeSubscriptionRepository());
  const created = await service.register(baseInput());
  await service.cancel(created.id);
  await assert.rejects(() => service.activate(created.id), SubscriptionStatusTransitionError);
});
