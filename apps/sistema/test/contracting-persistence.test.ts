import test from "node:test";
import assert from "node:assert/strict";
import type { ContractTemplate } from "@ir/types";
import {
  persistContracting,
  type ContractingDeps,
  type ContractingRequest,
  type PermissionKind,
  type ProposalCreateInput,
  type SubscriptionCreateInput,
  type ContractCreateInput,
} from "../src/lib/contracts/contractingPersistence";
import {
  buildContractorProfile,
  type CompanyProfileRow,
  type LegalRepresentativeRow,
} from "../src/lib/contracts/contractorProfile";
import type { CompositionServiceInput } from "../src/lib/contracts/contractComposition";
import type { CatalogProduct } from "../src/lib/contracts/compositionDocument";
import { readCompositionFromExtraData } from "../src/lib/contracts/institutionalComposition";

// Etapa 2 — pendências funcionais. Só dependências falsas: nada toca produção,
// gera cobrança, ativa assinatura, assina ou envia.

const REQUEST_ID = "11111111-2222-4333-8444-555555555555";
const CLIENT_ID = "cli-1";

const COMPANY: CompanyProfileRow = {
  legal_name: "Jornal Informativo Regional Ltda", trade_name: null, cnpj: "11222333000181", address_street: "Rua A", address_number: "1",
  address_complement: null, address_district: "Centro", address_city: "Cidade", address_state: "RS", address_zip: "97000000", email: null, phone: null,
};
function rep(overrides: Partial<LegalRepresentativeRow> = {}): LegalRepresentativeRow {
  return {
    id: "rep-1", full_name: "Fulano de Tal", cpf: "52998224725", role_title: "Sócio", nationality: "Brasileiro", representation_rule: "individual",
    powers_description: "Poderes plenos.", powers_valid_from: null, powers_valid_until: null, active: true, is_default: true, ...overrides,
  };
}

const PRODUCT: CatalogProduct = { id: "prod-1", name: "Anúncio de página inteira", channel: "newspaper", suggestedPrice: 1000, active: true };

function template(overrides: Partial<ContractTemplate> = {}): ContractTemplate {
  return {
    id: "tpl-1", groupId: "grp-1", version: 2, title: "Contrato combinado", content: "x", variables: [], active: true, testEnabled: false,
    modality: "commercial", documentMode: "text", createdAt: "2026-11-01T00:00:00Z", ...overrides,
  };
}

function catalogLine(overrides: Partial<CompositionServiceInput> = {}): CompositionServiceInput {
  return {
    kind: "catalog", productId: "prod-1", title: "Anúncio de página inteira", quantity: 2, listUnitPrice: 1000, negotiatedUnitPrice: 1000,
    startsOn: "2026-03-01", endsOn: "2026-05-31", periodicity: "monthly", ...overrides,
  };
}
function subscriptionLine(overrides: Partial<CompositionServiceInput> = {}): CompositionServiceInput {
  return {
    kind: "subscription", title: "Assinatura anual do jornal", quantity: 1, listUnitPrice: 360, negotiatedUnitPrice: 360,
    startsOn: "2026-03-01", endsOn: "2027-02-28", periodicity: "annual", subscriptionServiceType: "impresso", copies: 2, ...overrides,
  };
}

function request(overrides: Partial<ContractingRequest> = {}): ContractingRequest {
  return { requestId: REQUEST_ID, clientId: CLIENT_ID, modality: "commercial", services: [catalogLine(), subscriptionLine()], ...overrides };
}

interface Store {
  proposals: Map<string, { id: string; reference: string; input: ProposalCreateInput }>;
  subscriptions: Map<string, { id: string; reference: string; input: SubscriptionCreateInput }>;
  contracts: Map<string, { id: string; reference: string; input: ContractCreateInput }>;
  audits: Array<{ entityType: string; action: string; metadata: Record<string, unknown> }>;
  permissionCalls: PermissionKind[];
}

