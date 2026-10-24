import test from "node:test";
import assert from "node:assert/strict";
import type { PaymentCharge } from "@ir/types";
import { PaymentChargeAlreadyPendingError, type PaymentChargeRepository } from "../src/financeiro/payment-charge-repository";
import { PaymentChargeService } from "../src/financeiro/payment-charge-service";
import type { PixProvider } from "../src/financeiro/pix-provider";

test("dois cliques simultâneos reservam apenas um Pix antes do POST no Asaas", async () => {
  let posted = 0;
  let pending: PaymentCharge | null = null;
  const repo = {
    findPendingForReceivable: async () => pending,
    create: async (record: object) => {
      if (pending) throw new PaymentChargeAlreadyPendingError();
      pending = { ...record, id: "charge-1", createdAt: "2026-10-24", updatedAt: "2026-10-24" } as PaymentCharge;
      return pending;
    },
    update: async (_id: string, update: object) => {
      pending = { ...pending!, ...update } as PaymentCharge;
      return pending;
    },
  } as unknown as PaymentChargeRepository;
  const provider = {
    createCharge: async () => {
      posted++;
      return { provider: "asaas" as const, providerChargeId: "pay_1", status: "pending" as const, pixCopyPaste: "valid-qr" };
    },
    cancelCharge: async () => {},
    getCharge: async () => { throw new Error("not used"); },
  } satisfies PixProvider;
  const svc = new PaymentChargeService(repo, provider, true);
  const input = { receivableId: "r1", clientId: "c1", amount: 100 };
  const results = await Promise.allSettled([svc.createPixCharge(input), svc.createPixCharge(input)]);
  assert.equal(results.filter(x => x.status === "fulfilled").length, 1);
  assert.equal(results.filter(x => x.status === "rejected").length, 1);
  assert.equal(posted, 1);
  assert.equal(pending?.providerChargeId, "pay_1");
});

test("timeout após reserva bloqueia reenvio e cancelamento sem conciliação", async () => {
  let posted = 0;
  let pending: PaymentCharge | null = null;
  const repo = {
    findPendingForReceivable: async () => pending,
    create: async (record: object) => {
      pending = { ...record, id: "reserved", createdAt: "2026-10-24", updatedAt: "2026-10-24" } as PaymentCharge;
      return pending;
    },
    getById: async () => pending,
    update: async () => { throw new Error("not used"); },
  } as unknown as PaymentChargeRepository;
  const provider = {
    createCharge: async () => { posted++; throw new Error("timeout Asaas"); },
    cancelCharge: async () => {},
    getCharge: async () => { throw new Error("not used"); },
  } satisfies PixProvider;
  const svc = new PaymentChargeService(repo, provider, true);
  const input = { receivableId: "r1", clientId: "c1", amount: 100 };
  await assert.rejects(svc.createPixCharge(input), /timeout Asaas/);
  await assert.rejects(svc.createPixCharge(input), /concilia/);
  await assert.rejects(svc.cancelPixCharge("reserved", {
    cancelledByProfileId: "u1", cancellationReason: "Pedido do cliente registrado"
  }), /concilia/);
  assert.equal(posted, 1);
  assert.equal(pending?.providerChargeId, undefined);
});
