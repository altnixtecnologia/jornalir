import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Client, InstitutionalContract, Subscription, Receivable, ReceivableWithBalance } from "@ir/types";
import { ClientService, SubscriptionService, ContractService, ReceivableService, resolveTemplateVariables } from "@ir/core";
import type { ClientRepository, NewClientRecord } from "@ir/core";
import type { SubscriptionRepository, NewSubscriptionRecord } from "@ir/core";
import type { ContractRepository, NewContractRecord } from "@ir/core";
import type { ReceivableRepository, NewReceivableRecord } from "@ir/core";
import type { ClientCreditRepository } from "@ir/core";

/**
 * Bloco 4 — Homologação integrada (01/11/2026), Fluxo 2: "Assinatura do
 * jornal → contrato → financeiro". Simula a cadeia completa com os
 * SERVIÇOS reais (packages/core), repositórios fake em memória (ambiente
 * isolado, sem Supabase) e a minuta REAL de "assinatura anual" lida do
 * seed do Bloco 3 (nunca uma cópia da minuta) — confirma que os 4
 * módulos (cliente, assinatura, contrato institucional, financeiro)
 * ficam coerentemente ligados e que o documento final não tem nenhum
 * placeholder sem resolver.
 */
function readAssinaturasMinuta(): { content: string; } {
  const sql = readFileSync(
    new URL("../../../supabase/migrations/20261101110000_contract_templates_seed_minutas.sql", import.meta.url),
    "utf8",
  );
  const re = /'assinaturas',\s*\n\s*(\$[a-zA-Z_]*\$)([\s\S]*?)\1/;
  const match = sql.match(re);
  if (!match) throw new Error("Minuta de categoria 'assinaturas' não encontrada no seed do Bloco 3.");
  return { content: match[2] };
}

function fakeClientRepository(): ClientRepository {
  const rows = new Map<string, Client>();
  let n = 0;
  return {
    async list() { return [...rows.values()]; },
    async getById(id) { return rows.get(id) ?? null; },
    async create(record: NewClientRecord) {
      n += 1;
      const client = { id: `cliente-${n}`, reference: `IR-CLI-${n}`, createdAt: "2026-11-01T10:00:00Z", updatedAt: "2026-11-01T10:00:00Z", ...record } as Client;
      rows.set(client.id, client);
      return client;
    },
    async update(id, changes) {
      const current = rows.get(id)!;
      const updated = { ...current, ...changes } as Client;
      rows.set(id, updated);
      return updated;
    },
  };
}

function fakeSubscriptionRepository(): SubscriptionRepository {
  const rows = new Map<string, Subscription>();
  let n = 0;
  return {
    async list() { return [...rows.values()]; },
    async getById(id) { return rows.get(id) ?? null; },
    async create(record: NewSubscriptionRecord) {
      n += 1;
      const sub = { id: `assinatura-${n}`, reference: `IR-ASS-${n}`, createdAt: "2026-11-01T10:00:00Z", updatedAt: "2026-11-01T10:00:00Z", ...record } as Subscription;
      rows.set(sub.id, sub);
      return sub;
    },
    async update(id, changes) {
      const current = rows.get(id)!;
      const updated = { ...current, ...changes } as Subscription;
      rows.set(id, updated);
      return updated;
    },
  };
}

function fakeContractRepository(): ContractRepository {
  const rows = new Map<string, InstitutionalContract>();
  let n = 0;
  return {
    async list() { return [...rows.values()]; },
    async getById(id) { return rows.get(id) ?? null; },
    async create(record: NewContractRecord) {
      n += 1;
      const contract = { id: `contrato-${n}`, reference: `IR-CTR-${n}`, createdAt: "2026-11-01T10:00:00Z", updatedAt: "2026-11-01T10:00:00Z", ...record } as InstitutionalContract;
      rows.set(contract.id, contract);
      return contract;
    },
    async update(id, changes) {
      const current = rows.get(id)!;
      const updated = { ...current, ...changes } as InstitutionalContract;
      rows.set(id, updated);
      return updated;
    },
    async listDocuments() { return []; },
    async addDocument() { throw new Error("não usado neste teste"); },
    async listAmendments() { return []; },
    async addAmendment() { throw new Error("não usado neste teste"); },
    async listCommitmentOrders() { return []; },
    async addCommitmentOrder() { throw new Error("não usado neste teste"); },
  };
}