function setup(overrides: Partial<ContractingDeps> = {}, options: { denied?: PermissionKind[]; template?: ContractTemplate | null; representatives?: LegalRepresentativeRow[] } = {}) {
  const store: Store = { proposals: new Map(), subscriptions: new Map(), contracts: new Map(), audits: [], permissionCalls: [] };
  const deps: ContractingDeps = {
    checkPermission: async (kind) => {
      store.permissionCalls.push(kind);
      return options.denied?.includes(kind) ? `Sem permissão (${kind}).` : null;
    },
    loadProducts: async () => [PRODUCT],
    loadTemplate: async () => (options.template === undefined ? template() : options.template),
    loadContractor: async (today, representativeId) => buildContractorProfile(COMPANY, options.representatives ?? [rep()], today, representativeId),
    actorName: async () => "Maria",
    findProposal: async (requestId) => store.proposals.get(requestId) ?? null,
    createProposal: async (input) => {
      const row = { id: `prop-${store.proposals.size + 1}`, reference: `IR-PROP-${store.proposals.size + 1}`, input };
      store.proposals.set(input.requestId, row);
      return row;
    },
    findSubscription: async (requestId, itemIndex) => store.subscriptions.get(`${requestId}:${itemIndex}`) ?? null,
    createSubscription: async (input) => {
      const row = { id: `sub-${store.subscriptions.size + 1}`, reference: `IR-ASS-${store.subscriptions.size + 1}`, input };
      store.subscriptions.set(`${input.requestId}:${input.itemIndex}`, row);
      return row;
    },
    findContract: async (requestId) => store.contracts.get(requestId) ?? null,
    createContract: async (input) => {
      const row = { id: `ctr-${store.contracts.size + 1}`, reference: `IR-CTR-${store.contracts.size + 1}`, input };
      store.contracts.set(input.requestId, row);
      return row;
    },
    audit: async (entityType, _id, action, metadata) => {
      store.audits.push({ entityType, action, metadata });
    },
    now: () => new Date("2026-11-08T12:00:00Z"),
    ...overrides,
  };
  return { deps, store };
}

// ------------------------------------------------ 1) persistir todos os serviços

test("comercial: itens do catálogo → UMA proposta; assinatura do jornal → assinatura em pendente de formalização; nada além disso", async () => {
  const { deps, store } = setup();
  const result = await persistContracting(request(), deps);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.proposal?.created, true);
  assert.equal(result.subscriptions.length, 1);
  assert.equal(result.subscriptions[0].created, true);
  assert.equal(result.contract, undefined);

  const proposal = [...store.proposals.values()][0].input;
  assert.equal(proposal.items.length, 1);
  assert.equal(proposal.items[0].productId, "prod-1");
  assert.equal(proposal.contractModality, "commercial");
  assert.equal(proposal.requestId, REQUEST_ID);

  const subscription = [...store.subscriptions.values()][0].input;
  assert.equal(subscription.serviceType, "impresso");
  assert.equal(subscription.amount, 360);
  assert.equal(subscription.periodicity, "annual");
  assert.equal(subscription.copies, 2);
  assert.equal(subscription.requestId, REQUEST_ID);
  assert.equal(subscription.itemIndex, 1);
  assert.doesNotMatch(subscription.notes, /\[contratacao:/, "o vínculo não depende mais de texto em observações");
  assert.match(subscription.notes, /nenhuma cobrança ou ativação foi gerada/);
  assert.ok(!("status" in subscription), "o status nunca é informado: o serviço usa 'pendente de formalização'");
  assert.ok(store.audits.some((audit) => audit.entityType === "subscription" && audit.action === "create"));
  assert.ok(store.audits.some((audit) => audit.entityType === "commercial_proposal" && audit.action === "create"));
});

