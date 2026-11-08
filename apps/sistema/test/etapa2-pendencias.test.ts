import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Client, ContractTemplate } from "@ir/types";
import { buildCompositionDocument, type CompositionDeps, type CatalogProduct } from "../src/lib/contracts/compositionDocument";
import {
  buildNumberedServiceClauses,
  servicesFromSaleSnapshots,
  validateCompositionServices,
  type CompositionServiceInput,
} from "../src/lib/contracts/contractComposition";
import {
  buildContractorProfile,
  evaluateRepresentative,
  pickContractRepresentative,
  representativeOptions,
  type CompanyProfileRow,
  type LegalRepresentativeRow,
} from "../src/lib/contracts/contractorProfile";
import { finalizeInstitutionalContent, institutionalCompositionValues } from "../src/lib/contracts/institutionalComposition";
import { STAFF_MODULE_ACTIONS } from "../src/lib/permissions/staffPermissionsCatalog";
import { describeContractingPlan } from "../src/features/contratacao/compositionForm";
import { buildContractTemplatePdf } from "../src/lib/contracts/contractTemplatePdf";

// Etapa 2 — pendências funcionais: testes DIRECIONADOS às funcionalidades alteradas.

const root = join(__dirname, "..", "..", "..");
const read = (relative: string): string => readFileSync(join(root, relative), "utf8");
const code = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, "").split(/\r?\n/).filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("--")).join("\n");

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

// ----------------------------------------------------------- 5) representante

test("representante: vigência e poderes — ativo, futuro, vencido, inativo", () => {
  assert.equal(evaluateRepresentative(rep(), "2026-11-08").valid, true);
  assert.equal(evaluateRepresentative(rep({ powers_valid_from: "2026-12-01" }), "2026-11-08").valid, false);
  assert.equal(evaluateRepresentative(rep({ powers_valid_until: "2026-11-07" }), "2026-11-08").valid, false);
  assert.equal(evaluateRepresentative(rep({ powers_valid_until: "2026-11-08" }), "2026-11-08").valid, true, "o último dia ainda vale");
  assert.equal(evaluateRepresentative(rep({ active: false }), "2026-11-08").valid, false);
});

test("representante escolhido é usado SÓ ele; inválido não cai no padrão; sem escolha vale o padrão válido", () => {
  const reps = [rep(), rep({ id: "rep-2", full_name: "Beltrano", is_default: false })];
  assert.equal(pickContractRepresentative(reps, "2026-11-08", "rep-2").representative?.id, "rep-2");
  const expired = pickContractRepresentative([rep(), rep({ id: "rep-2", powers_valid_until: "2026-01-01", is_default: false })], "2026-11-08", "rep-2");
  assert.equal(expired.representative, undefined);
  assert.match(expired.invalid ?? "", /expiraram em 01\/01\/2026/);
  assert.match(pickContractRepresentative(reps, "2026-11-08", "nao-existe").invalid ?? "", /não está mais disponível/);
  assert.equal(pickContractRepresentative(reps, "2026-11-08").representative?.id, "rep-1");
});

test("perfil da contratada: representante escolhido aparece no cabeçalho; opções listam situação de vigência", () => {
  const profile = buildContractorProfile(COMPANY, [rep(), rep({ id: "rep-2", full_name: "Beltrano Silva", cpf: "11144477735", is_default: false })], "2026-11-08", "rep-2");
  assert.match(profile.variables["contratada.representante"], /Beltrano Silva/);
  assert.equal(profile.preferredInvalid, undefined);
  const options = representativeOptions([rep(), rep({ id: "rep-2", powers_valid_until: "2026-01-01", is_default: false }), rep({ id: "rep-3", active: false })], "2026-11-08");
  assert.equal(options.length, 2, "inativos nem aparecem");
  assert.deepEqual(options.map((option) => option.validNow), [true, false]);
  assert.match(options[1].reason ?? "", /expiraram/);
  const invalid = buildContractorProfile(COMPANY, [rep()], "2026-11-08", "rep-9");
  assert.ok(invalid.preferredInvalid);
  assert.equal(invalid.variables["contratada.representante"], undefined);
});

// ------------------------------------------------ 4) negociação menor/maior no snapshot

