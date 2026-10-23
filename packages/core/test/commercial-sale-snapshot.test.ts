import assert from "node:assert/strict";
import test from "node:test";
import type { CommercialSale } from "@ir/types";
import type { CommercialSaleRepository, NewCommercialSaleRecord } from "../src/comercial/commercial-sale-repository";
import {
  CommercialSaleService,
  CommercialSaleSnapshotLockedError,
  CommercialSaleValidationError,
} from "../src/comercial/commercial-sale-service";

function fixture() {
  let stored: CommercialSale | null = null;
  const repository = {
    async create(record: NewCommercialSaleRecord): Promise<CommercialSale> {
      stored = structuredClone({
        ...record,
        id: "venda-1", reference: "IR-COM-1",
        createdAt: "2026-10-22T10:00:00Z", updatedAt: "2026-10-22T10:00:00Z",
      });
      return structuredClone(stored);
    },
    async getById() { return stored ? structuredClone(stored) : null; },
    async update(_id: string, changes: Partial<NewCommercialSaleRecord>) {
      if (!stored) throw new Error("Venda ausente");
      stored = { ...stored, ...structuredClone(changes) };
      return structuredClone(stored);
    },
  } as unknown as CommercialSaleRepository;
  return { service: new CommercialSaleService(repository) };
}

const items = [
  { sourceProposalItemId: "item-led", productId: "led-1", productName: "Painel LED",
    serviceChannel: "led_panel" as const, description: "Tela de Praia Grande",
    quantity: 1, unitPrice: 600, discountAmount: 0, totalAmount: 600, sortOrder: 0 },
  { sourceProposalItemId: "item-jornal", productId: "imp-1", productName: "Meia pagina",
    serviceChannel: "newspaper" as const, description: "Quatro edicoes do jornal",
    quantity: 4, unitPrice: 200, discountAmount: 100, totalAmount: 700, sortOrder: 1 },
];

const base = {
  clientId: "cliente-1", proposalId: "proposta-1", channel: "Pacote de serviços",
  description: "LED + impresso", startDate: "2026-10-22", amount: 1300,
  commercialCondition: "cash" as const, installmentsCount: 1,
};

test("conversao preserva todos os servicos e os respectivos valores", async () => {
  const { service } = fixture();
  const sale = await service.register({ ...base, itemsSnapshot: structuredClone(items) });
  assert.equal(sale.itemsSnapshot?.length, 2);
  assert.equal(sale.itemsSnapshot?.[0].serviceChannel, "led_panel");
  assert.equal(sale.itemsSnapshot?.[1].discountAmount, 100);
  assert.equal(sale.amount, 1300);
});

test("nao aceita valor divergente da soma dos itens", async () => {
  const { service } = fixture();
  await assert.rejects(
    service.register({ ...base, amount: 1000, itemsSnapshot: structuredClone(items) }),
    CommercialSaleValidationError,
  );
});

test("bloqueia mudanca dos termos congelados, mas permite observacoes", async () => {
  const { service } = fixture();
  await service.register({ ...base, itemsSnapshot: structuredClone(items) });
  await assert.rejects(
    service.update("venda-1", { ...base, amount: 1400 }),
    CommercialSaleSnapshotLockedError,
  );
  const updated = await service.update("venda-1", { ...base, notes: "Contato atualizado." });
  assert.equal(updated.notes, "Contato atualizado.");
  assert.deepEqual(updated.itemsSnapshot, items);
});