test("serviço avulso: vira item da MESMA proposta (sem product_id), com tabela e negociado preservados", async () => {
  const { deps, store } = setup();
  const other: CompositionServiceInput = { kind: "other", title: "Cobertura de evento", quantity: 2, listUnitPrice: 500, negotiatedUnitPrice: 450, negotiationReason: "Pacote", startsOn: "2026-04-10", endsOn: "2026-04-10", periodicity: "single" };
  const result = await persistContracting(request({ services: [catalogLine(), other] }), deps);
  assert.equal(result.ok, true);
  assert.equal(store.proposals.size, 1);
  assert.equal(store.subscriptions.size, 0);
  const items = [...store.proposals.values()][0].input.items;
  assert.equal(items.length, 2);
  assert.equal(items[1].productId, undefined);
  assert.equal(items[1].description, "Cobertura de evento");
  assert.equal(items[1].unitPrice, 450);
  assert.equal(items[1].listUnitPrice, 500);
  assert.equal(items[1].discountAmount, 0);
  assert.equal(items[1].negotiationReason, "Pacote");
});

test("só avulso (sem catálogo): cria a proposta e exige a permissão de propostas", async () => {
  const other: CompositionServiceInput = { kind: "other", title: "Serviço X", quantity: 1, listUnitPrice: 100, negotiatedUnitPrice: 100, startsOn: "2026-04-10", endsOn: "2026-04-10", periodicity: "single" };
  const denied = setup({}, { denied: ["proposal"] });
  const blocked = await persistContracting(request({ services: [other] }), denied.deps);
  assert.equal(blocked.ok, false);
  assert.equal(denied.store.proposals.size, 0);
  const allowed = setup();
  const ok = await persistContracting(request({ services: [other] }), allowed.deps);
  assert.equal(ok.ok, true);
  assert.equal(allowed.store.proposals.size, 1);
});

test("conflito de criação (outra aba/retry simultâneo): devolve o registro existente, sem duplicar e sem falhar", async () => {
  const racing = setup();
  const winner = await persistContracting(request(), racing.deps);
  assert.equal(winner.ok, true);
  // Simula a corrida: a checagem prévia não vê o registro, mas o índice único do banco recusa a inserção.
  let firstLookup = true;
  const deps: ContractingDeps = {
    ...racing.deps,
    findProposal: async (id) => (firstLookup ? ((firstLookup = false), null) : racing.deps.findProposal(id)),
    createProposal: async () => { throw new Error("duplicate key value violates unique constraint"); },
    findSubscription: (() => {
      let first = true;
      return async (requestId: string, index: number) => (first ? ((first = false), null) : racing.deps.findSubscription(requestId, index));
    })(),
    createSubscription: async () => { throw new Error("duplicate key value violates unique constraint"); },
  };
  const loser = await persistContracting(request(), deps);
  assert.equal(loser.ok, true);
  if (!loser.ok || !winner.ok) return;
  assert.equal(loser.proposal?.created, false);
  assert.equal(loser.proposal?.id, winner.proposal?.id);
  assert.equal(loser.subscriptions[0].created, false);
  assert.equal(racing.store.proposals.size, 1);
  assert.equal(racing.store.subscriptions.size, 1);
  assert.equal(racing.store.audits.filter((a) => a.action === "create").length, 2, "o perdedor não audita criação que não fez");
});

test("falha real (sem registro existente) continua sendo erro, não é engolida", async () => {
  const { deps } = setup({ createProposal: async () => { throw new Error("banco indisponível"); } });
  const result = await persistContracting(request({ services: [catalogLine()] }), deps);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /banco indisponível/);
});

test("assinatura precisa de periodicidade recorrente; digital não envia exemplares", async () => {
  const { deps, store } = setup();
  const single = await persistContracting(request({ services: [subscriptionLine({ periodicity: "single" })] }), deps);
  assert.equal(single.ok, false);
  const digital = await persistContracting(request({ services: [subscriptionLine({ subscriptionServiceType: "digital", copies: undefined })] }), deps);
  assert.equal(digital.ok, true);
  assert.equal([...store.subscriptions.values()][0].input.copies, undefined);
  assert.equal([...store.subscriptions.values()][0].input.serviceType, "digital");
});

// ------------------------------------------------------------- idempotência