function fakeReceivableRepository(): ReceivableRepository {
  const rows = new Map<string, Receivable>();
  let n = 0;
  return {
    async list() { return []; },
    async getById(id) {
      const found = rows.get(id);
      return found ? ({ ...found, totalReceived: 0, totalReversed: 0, totalAdjustments: 0, balance: found.originalAmount } as ReceivableWithBalance) : null;
    },
    async create(record: NewReceivableRecord) {
      n += 1;
      const receivable = { id: `rec-${n}`, internalReference: `IR-REC-${n}`, status: "open", createdAt: "2026-11-01T10:00:00Z", updatedAt: "2026-11-01T10:00:00Z", ...record } as Receivable;
      rows.set(receivable.id, receivable);
      return receivable;
    },
    async update(id, changes) {
      const current = rows.get(id)!;
      const updated = { ...current, ...changes } as Receivable;
      rows.set(id, updated);
      return updated;
    },
    async findBySubscriptionAndCompetency(subscriptionId, competencyDate) {
      return [...rows.values()].find((r) => r.subscriptionId === subscriptionId && r.competencyDate === competencyDate) ?? null;
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
}

test("Fluxo 2 completo: cliente → assinatura → contrato institucional → minuta renderizada → financeiro, tudo coerentemente ligado", async () => {
  const clientService = new ClientService(fakeClientRepository());
  const subscriptionService = new SubscriptionService(fakeSubscriptionRepository());
  const contractService = new ContractService(fakeContractRepository());
  const fakeCreditRepository = {
    async list() { return []; },
    async getById() { return null; },
    async create() { throw new Error("não usado neste teste"); },
    async reverse() { throw new Error("não usado neste teste"); },
    async apply() { throw new Error("não usado neste teste"); },
  } as unknown as ClientCreditRepository;
  const receivableService = new ReceivableService(fakeReceivableRepository(), fakeCreditRepository);

  // 1) Cadastro único do cliente.
  const client = await clientService.register({
    kind: "individual",
    fullName: "Maria da Conceição Souza",
    cpf: "11144477735",
    whatsapp: "48999990000",
    email: "maria@exemplo.invalid",
    address: { zip: "88960000", street: "Rua das Palmeiras", number: "45", neighborhood: "Centro", city: "São João do Sul", state: "SC" },
  });

  // 2) Assinatura vinculada ao MESMO cliente.
  const subscription = await subscriptionService.register({
    clientId: client.id,
    serviceType: "impresso",
    amount: 180,
    periodicity: "annual",
    startsAt: "2026-11-01",
    print: { copies: 1, addressZip: client.address?.zip, addressStreet: client.address?.street, addressNumber: client.address?.number, addressNeighborhood: client.address?.neighborhood, addressCity: client.address?.city, addressState: client.address?.state },
  });
  assert.equal(subscription.clientId, client.id);

  // 3) Contrato institucional ligado ao MESMO cliente, objeto/valor coerentes com a assinatura.
  const contract = await contractService.register({
    clientId: client.id,
    object: "Assinatura anual do jornal impresso Informativo Regional",
    contractedAmount: subscription.amount,
    startsAt: subscription.startsAt,
    endsAt: "2027-10-31",
  });
  assert.equal(contract.clientId, client.id);
  assert.equal(contract.contractedAmount, subscription.amount);

  // 4) Minuta REAL (lida do seed do Bloco 3) renderizada com os dados reais do cliente/contrato.
  const { content } = readAssinaturasMinuta();
  const rendered = resolveTemplateVariables({
    content,
    variables: [
      { key: "periodicidade_entrega", label: "Periodicidade", required: true },
      { key: "forma_pagamento", label: "Forma de pagamento", required: true },
      { key: "aviso_renovacao_dias", label: "Aviso de renovação", required: true },
      { key: "aviso_rescisao_dias", label: "Aviso de rescisão", required: true },
      { key: "comarca_foro", label: "Comarca", required: true },
    ],
    client,
    contract,
    customValues: {
      periodicidade_entrega: "1 exemplar semanal, às quintas-feiras",
      forma_pagamento: "Pix",
      aviso_renovacao_dias: "30",
      aviso_rescisao_dias: "15",
      comarca_foro: "São João do Sul/SC",
    },
    generatedAt: new Date("2026-11-01T12:00:00Z"),
  });
  assert.deepEqual(rendered.missingRequired, [], "a minuta real não deveria ficar com nenhum campo obrigatório pendente");
  assert.ok(rendered.resolvedContent.includes("Maria da Conceição Souza"), "o nome do cliente precisa aparecer no documento final");
  assert.ok(rendered.resolvedContent.includes("R$"), "o valor contratado precisa aparecer formatado em R$");
  assert.ok(!rendered.resolvedContent.includes("{{"), "nenhum placeholder deveria sobrar sem resolver");

  // 5) Primeiro título financeiro da assinatura, vinculado à MESMA assinatura/cliente.
  const receivable = await receivableService.registerFromSubscription({
    clientId: client.id,
    description: "Assinatura anual do Informativo Regional",
    sourceType: "subscription",
    sourceId: subscription.id,
    subscriptionId: subscription.id,
    originalAmount: subscription.amount,
    issueDate: subscription.startsAt,
    dueDate: "2026-11-04",
    competencyDate: subscription.startsAt,
  });
  assert.equal(receivable.clientId, client.id);
  assert.equal(receivable.subscriptionId, subscription.id);
  assert.equal(receivable.originalAmount, subscription.amount);

  // 6) Tentar gerar o MESMO título de novo (ex.: operador clica duas vezes) — nunca duplica.
  await assert.rejects(() => receivableService.registerFromSubscription({
    clientId: client.id,
    description: "Assinatura anual do Informativo Regional",
    sourceType: "subscription",
    sourceId: subscription.id,
    subscriptionId: subscription.id,
    originalAmount: subscription.amount,
    issueDate: subscription.startsAt,
    dueDate: "2026-11-04",
    competencyDate: subscription.startsAt,
  }));
});
