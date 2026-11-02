import test from "node:test";
import assert from "node:assert/strict";
import type { CommercialProposal, CommercialProposalWithItems } from "@ir/types";
import {
  CommercialProposalService,
  CommercialProposalValidationError,
  CommercialProposalStatusTransitionError,
  CommercialProposalAlreadyConvertedError,
  type CommercialProposalInput,
} from "../src/comercial/commercial-proposal-service";
import { CommercialProposalNotFoundError, type CommercialProposalRepository, type NewCommercialProposalRecord } from "../src/comercial/commercial-proposal-repository";

/**
 * Bloco 4 (01/11/2026) — CommercialProposalService nunca tinha teste
 * nenhum (achado real, mesma categoria do achado em
 * receivable-subscription-duplicate-prevention.test.ts). Cobre
 * especialmente a proteção contra conversão duplicada
 * (markConverted/CommercialProposalAlreadyConvertedError) — item 7 do
 * Bloco 4 ("prevenção de cobranças/contratações duplicadas").
 */
function fixture(): { service: CommercialProposalService; rows: Map<string, CommercialProposalWithItems> } {
  const rows = new Map<string, CommercialProposalWithItems>();
  let counter = 0;
  const repository: CommercialProposalRepository = {
    async list() { return [...rows.values()]; },
    async getById(id: string) { return rows.get(id) ?? null; },
    async getWithItems(id: string) { return rows.get(id) ?? null; },
    async createWithItems(record: NewCommercialProposalRecord, items) {
      counter += 1;
      const proposal: CommercialProposalWithItems = {
        id: `proposta-${counter}`,
        reference: `IR-PROP-${counter}`,
        status: "draft",
        createdAt: "2026-11-01T10:00:00Z",
        updatedAt: "2026-11-01T10:00:00Z",
        ...record,
        items: items.map((item, i) => ({ ...item, id: `item-${counter}-${i}`, proposalId: `proposta-${counter}`, createdAt: "2026-11-01T10:00:00Z" })),
      };
      rows.set(proposal.id, proposal);
      return structuredClone(proposal);
    },
    async replaceItems(proposalId: string, items) {
      const current = rows.get(proposalId)!;
      const updated = { ...current, items: items.map((item, i) => ({ ...item, id: `item-${proposalId}-${i}`, proposalId, createdAt: current.createdAt })) };
      rows.set(proposalId, updated);
      return structuredClone(updated);
    },
    async update(id: string, changes) {
      const current = rows.get(id)!;
      const updated = { ...current, ...changes } as CommercialProposalWithItems;
      rows.set(id, updated);
      return structuredClone(updated) as CommercialProposal;
    },
  };
  return { service: new CommercialProposalService(repository), rows };
}

const baseInput: CommercialProposalInput = {
  clientId: "cliente-1",
  proposalDate: "2026-11-01",
  commercialCondition: "cash",
  items: [{ description: "Meia página impressa", quantity: 4, unitPrice: 200, discountAmount: 0 }],
};

test("register cria a proposta com status inicial draft e itens numerados", async () => {
  const { service } = fixture();
  const proposal = await service.register(baseInput);
  assert.equal(proposal.status, "draft");
  assert.equal(proposal.items.length, 1);
  assert.equal(proposal.items[0].sortOrder, 0);
});

test("register recusa proposta sem cliente, sem data ou sem itens", async () => {
  const { service } = fixture();
  await assert.rejects(() => service.register({ ...baseInput, clientId: "" }), CommercialProposalValidationError);
  await assert.rejects(() => service.register({ ...baseInput, proposalDate: "" }), CommercialProposalValidationError);
  await assert.rejects(() => service.register({ ...baseInput, items: [] }), CommercialProposalValidationError);
});

test("register recusa validade anterior à data da proposta e desconto maior que o subtotal do item", async () => {
  const { service } = fixture();
  await assert.rejects(
    () => service.register({ ...baseInput, validUntil: "2026-10-01" }),
    CommercialProposalValidationError,
  );
  await assert.rejects(
    () => service.register({ ...baseInput, items: [{ description: "Item", quantity: 1, unitPrice: 100, discountAmount: 200 }] }),
    CommercialProposalValidationError,
  );
});

test("changeStatus só permite as transições da tabela oficial — draft pode ir direto pra approved, mas nunca volta pra trás depois", async () => {
  const { service } = fixture();
  const proposal = await service.register(baseInput);
  // draft -> approved é permitido diretamente (tabela oficial: draft: [sent, approved, rejected, archived]).
  const approved = await service.changeStatus(proposal.id, "approved");
  assert.equal(approved.status, "approved");
  // A partir de approved, só archived é permitido — nunca volta pra draft/sent.
  await assert.rejects(() => service.changeStatus(proposal.id, "draft"), CommercialProposalStatusTransitionError);
  await assert.rejects(() => service.changeStatus(proposal.id, "sent"), CommercialProposalStatusTransitionError);
  const archived = await service.changeStatus(proposal.id, "archived");
  assert.equal(archived.status, "archived");
  // archived é estado final — nenhuma transição sai dele, nem de volta pra approved.
  await assert.rejects(() => service.changeStatus(proposal.id, "approved"), CommercialProposalStatusTransitionError);
});

test("markConverted só funciona em proposta aprovada, e NUNCA duas vezes — proteção real contra duplicar a venda da mesma proposta", async () => {
  const { service } = fixture();
  const proposal = await service.register(baseInput);
  // Ainda em draft — não pode converter.
  await assert.rejects(() => service.markConverted(proposal.id, "venda-1"), CommercialProposalValidationError);
  await service.changeStatus(proposal.id, "sent");
  await service.changeStatus(proposal.id, "approved");
  const converted = await service.markConverted(proposal.id, "venda-1");
  assert.equal(converted.convertedSaleId, "venda-1");
  // Segunda conversão da MESMA proposta (ex.: duplo clique no botão de
  // converter) precisa falhar — nunca gerar uma segunda venda vinculada.
  await assert.rejects(() => service.markConverted(proposal.id, "venda-2"), CommercialProposalAlreadyConvertedError);
});

test("duplicate cria um GRUPO/proposta independente, nunca reaproveita a referência nem o status da original", async () => {
  const { service } = fixture();
  const proposal = await service.register(baseInput);
  await service.changeStatus(proposal.id, "sent");
  const copy = await service.duplicate(proposal.id);
  assert.notEqual(copy.id, proposal.id);
  assert.equal(copy.status, "draft");
});

test("getById/getWithItems lançam erro de domínio (nunca null silencioso) para proposta inexistente", async () => {
  const { service } = fixture();
  await assert.rejects(() => service.getById("inexistente"), CommercialProposalNotFoundError);
  await assert.rejects(() => service.getWithItems("inexistente"), CommercialProposalNotFoundError);
});
