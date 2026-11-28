import test from "node:test";
import assert from "node:assert/strict";
import type { PaymentCharge } from "@ir/types";
import { PaymentChargeService } from "../src/financeiro/payment-charge-service";
import { PaymentChargeAlreadyPendingError, type PaymentChargeRepository } from "../src/financeiro/payment-charge-repository";
import type { PixProvider } from "../src/financeiro/pix-provider";

const NOW = Date.parse("2026-11-27T12:00:00Z");
const base = (over: Partial<PaymentCharge>): PaymentCharge => ({
  id: "old", receivableId: "r1", clientId: "c1", provider: "asaas", providerChargeId: "pay_old", amount: 300,
  status: "pending", pixCopyPaste: "OLD", expiresAt: "2026-11-26T02:59:59Z", createdAt: "2026-11-20T00:00:00Z", updatedAt: "2026-11-20T00:00:00Z", ...over,
} as PaymentCharge);

/** Repositório em memória com o mesmo contrato do real: uma pendente por título; cancelar só se ainda pendente. */
function memory(initial: PaymentCharge[]) {
  const rows = [...initial];
  const repo = {
    listForReceivable: async () => [...rows].reverse(),
    findPendingForReceivable: async () => rows.find((c) => c.status === "pending") ?? null,
    getById: async (id: string) => rows.find((c) => c.id === id) ?? null,
    create: async (record: Partial<PaymentCharge>) => {
      if (rows.some((c) => c.status === "pending")) throw new PaymentChargeAlreadyPendingError();
      const created = { ...record, id: "new-" + rows.length, createdAt: "2026-11-27T12:00:00Z", updatedAt: "2026-11-27T12:00:00Z" } as PaymentCharge;
      rows.push(created);
      return created;
    },
    update: async (id: string, changes: Partial<PaymentCharge>) => {
      const row = rows.find((c) => c.id === id);
      if (!row) throw new Error("not found");
      if (changes.status === "cancelled" && row.status !== "pending") throw new Error("Cobrança mudou durante a operação.");
      Object.assign(row, changes);
      return row;
    },
  } as unknown as PaymentChargeRepository;
  return { rows, repo };
}

function gateway(options: { cancel?: "ok" | "fail"; remote?: "paid" | "cancelled" | "pending" | "throw"; createFails?: boolean } = {}) {
  const calls = { cancel: [] as string[], get: [] as string[], create: 0 };
  const provider: PixProvider = {
    async createCharge() {
      calls.create += 1;
      if (options.createFails) throw new Error("timeout");
      return { provider: "asaas", providerChargeId: "pay_new", pixCopyPaste: "NEW", expiresAt: "2026-12-03T02:59:59Z", status: "pending" };
    },
    async getCharge(id) {
      calls.get.push(id);
      if (options.remote === "throw") throw new Error("down");
      return { provider: "asaas", providerChargeId: id, pixCopyPaste: "", status: options.remote ?? "cancelled" };
    },
    async cancelCharge(id) {
      calls.cancel.push(id);
      if (options.cancel === "fail") throw new Error("timeout");
    },
  };
  return { provider, calls };
}
const input = { receivableId: "r1", clientId: "c1", amount: 300, now: NOW };

test("Pix expirado: cancela a anterior no provedor, preserva histórico e emite a substituta uma vez", async () => {
  const { rows, repo } = memory([base({})]);
  const { provider, calls } = gateway();
  const result = await new PaymentChargeService(repo, provider, true).renewExpiredPixCharge(input);
  assert.equal(result.kind, "created");
  assert.deepEqual(calls.cancel, ["pay_old"]);
  assert.equal(calls.create, 1);
  const old = rows.find((c) => c.id === "old")!;
  assert.equal(old.status, "cancelled");
  assert.equal(old.providerChargeId, "pay_old", "referência do gateway preservada");
  assert.equal(old.cancellationReason, "renovacao_solicitada_pelo_cliente");
  assert.equal(old.cancelledByProfileId, undefined, "sem identidade administrativa emprestada");
  assert.equal(rows.filter((c) => c.status === "pending").length, 1);
});

test("cobrança ainda vigente é reaproveitada: nada é cancelado nem criado", async () => {
  const { repo } = memory([base({ expiresAt: "2026-12-01T02:59:59Z" })]);
  const { provider, calls } = gateway();
  const result = await new PaymentChargeService(repo, provider, true).renewExpiredPixCharge(input);
  assert.equal(result.kind, "reused");
  assert.deepEqual([calls.cancel.length, calls.get.length, calls.create], [0, 0, 0]);
});

