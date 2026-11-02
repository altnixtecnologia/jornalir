import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Client, CommercialProposalWithItems, CommercialSale } from "@ir/types";
import {
  CommercialProposalService,
  CommercialSaleService,
  type CommercialProposalRepository,
  type NewCommercialProposalRecord,
  type CommercialSaleRepository,
  type NewCommercialSaleRecord,
} from "@ir/core";
import { qualifyCommercialClient } from "../src/lib/contracts/commercialQualification";
import { missingCommercialLegalParties } from "../src/lib/contracts/commercialPartyRequirements";
import { renderCommercialLegalDraft } from "../src/lib/contracts/commercialLegalDraft";
import { buildCommercialContractPreview, type CommercialServiceForPreview } from "../src/lib/contracts/commercialContractPreview";
import { commercialDocumentAmount } from "../src/lib/contracts/commercialDocumentAmount";
import { normalizeCommercialSigners } from "../src/lib/contracts/commercialSigners";

/**
 * Bloco 4 — Homologação integrada (01/11/2026), Fluxos 3, 4 e 5:
 * "Publicidade → proposta → venda → contrato", "Pacotes mistos →
 * valores individuais → contratação" e "Modelos de contrato → PDF →
 * assinatura eletrônica simulada", todos juntos numa única cadeia real
 * (packages/core + apps/sistema, repositórios fake, minuta REAL do
 * Bloco 3 lida do seed — nunca uma cópia). Pacote com dois serviços de
 * canais diferentes (LED + jornal impresso), documento COMBINADO.
 */
function readCombinedMinuta(): { content: string; variables: Array<{ key: string; label: string; required: boolean }> } {
  const sql = readFileSync(
    new URL("../../../supabase/migrations/20261101110000_contract_templates_seed_minutas.sql", import.meta.url),
    "utf8",
  );
  const re = /'commercial_combined',\s*\n\s*(\$[a-zA-Z_]*\$)([\s\S]*?)\1,\s*\n\s*'(\[[\s\S]*?\])'::jsonb/;
  const match = sql.match(re);
  if (!match) throw new Error("Minuta de categoria 'commercial_combined' não encontrada no seed do Bloco 3.");
  return { content: match[2], variables: JSON.parse(match[3]) };
}

const CLIENT: Client = {
  id: "cliente-1",
  reference: "IR-CLI-1",
  kind: "company",
  status: "active",
  companyName: "Mercado Bom Preço Ltda",
  responsibleName: "João Pedro Alves",
  responsibleCpf: "22233344405",
  cnpj: "23970969000190",
  whatsapp: "48988887777",
  email: "contato@mercadobompreco.invalid",
  address: { zip: "88960000", street: "Av. Central", number: "500", neighborhood: "Centro", city: "São João do Sul", state: "SC" },
  createdAt: "2026-11-01T10:00:00Z",
  updatedAt: "2026-11-01T10:00:00Z",
} as Client;

function fakeProposalRepository(): { repository: CommercialProposalRepository; rows: Map<string, CommercialProposalWithItems> } {
  const rows = new Map<string, CommercialProposalWithItems>();
  let n = 0;
  const repository: CommercialProposalRepository = {
    async list() { return [...rows.values()]; },
    async getById(id) { return rows.get(id) ?? null; },
    async getWithItems(id) { return rows.get(id) ?? null; },
    async createWithItems(record: NewCommercialProposalRecord, items) {
      n += 1;
      const proposal: CommercialProposalWithItems = {
        id: `proposta-${n}`, reference: `IR-PROP-${n}`, status: "draft",
        createdAt: "2026-11-01T10:00:00Z", updatedAt: "2026-11-01T10:00:00Z",
        ...record,
        items: items.map((item, i) => ({ ...item, id: `item-${n}-${i}`, proposalId: `proposta-${n}`, createdAt: "2026-11-01T10:00:00Z" })),
      };
      rows.set(proposal.id, proposal);
      return structuredClone(proposal);
    },
    async replaceItems(proposalId, items) {
      const current = rows.get(proposalId)!;
      const updated = { ...current, items: items.map((item, i) => ({ ...item, id: `item-${proposalId}-${i}`, proposalId, createdAt: current.createdAt })) };
      rows.set(proposalId, updated);
      return structuredClone(updated);
    },
    async update(id, changes) {
      const current = rows.get(id)!;
      const updated = { ...current, ...changes } as CommercialProposalWithItems;
      rows.set(id, updated);
      return structuredClone(updated);
    },
  };
  return { repository, rows };
}