test("snapshot da venda: tabela preservada (listUnitPrice), negociado MAIOR e MENOR, justificativa, e itens antigos continuam corretos", () => {
  const entry = (snapshot: Record<string, unknown>) => ({
    service_title: "Anúncio", service_channel: "newspaper", source_snapshot: snapshot,
    starts_on: "2026-03-01", ends_on: "2026-05-31", service_location: null, service_scope: "Página inteira", execution_conditions: null,
  });
  const [above, below, legacy] = servicesFromSaleSnapshots([
    entry({ quantity: 2, unitPrice: 1200, listUnitPrice: 1000, negotiationReason: "Tiragem extra", discountAmount: 0, totalAmount: 2400 }),
    entry({ quantity: 2, unitPrice: 850, listUnitPrice: 1000, negotiationReason: "Cliente antigo", discountAmount: 0, totalAmount: 1700 }),
    entry({ quantity: 2, unitPrice: 1000, discountAmount: 200, totalAmount: 1800 }),
  ]);
  assert.deepEqual({ l: above.listUnitPrice, n: above.negotiatedUnitPrice, r: above.negotiationReason }, { l: 1000, n: 1200, r: "Tiragem extra" });
  assert.deepEqual({ l: below.listUnitPrice, n: below.negotiatedUnitPrice, r: below.negotiationReason }, { l: 1000, n: 850, r: "Cliente antigo" });
  assert.deepEqual({ l: legacy.listUnitPrice, n: legacy.negotiatedUnitPrice }, { l: 1000, n: 900 }, "antigo: tabela = unitPrice, desconto vira negociado");
  const text = buildNumberedServiceClauses([above]);
  assert.match(text, /acréscimo negociado de R\$\s?400,00/);
  assert.match(text, /Valor total deste serviço: R\$\s?2\.400,00 \(valor de tabela R\$\s?2\.000,00/);
});

test("assinatura do jornal na cláusula: tipo/exemplares; periodicidade obrigatória e recorrente", () => {
  const subscription: CompositionServiceInput = {
    kind: "subscription", title: "Assinatura anual", quantity: 1, listUnitPrice: 360, negotiatedUnitPrice: 360,
    startsOn: "2026-03-01", endsOn: "2027-02-28", periodicity: "annual", subscriptionServiceType: "impresso", copies: 3,
  };
  assert.match(buildNumberedServiceClauses([subscription]), /Tipo de assinatura: Impressa \(3 exemplares\)/);
  assert.match(buildNumberedServiceClauses([{ ...subscription, subscriptionServiceType: "digital", copies: undefined }]), /Tipo de assinatura: Digital/);
  assert.equal(validateCompositionServices([{ ...subscription, periodicity: undefined }]).ok, false);
  assert.equal(validateCompositionServices([{ ...subscription, periodicity: "single" }]).ok, false);
  assert.equal(validateCompositionServices([{ ...subscription, copies: 0 }]).ok, false);
});

// ------------------------------------------- minuta: permissão e representante (6: teste preservado)

const CLIENT = { id: "cli-1", kind: "company", companyName: "Exemplo Ltda", tradeName: "Exemplo", cnpj: "23970969000190", address: { street: "Rua X", number: "1", city: "C", state: "SC" } } as unknown as Client;
const PRODUCT: CatalogProduct = { id: "prod-1", name: "Anúncio", channel: "newspaper", suggestedPrice: 1000, active: true };
function testTemplate(): ContractTemplate {
  return { id: "tpl-1", groupId: "g", version: 1, title: "Contrato", content: "{{cliente.nome}}\n{{servicos.clausulas}}", variables: [], active: false, testEnabled: true, modality: "commercial", documentMode: "text", createdAt: "2026-11-01T00:00:00Z" };
}
function documentDeps(overrides: Partial<CompositionDeps> = {}, reps: LegalRepresentativeRow[] = [rep()]): CompositionDeps {
  return {
    loadClient: async () => CLIENT,
    loadTemplate: async () => testTemplate(),
    loadProducts: async () => [PRODUCT],
    loadContractor: async (today, id) => buildContractorProfile(COMPANY, reps, today, id),
    canNegotiateValues: async () => true,
    buildPdf: buildContractTemplatePdf,
    now: () => new Date("2026-11-08T12:00:00Z"),
    ...overrides,
  };
}
const line = (overrides: Partial<CompositionServiceInput> = {}): CompositionServiceInput => ({
  kind: "catalog", productId: "prod-1", title: "Anúncio", quantity: 1, listUnitPrice: 1000, negotiatedUnitPrice: 1000,
  startsOn: "2026-03-01", endsOn: "2026-05-31", periodicity: "monthly", ...overrides,
});

test("minuta: negociar acima/abaixo da tabela exige a permissão específica; sem negociação ela nem é exigida", async () => {
  let asked = 0;
  const denied = documentDeps({ canNegotiateValues: async () => { asked += 1; return false; } });
  const base = { clientId: "cli-1", modality: "commercial" as const, templateId: "tpl-1" };
  const below = await buildCompositionDocument({ ...base, services: [line({ negotiatedUnitPrice: 800, negotiationReason: "ajuste" })] }, denied);
  const above = await buildCompositionDocument({ ...base, services: [line({ negotiatedUnitPrice: 1300, negotiationReason: "ajuste" })] }, denied);
  assert.equal(below.ok || above.ok, false);
  const plain = await buildCompositionDocument({ ...base, services: [line()] }, denied);
  assert.equal(plain.ok, true);
  assert.equal(asked, 2, "só as duas minutas negociadas consultaram a permissão");
  const allowed = await buildCompositionDocument({ ...base, services: [line({ negotiatedUnitPrice: 1300, negotiationReason: "ajuste" })] }, documentDeps());
  assert.equal(allowed.ok && allowed.negotiation[0].adjustmentAmount, -300);
});

test("minuta: representante escolhido inválido bloqueia (sem trocar pelo padrão); válido aparece no documento; minuta de TESTE continua marcada e efêmera", async () => {
  const reps = [rep(), rep({ id: "rep-2", full_name: "Beltrano Silva", cpf: "11144477735", is_default: false }), rep({ id: "rep-3", powers_valid_until: "2026-01-01", is_default: false })];
  const base = { clientId: "cli-1", modality: "commercial" as const, templateId: "tpl-1", services: [line()] };
  const expired = await buildCompositionDocument({ ...base, representativeId: "rep-3" }, documentDeps({}, reps));
  assert.equal(expired.ok, false);
  if (!expired.ok) assert.match(expired.error, /expiraram/);
  const chosen = await buildCompositionDocument({ ...base, representativeId: "rep-2" }, documentDeps({}, reps));
  assert.equal(chosen.ok, true);
  if (chosen.ok) {
    assert.equal(chosen.marking, "MINUTA DE TESTE — SEM EFEITO CONTRATUAL");
    assert.equal(chosen.stage, "test");
  }
  const spyKeys = Object.keys(documentDeps()).sort();
  assert.ok(!spyKeys.some((key) => /create|save|persist|insert|archive/i.test(key)), "a minuta não tem como gravar");
});

// -------------------------------------------------------- institucional: documento

test("institucional: cláusulas 2.x e contratada entram no documento; modelo sem {{servicos.clausulas}} recebe o bloco ao final", () => {
  const contractor = buildContractorProfile(COMPANY, [rep()], "2026-11-08");
  const composition = { services: [line({ title: "Serviço A" }), line({ title: "Serviço B", negotiatedUnitPrice: 900, negotiationReason: "x y z w" })] };
  const values = institutionalCompositionValues(composition, contractor);
  assert.match(values["servicos.clausulas"], /2\.1 Serviço A/);
  assert.match(values["servicos.clausulas"], /2\.2 Serviço B/);
  assert.equal(values["contratada.cnpj"], "11.222.333/0001-81");
  const using = finalizeInstitutionalContent("Texto {{servicos.clausulas}} fim {{contratada.razao_social}}", "Texto {{servicos.clausulas}} fim {{contratada.razao_social}}", values);
  assert.equal(using.appendedClauses, false);
  assert.match(using.content, /Texto 2\. SERVIÇOS CONTRATADOS[\s\S]*fim Jornal Informativo Regional Ltda/);
  const notUsing = finalizeInstitutionalContent("Texto simples.", "Texto simples.", values);
  assert.equal(notUsing.appendedClauses, true);
  assert.match(notUsing.content, /Texto simples\.\n\n2\. SERVIÇOS CONTRATADOS/);
});

// ----------------------------------------------------------------- tela e estrutura

test("tela: resumo do que será criado nunca menciona ativação/cobrança como criada", () => {
  assert.deepEqual(describeContractingPlan("commercial", [{ kind: "catalog" }, { kind: "catalog" }, { kind: "subscription" }]), [
    "1 proposta comercial com 2 itens (valor de tabela e negociado preservados).",
    '1 assinatura do jornal em "pendente de formalização" (sem ativação e sem cobrança).',
  ]);
  assert.deepEqual(describeContractingPlan("institutional", [{ kind: "catalog" }, { kind: "other" }]), [
    "1 contrato institucional com 2 serviços (lista estruturada nos dados do contrato).",
  ]);
});

test("permissão valores_negociar: no catálogo (nunca padrão) e na CHECK recriada; o editor de usuários a lista sozinho", () => {
  const action = STAFF_MODULE_ACTIONS.find((item) => item.key === "valores_negociar");
  assert.ok(action);
  assert.equal(action.module, "publicidade");
  assert.equal("isDefault" in action && action.isDefault, false);
  assert.match(code(read("supabase/migrations/20261122190000_contract_composition_persistence.sql")), /'contratos_assinar', 'valores_negociar'\)/);
  assert.match(read("apps/sistema/src/features/usuarios/UsersManager.tsx"), /STAFF_MODULE_ACTIONS\.filter\(\(action\) => action\.module === mod\.key\)/);
});