test("repetir com o mesmo requestId (clique duplo/retry) NÃO duplica proposta nem assinatura", async () => {
  const { deps, store } = setup();
  const first = await persistContracting(request(), deps);
  const second = await persistContracting(request(), deps);
  assert.equal(first.ok && second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.equal(second.proposal?.created, false);
  assert.equal(second.subscriptions[0].created, false);
  assert.equal(second.proposal?.id, first.proposal?.id);
  assert.equal(store.proposals.size, 1);
  assert.equal(store.subscriptions.size, 1);
});

test("falha parcial: o que já foi criado fica, a falha é informada e o retry completa SEM duplicar", async () => {
  let failSubscription = true;
  const { deps, store } = setup({
    createSubscription: async (input) => {
      if (failSubscription) throw new Error("banco indisponível");
      const row = { id: "sub-1", reference: "IR-ASS-1", input };
      store.subscriptions.set(`${input.requestId}:${input.itemIndex}`, row);
      return row;
    },
  });
  const first = await persistContracting(request(), deps);
  assert.equal(first.ok, false);
  if (!first.ok) {
    assert.match(first.error, /não será duplicado/);
    assert.equal(first.proposal?.created, true);
  }
  assert.equal(store.proposals.size, 1);
  failSubscription = false;
  const retry = await persistContracting(request(), deps);
  assert.equal(retry.ok, true);
  if (retry.ok) {
    assert.equal(retry.proposal?.created, false);
    assert.equal(retry.subscriptions[0].created, true);
  }
  assert.equal(store.proposals.size, 1);
  assert.equal(store.subscriptions.size, 1);
});

// -------------------------------------------- 4) negociação menor OU maior

test("valor negociado MAIOR que a tabela: unitPrice = negociado, tabela preservada, desconto 0, total correto (sem desconto negativo)", async () => {
  const { deps, store } = setup();
  const result = await persistContracting(request({ services: [catalogLine({ quantity: 3, negotiatedUnitPrice: 1100.5, negotiationReason: "Pacote com tiragem extra" })] }), deps);
  assert.equal(result.ok, true);
  const item = [...store.proposals.values()][0].input.items[0];
  assert.equal(item.listUnitPrice, 1000);
  assert.equal(item.unitPrice, 1100.5);
  assert.equal(item.discountAmount, 0);
  assert.equal(item.negotiationReason, "Pacote com tiragem extra");
  assert.equal(Math.round(item.quantity * item.unitPrice * 100) / 100, 3301.5);
  if (result.ok) assert.equal(result.negotiation[0].adjustmentAmount, -301.5);
});

test("valor negociado MENOR que a tabela: unitPrice = negociado, tabela preservada, justificativa guardada", async () => {
  const { deps, store } = setup();
  await persistContracting(request({ services: [catalogLine({ negotiatedUnitPrice: 850, negotiationReason: "Cliente antigo" })] }), deps);
  const item = [...store.proposals.values()][0].input.items[0];
  assert.deepEqual({ list: item.listUnitPrice, unit: item.unitPrice, discount: item.discountAmount, reason: item.negotiationReason }, { list: 1000, unit: 850, discount: 0, reason: "Cliente antigo" });
  assert.match([...store.proposals.values()][0].input.internalNotes ?? "", /tabela R\$\s?1\.000,00 → negociado R\$\s?850,00/);
  assert.ok(store.audits.some((audit) => audit.action === "negotiated_values_recorded"));
});

test("sem negociação a justificativa não é gravada e a tabela vem do SERVIDOR, não do navegador", async () => {
  const { deps, store } = setup();
  await persistContracting(request({ services: [catalogLine({ listUnitPrice: 1, negotiatedUnitPrice: 1000, negotiationReason: "tentativa de adulterar a tabela" })] }), deps);
  const item = [...store.proposals.values()][0].input.items[0];
  assert.equal(item.listUnitPrice, 1000);
  assert.equal(item.negotiationReason, undefined);
  assert.ok(!store.audits.some((audit) => audit.action === "negotiated_values_recorded"));
});

test("permissão específica: negociar (acima OU abaixo) sem 'valores_negociar' é recusado ANTES de criar qualquer cadastro; sem negociação a permissão nem é exigida", async () => {
  const denied = setup({}, { denied: ["negotiate"] });
  const blocked = await persistContracting(request({ services: [catalogLine({ negotiatedUnitPrice: 1200, negotiationReason: "ajuste" })] }), denied.deps);
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.match(blocked.error, /Negociar valores/);
  assert.equal(denied.store.proposals.size, 0);
  const plain = setup({}, { denied: ["negotiate"] });
  const ok = await persistContracting(request({ services: [catalogLine()] }), plain.deps);
  assert.equal(ok.ok, true);
  assert.ok(!plain.store.permissionCalls.includes("negotiate"));
});

test("sem permissão de proposta/assinatura o respectivo cadastro NÃO é criado", async () => {
  const noProposal = setup({}, { denied: ["proposal"] });
  const r1 = await persistContracting(request(), noProposal.deps);
  assert.equal(r1.ok, false);
  assert.equal(noProposal.store.proposals.size, 0);
  const noSubscription = setup({}, { denied: ["subscription"] });
  const r2 = await persistContracting(request({ services: [subscriptionLine()] }), noSubscription.deps);
  assert.equal(r2.ok, false);
  assert.equal(noSubscription.store.subscriptions.size, 0);
});

// ---------------------------------------- 2) modelo vinculado / 6) teste preservado

test("modelo em PRODUÇÃO fica vinculado à proposta (e daí à venda/pacote); modelo em TESTE nunca é vinculado, só aviso", async () => {
  const production = setup();
  await persistContracting(request({ templateId: "tpl-1", services: [catalogLine()] }), production.deps);
  assert.equal([...production.store.proposals.values()][0].input.contractTemplateId, "tpl-1");

  const testing = setup({}, { template: template({ active: false, testEnabled: true }) });
  const result = await persistContracting(request({ templateId: "tpl-1", services: [catalogLine()] }), testing.deps);
  assert.equal(result.ok, true);
  assert.equal([...testing.store.proposals.values()][0].input.contractTemplateId, undefined);
  if (result.ok) assert.match(result.notices.join(" "), /NÃO foi vinculado/);
});

test("modelo de outra modalidade ou inexistente é recusado; contratação sem modelo continua possível", async () => {
  const wrong = setup({}, { template: template({ modality: "institutional" }) });
  assert.equal((await persistContracting(request({ templateId: "tpl-1" }), wrong.deps)).ok, false);
  const missing = setup({}, { template: null });
  assert.equal((await persistContracting(request({ templateId: "tpl-1" }), missing.deps)).ok, false);
  const none = setup();
  assert.equal((await persistContracting(request(), none.deps)).ok, true);
});

// ------------------------------------------------ 5) representante legal escolhido

test("representante ESCOLHIDO é registrado na proposta; inativo, removido ou com poderes vencidos/futuros bloqueia, sem trocar pelo padrão", async () => {
  const ok = setup({}, { representatives: [rep(), rep({ id: "rep-2", full_name: "Beltrano", is_default: false })] });
  const chosen = await persistContracting(request({ representativeId: "rep-2" }), ok.deps);
  assert.equal(chosen.ok, true);
  assert.equal([...ok.store.proposals.values()][0].input.contractorRepresentativeId, "rep-2");

  for (const [label, reps] of [
    ["inativo", [rep(), rep({ id: "rep-2", active: false, is_default: false })]],
    ["vencido", [rep(), rep({ id: "rep-2", powers_valid_until: "2026-06-30", is_default: false })]],
    ["futuro", [rep(), rep({ id: "rep-2", powers_valid_from: "2027-01-01", is_default: false })]],
    ["removido", [rep()]],
  ] as const) {
    const { deps, store } = setup({}, { representatives: [...reps] });
    const result = await persistContracting(request({ representativeId: "rep-2" }), deps);
    assert.equal(result.ok, false, label);
    assert.equal(store.proposals.size + store.subscriptions.size, 0, `${label}: nada criado`);
  }
});

// ------------------------------------------------------------------ 3) institucional

test("institucional: UM contrato com TODOS os serviços em extra_data, total/vigência corretos, auditado; nada de cobrança/assinatura/documento", async () => {
  const { deps, store } = setup({}, { template: template({ modality: "institutional" }) });
  const services: CompositionServiceInput[] = [
    catalogLine({ negotiatedUnitPrice: 900, negotiationReason: "Contrato anual" }),
    subscriptionLine(),
    { kind: "other", title: "Cobertura de evento", quantity: 1, listUnitPrice: 500, negotiatedUnitPrice: 500, startsOn: "2026-04-10", endsOn: "2026-04-10", periodicity: "single" },
  ];
  const result = await persistContracting(request({ modality: "institutional", templateId: "tpl-1", representativeId: "rep-1", services }), deps);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.contract?.created, true);
  assert.equal(store.proposals.size + store.subscriptions.size, 0, "institucional não cria proposta nem assinatura");
  const contract = [...store.contracts.values()][0].input;
  assert.equal(contract.contractedAmount, 2000 * 0.9 + 360 + 500);
  assert.equal(contract.startsAt, "2026-03-01");
  assert.equal(contract.endsAt, "2027-02-28");
  assert.match(contract.object, /^3 serviços: /);
  assert.equal(contract.extraData.templateId, "tpl-1");
  assert.equal(contract.extraData.representativeId, "rep-1");
  assert.equal(contract.extraData.compositionRequestId, REQUEST_ID);
  assert.equal((contract.extraData.services as unknown[]).length, 3);
  assert.deepEqual(store.permissionCalls.filter((kind) => kind !== "negotiate"), ["institutional_contract"]);
  assert.ok(store.audits.some((audit) => audit.entityType === "institutional_contract" && audit.action === "create"));
  assert.match(contract.notes, /Nenhuma cobrança, assinatura ou documento foi gerado/);
});