function fakeSaleRepository(): CommercialSaleRepository {
  const rows = new Map<string, CommercialSale>();
  let n = 0;
  return {
    async list() { return [...rows.values()]; },
    async getById(id) { return rows.get(id) ?? null; },
    async create(record: NewCommercialSaleRecord) {
      n += 1;
      const sale = { id: `venda-${n}`, reference: `IR-COM-${n}`, createdAt: "2026-11-01T10:00:00Z", updatedAt: "2026-11-01T10:00:00Z", ...record } as CommercialSale;
      rows.set(sale.id, sale);
      return sale;
    },
    async update(id, changes) {
      const current = rows.get(id)!;
      const updated = { ...current, ...changes } as CommercialSale;
      rows.set(id, updated);
      return updated;
    },
  };
}

test("Fluxos 3+4+5: proposta com 2 serviços de canais diferentes → aprovada → venda (valores individuais preservados) → marcada convertida → documento combinado renderizado com a minuta REAL → pronto para assinatura (signatários validados)", async () => {
  const { repository: proposalRepo } = fakeProposalRepository();
  const proposalService = new CommercialProposalService(proposalRepo);
  const saleService = new CommercialSaleService(fakeSaleRepository());

  // 1) Proposta com DOIS serviços de canais diferentes — pacote misto.
  const proposal = await proposalService.register({
    clientId: CLIENT.id,
    proposalDate: "2026-11-01",
    commercialCondition: "cash",
    items: [
      { description: "Painel LED — Praia Grande, 15 dias", quantity: 1, unitPrice: 600, discountAmount: 0 },
      { description: "Meia página impressa, 4 edições", quantity: 4, unitPrice: 200, discountAmount: 100 },
    ],
  });
  assert.equal(proposal.items.length, 2);
  const ledItem = proposal.items[0];
  const printItem = proposal.items[1];

  // 2) Aprovação humana antes de qualquer venda — igual ao pedido do Bloco 3 (conferência humana).
  await proposalService.changeStatus(proposal.id, "approved");

  // 3) Venda criada a partir da proposta — valores individuais de CADA
  // serviço preservados (nunca recalculados), total nunca dividido
  // automaticamente (o service já rejeita se não bater com a soma).
  const itemsSnapshot = [
    { sourceProposalItemId: ledItem.id, productName: "Painel LED", serviceChannel: "led_panel" as const,
      description: ledItem.description, quantity: ledItem.quantity, unitPrice: ledItem.unitPrice,
      discountAmount: ledItem.discountAmount, totalAmount: ledItem.quantity * ledItem.unitPrice - ledItem.discountAmount, sortOrder: 0 },
    { sourceProposalItemId: printItem.id, productName: "Publicidade impressa", serviceChannel: "newspaper" as const,
      description: printItem.description, quantity: printItem.quantity, unitPrice: printItem.unitPrice,
      discountAmount: printItem.discountAmount, totalAmount: printItem.quantity * printItem.unitPrice - printItem.discountAmount, sortOrder: 1 },
  ];
  const totalAmount = itemsSnapshot.reduce((sum, item) => sum + item.totalAmount, 0);
  const sale = await saleService.register({
    clientId: CLIENT.id,
    proposalId: proposal.id,
    itemsSnapshot,
    channel: "package",
    description: "LED + impresso",
    startDate: "2026-11-01",
    amount: totalAmount,
    commercialCondition: "cash",
    installmentsCount: 1,
  });
  assert.equal(sale.itemsSnapshot?.[0].totalAmount, 600, "valor do serviço LED preservado, sem recalcular");
  assert.equal(sale.itemsSnapshot?.[1].totalAmount, 700, "valor do serviço impresso preservado, sem recalcular");
  assert.equal(sale.amount, 1300, "total da venda é a soma real dos itens, nunca inventado");

  // Divergência proposital: tentar registrar outra venda cujo total não bate com a soma dos itens — tem que ser rejeitado.
  await assert.rejects(() => saleService.register({
    clientId: CLIENT.id, proposalId: proposal.id, itemsSnapshot,
    channel: "package", description: "LED + impresso", startDate: "2026-11-01",
    amount: 999, commercialCondition: "cash", installmentsCount: 1,
  }), /soma dos serviços/);

  // 4) Vínculo proposta→venda — nunca duas vezes.
  const converted = await proposalService.markConverted(proposal.id, sale.id);
  assert.equal(converted.convertedSaleId, sale.id);
  await assert.rejects(() => proposalService.markConverted(proposal.id, "venda-outra"));

  // 5) Qualificação do cliente a partir do cadastro mestre — nunca campo livre.
  const qualification = qualifyCommercialClient(CLIENT);
  assert.deepEqual(qualification.missing, [], "cliente de teste deveria estar completo pra qualificação");

  // 6) Minuta REAL "commercial_combined" (lida do seed do Bloco 3).
  const { content, variables } = readCombinedMinuta();
  const declared = variables.map((v) => v.key);
  assert.deepEqual(missingCommercialLegalParties(content, declared), [], "a minuta combinada precisa passar a exigência real de qualificação da contratada");

  // 7) Anexo operacional REAL (dois serviços, canais diferentes, documento combinado).
  const services: Array<CommercialServiceForPreview & { id: string }> = [
    { id: "serv-1", item_ordinal: 0, service_title: "Painel LED", service_channel: "led_panel",
      source_snapshot: { totalAmount: 600, quantity: 1 }, starts_on: "2026-11-01", ends_on: "2026-11-15",
      service_location: "Praia Grande/RS, Av. Beira-Mar", service_scope: "Exibição de anúncio em painel LED", execution_conditions: null },
    { id: "serv-2", item_ordinal: 1, service_title: "Publicidade impressa", service_channel: "newspaper",
      source_snapshot: { totalAmount: 700, quantity: 4 }, starts_on: "2026-11-06", ends_on: "2026-11-27",
      service_location: null, service_scope: "Meia página impressa em 4 edições", execution_conditions: null },
  ];
  const preview = buildCommercialContractPreview(
    { reference: sale.reference, clientName: qualification.variables["cliente.nome"], amount: sale.amount, mode: "combined", services },
    { forLegalInstrument: true },
  );
  assert.deepEqual(preview.missing, [], "anexo operacional não deveria ter pendência com todos os campos preenchidos");

  const amount = commercialDocumentAmount("combined", sale.amount);
  assert.equal(amount, sale.amount, "documento combinado usa o valor TOTAL da venda, nunca dividido");

  // 8) Renderização final — nenhum placeholder sem resolver.
  const rendered = renderCommercialLegalDraft({
    templateText: content,
    reference: sale.reference,
    clientName: qualification.variables["cliente.nome"],
    totalPrice: amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
    document: preview.documents[0],
    qualification: qualification.variables,
    values: {
      "contratada.razao_social": "Informativo Regional Comunicação Ltda",
      "contratada.cnpj": "11222333000144",
      "contratada.endereco": "Rua da Redação, 10, Centro, São João do Sul/SC",
      "contratada.representante": "Carlos Henrique Jornal",
      forma_pagamento: "Pix",
      comarca_foro: "São João do Sul/SC",
    },
    requiredVariables: variables,
    final: true,
  });
  assert.deepEqual(rendered.missing, [], "documento final não deveria ter nenhum campo faltando com todos os valores fornecidos");
  assert.ok(rendered.text.includes(CLIENT.companyName!), "nome da contratante precisa aparecer no documento final");
  assert.ok(rendered.text.includes("Informativo Regional Comunicação Ltda"), "razão social da contratada precisa aparecer");
  assert.ok(!rendered.text.includes("{{"), "nenhum placeholder deveria sobrar sem resolver");

  // 9) Cadastro de signatários — pronto para o assinador (simulado, nunca envia convite real aqui).
  const signers = normalizeCommercialSigners([
    { role: "contratante", name: qualification.variables["cliente.nome"], email: CLIENT.email!, phone: CLIENT.whatsapp },
    { role: "contratada", name: "Carlos Henrique Jornal", email: "carlos@informativoregional.invalid" },
  ]);
  assert.equal(signers.length, 2);
  assert.ok(signers.some((s) => s.role === "contratante"));
  assert.ok(signers.some((s) => s.role === "contratada"));
});