test("pagamento tardio: o provedor já recebeu, nenhuma substituta é emitida e o webhook confirma", async () => {
  const { rows, repo } = memory([base({})]);
  const { provider, calls } = gateway({ cancel: "fail", remote: "paid" });
  const result = await new PaymentChargeService(repo, provider, true).renewExpiredPixCharge(input);
  assert.equal(result.kind, "paid_pending_confirmation");
  assert.equal(calls.create, 0);
  assert.equal(rows.find((c) => c.id === "old")!.status, "pending", "mantida para o webhook baixar");
});

test("timeout no cancelamento: só prossegue com prova de cancelamento; senão recusa com segurança", async () => {
  for (const [remote, expected] of [["cancelled", "created"], ["pending", "unsafe"], ["throw", "unsafe"]] as const) {
    const { repo } = memory([base({})]);
    const { provider, calls } = gateway({ cancel: "fail", remote });
    const result = await new PaymentChargeService(repo, provider, true).renewExpiredPixCharge(input);
    assert.equal(result.kind, expected, remote);
    assert.equal(calls.create, expected === "created" ? 1 : 0, "nunca emite sem provar que a anterior não pode ser paga");
  }
});

test("reserva ambígua (sem ID remoto) nunca é substituída", async () => {
  const { repo } = memory([base({ providerChargeId: undefined })]);
  const { provider, calls } = gateway();
  const result = await new PaymentChargeService(repo, provider, true).renewExpiredPixCharge(input);
  assert.deepEqual(result, { kind: "unsafe", reason: "ambiguous_reservation" });
  assert.deepEqual([calls.cancel.length, calls.create], [0, 0]);
});

test("renovações concorrentes convergem para uma única cobrança pendente", async () => {
  const { rows, repo } = memory([base({})]);
  const { provider, calls } = gateway();
  const service = new PaymentChargeService(repo, provider, true);
  const results = await Promise.all([service.renewExpiredPixCharge(input), service.renewExpiredPixCharge(input), service.renewExpiredPixCharge(input)]);
  assert.equal(rows.filter((c) => c.status === "pending").length, 1);
  assert.equal(calls.create, 1, "uma só emissão remota");
  assert.ok(results.every((r) => r.kind === "created" || r.kind === "reused"));
  const pendingIds = new Set(results.map((r) => (r.kind === "created" || r.kind === "reused") ? r.charge.id : ""));
  assert.equal(pendingIds.size, 1, "todos recebem a mesma cobrança");
});

test("falha ao emitir a substituta (gateway): erro propagado, anterior já cancelada, nova tentativa não duplica", async () => {
  const { rows, repo } = memory([base({})]);
  const failing = gateway({ createFails: true });
  const service = new PaymentChargeService(repo, failing.provider, true);
  await assert.rejects(() => service.renewExpiredPixCharge(input), /timeout/);
  // A reserva ficou gravada (ambígua): a próxima tentativa não emite outra.
  const reserved = rows.filter((c) => c.status === "pending");
  assert.equal(reserved.length, 1);
  const again = await service.renewExpiredPixCharge(input);
  assert.equal(failing.calls.create, 1);
  assert.equal(again.kind === "unsafe" || again.kind === "reused", true);
});

test("sem cobrança anterior ou anterior cancelada/paga parcial: emite normalmente; histórico intacto", async () => {
  for (const history of [[], [base({ status: "cancelled" })], [base({ status: "paid", paidAt: "2026-11-20T00:00:00Z" })]]) {
    const { rows, repo } = memory(history);
    const { provider, calls } = gateway();
    const result = await new PaymentChargeService(repo, provider, true).renewExpiredPixCharge(input);
    assert.equal(result.kind, "created");
    assert.equal(calls.cancel.length, 0);
    assert.equal(rows.length, history.length + 1, "nada apagado");
  }
});

test("cobrança local 'expired' também é cancelada no provedor antes da substituta", async () => {
  const { rows, repo } = memory([base({ status: "expired" })]);
  const { provider, calls } = gateway();
  const result = await new PaymentChargeService(repo, provider, true).renewExpiredPixCharge(input);
  assert.equal(result.kind, "created");
  assert.deepEqual(calls.cancel, ["pay_old"]);
  assert.equal(rows.find((c) => c.id === "old")!.status, "expired", "histórico preservado");
});