test("institucional: idempotente, exige a permissão de contratos e não vincula modelo em teste", async () => {
  const { deps, store } = setup({}, { template: template({ modality: "institutional", active: false, testEnabled: true }) });
  const base = request({ modality: "institutional", templateId: "tpl-1", services: [catalogLine()] });
  const first = await persistContracting(base, deps);
  const second = await persistContracting(base, deps);
  assert.equal(first.ok && second.ok, true);
  if (second.ok) assert.equal(second.contract?.created, false);
  assert.equal(store.contracts.size, 1);
  assert.equal([...store.contracts.values()][0].input.extraData.templateId, null);
  const denied = setup({}, { denied: ["institutional_contract"] });
  assert.equal((await persistContracting(base, denied.deps)).ok, false);
  assert.equal(denied.store.contracts.size, 0);
});

test("a lista estruturada gravada no contrato institucional é lida de volta (e revalidada) para gerar o documento", async () => {
  const { deps, store } = setup({}, { template: template({ modality: "institutional" }) });
  await persistContracting(request({ modality: "institutional", services: [catalogLine({ negotiatedUnitPrice: 900, negotiationReason: "Contrato anual" }), subscriptionLine()] }), deps);
  const extraData = [...store.contracts.values()][0].input.extraData;
  const composition = readCompositionFromExtraData(JSON.parse(JSON.stringify(extraData)));
  assert.ok(composition);
  assert.equal(composition.services.length, 2);
  assert.equal(composition.services[0].negotiatedUnitPrice, 900);
  assert.equal(composition.services[1].subscriptionServiceType, "impresso");
  assert.equal(readCompositionFromExtraData(undefined), null);
  assert.equal(readCompositionFromExtraData({ services: [{ title: "x" }] }), null, "dado inválido nunca vira documento");
});

test("identificadores inválidos e modalidade inválida são recusados sem criar nada", async () => {
  const { deps, store } = setup();
  assert.equal((await persistContracting(request({ requestId: "nao-e-uuid" }), deps)).ok, false);
  assert.equal((await persistContracting(request({ clientId: "" }), deps)).ok, false);
  assert.equal((await persistContracting(request({ modality: "outra" as "commercial" }), deps)).ok, false);
  assert.equal(store.proposals.size + store.subscriptions.size + store.contracts.size, 0);
});