test("migration 190000: só colunas ADITIVAS e nullable em tabelas existentes, índice de idempotência único parcial, sem DROP de dados", () => {
  const sql = code(read("supabase/migrations/20261122190000_contract_composition_persistence.sql"));
  assert.match(sql, /alter table public\.commercial_proposal_items\s+add column if not exists list_unit_price numeric\(12,2\)/);
  assert.match(sql, /alter table public\.commercial_proposals[\s\S]*composition_request_id uuid;/);
  assert.match(sql, /create unique index if not exists commercial_proposals_composition_request_id_key[\s\S]*where composition_request_id is not null/);
  assert.match(sql, /alter table public\.commercial_sales[\s\S]*contractor_representative_id uuid references public\.company_legal_representatives/);
  assert.doesNotMatch(sql, /drop table|drop column|truncate|delete from|update public\./i);
  assert.doesNotMatch(sql, /create table/i, "nenhuma estrutura paralela");
  assert.doesNotMatch(sql, /not null/i.test("") ? /x/ : /add column[^;]*\bnot null\b/i, "colunas novas são opcionais");
});

test("proposta → venda → pacote: preferências e tabela/justificativa seguem na conversão; painel só PRÉ-SELECIONA (não grava) e a emissão revalida o representante", () => {
  const conversion = code(read("apps/sistema/src/app/sistema/publicidade/propostas/[id]/actions.ts"));
  assert.match(conversion, /listUnitPrice: item\.listUnitPrice/);
  assert.match(conversion, /contractTemplateId: proposal\.contractTemplateId/);
  assert.match(conversion, /contractorRepresentativeId: proposal\.contractorRepresentativeId/);
  const panel = code(read("apps/sistema/src/features/comercial/CommercialContractPreparationPanel.tsx"));
  assert.match(panel, /suggested=\{preferredTemplateId\}/);
  assert.match(panel, /const \[choice, setChoice\] = useState\(selected \|\| suggestedOption\)/);
  assert.match(code(read("apps/sistema/src/app/sistema/publicidade/vendas/[id]/page.tsx")), /preferredTemplateId=\{sale\.contractTemplateId\}/);
  const issuance = code(read("apps/sistema/src/lib/contracts/commercialIssuance.ts"));
  assert.match(issuance, /loadContractorProfile\(supabase, [\s\S]*?sale\.contractorRepresentativeId\)/);
  assert.match(issuance, /if \(contractor\.preferredInvalid\) throw new Error\(contractor\.preferredInvalid\)/);
  assert.match(issuance, /!model\.active/, "a emissão continua exigindo modelo ativo: minuta de teste nunca vira documento real");
});

test("a montagem de contratação nunca gera cobrança, ativa assinatura, gera/assina documento ou envia mensagem", () => {
  for (const file of [
    "apps/sistema/src/lib/contracts/contractingPersistence.ts",
    "apps/sistema/src/app/sistema/publicidade/contratacao/actions.ts",
    "apps/sistema/src/lib/contracts/institutionalComposition.ts",
  ]) {
    const source = code(read(file));
    assert.doesNotMatch(source, /receivables|payment_charge|nfse|activateSubscription|assinaturas_ativar|commercial_signature|contract_signature|whatsapp|sendEmail|telegram|\.storage\b/i, file);
    assert.doesNotMatch(source, /status:\s*"active"/, `${file}: nada nasce ativo`);
  }
});
