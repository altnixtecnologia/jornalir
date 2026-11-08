import test from "node:test";
import assert from "node:assert/strict";
import type { ContractTemplate } from "@ir/types";
import {
  buildNegotiationRecord,
  buildNumberedServiceClauses,
  checkTemplateForComposition,
  composeDocumentText,
  compositionTotals,
  computeServiceTotals,
  formatNegotiationNote,
  renderCompositionContent,
  servicesFromSaleSnapshots,
  validateCompositionServices,
  type CompositionServiceInput,
} from "../src/lib/contracts/contractComposition";
import {
  buildContracteeHeaderLines,
  buildContractorProfile,
  pickContractRepresentative,
  type CompanyProfileRow,
  type LegalRepresentativeRow,
} from "../src/lib/contracts/contractorProfile";
import { manualVariables, parseDecimal } from "../src/features/contratacao/compositionForm";

// Etapa 2 (08/11/2026): montagem de contratação. Núcleo puro — sem rede/banco.

function service(overrides: Partial<CompositionServiceInput> = {}): CompositionServiceInput {
  return {
    kind: "catalog",
    productId: "prod-1",
    title: "Anúncio de página inteira",
    channel: "newspaper",
    quantity: 3,
    listUnitPrice: 1000,
    negotiatedUnitPrice: 1000,
    startsOn: "2026-03-01",
    endsOn: "2026-05-31",
    periodicity: "monthly",
    ...overrides,
  };
}

function template(overrides: Partial<ContractTemplate> = {}): ContractTemplate {
  return {
    id: "tpl-1", groupId: "grp-1", version: 1, title: "Contrato combinado", content: "Contrato com {{cliente.nome}}.",
    variables: [], active: false, testEnabled: true, modality: "commercial", documentMode: "text", createdAt: "2026-11-01T00:00:00Z",
    ...overrides,
  };
}

// ------------------------------------------------------------ valores e totais

test("totais: preço de tabela preservado, negociado por item, desconto e acréscimo com arredondamento de centavos", () => {
  const discounted = computeServiceTotals(service({ negotiatedUnitPrice: 850 }));
  assert.deepEqual(discounted, { listTotal: 3000, negotiatedTotal: 2550, adjustmentAmount: 450, adjustmentPercent: 15, isNegotiated: true });
  const surcharge = computeServiceTotals(service({ negotiatedUnitPrice: 1100 }));
  assert.equal(surcharge.adjustmentAmount, -300);
  assert.equal(computeServiceTotals(service()).isNegotiated, false);
  const cents = computeServiceTotals(service({ quantity: 3, listUnitPrice: 33.33, negotiatedUnitPrice: 33.33 }));
  assert.equal(cents.negotiatedTotal, 99.99);
  const all = compositionTotals([service({ negotiatedUnitPrice: 850 }), service({ quantity: 1, listUnitPrice: 500, negotiatedUnitPrice: 500 })]);
  assert.deepEqual(all, { listTotal: 3500, negotiatedTotal: 3050, adjustmentAmount: 450 });
});

test("validação: exige serviços, justificativa quando o negociado difere da tabela, datas coerentes — erros citam o serviço", () => {
  assert.equal(validateCompositionServices([]).ok, false);
  const noReason = validateCompositionServices([service({ negotiatedUnitPrice: 900 })]);
  assert.equal(noReason.ok, false);
  if (!noReason.ok) assert.match(noReason.errors[0], /Serviço 1: informe a justificativa/);
  assert.equal(validateCompositionServices([service({ negotiatedUnitPrice: 900, negotiationReason: "Cliente antigo" })]).ok, true);
  const dates = validateCompositionServices([service(), service({ startsOn: "2026-06-10", endsOn: "2026-06-01" })]);
  assert.equal(dates.ok, false);
  if (!dates.ok) assert.match(dates.errors.join(" "), /Serviço 2: o término é anterior ao início/);
  assert.equal(validateCompositionServices([service({ startsOn: "2026-02-30" })]).ok, false);
  assert.equal(validateCompositionServices([service({ quantity: 0 })]).ok, false);
  assert.equal(validateCompositionServices([service({ listUnitPrice: -1 })]).ok, false);
  assert.equal(validateCompositionServices([service({ kind: "catalog", productId: undefined })]).ok, false);
  assert.equal(validateCompositionServices([service({ title: "ab" })]).ok, false);
  assert.equal(validateCompositionServices(Array.from({ length: 31 }, () => service())).ok, false);
});

// --------------------------------------------------------------------- cláusulas

test("cláusulas: 2. SERVIÇOS CONTRATADOS com 2.1, 2.2… por serviço, valores e vigências independentes", () => {
  const text = buildNumberedServiceClauses([
    service({ title: "Anúncio no jornal", negotiatedUnitPrice: 850, negotiationReason: "Fidelidade", startsOn: "2026-03-01", endsOn: "2026-05-31" }),
    service({ kind: "other", productId: undefined, channel: "led_panel", title: "Painel LED", quantity: 1, listUnitPrice: 2000, negotiatedUnitPrice: 2000, startsOn: "2026-03-01", endsOn: "2027-02-28", periodicity: "annual", renewalNote: "Renovação automática por igual período" }),
  ]);
  assert.match(text, /^2\. SERVIÇOS CONTRATADOS/);
  assert.match(text, /2\.1 Anúncio no jornal — Publicidade no jornal impresso/);
  assert.match(text, /2\.2 Painel LED — Publicidade em painel LED/);
  assert.match(text, /Valor unitário de tabela: R\$\s?1\.000,00 · Valor unitário negociado: R\$\s?850,00/);
  assert.match(text, /desconto negociado de R\$\s?450,00/);
  assert.match(text, /Justificativa do valor negociado: Fidelidade/);
  assert.match(text, /Vigência: 01\/03\/2026 a 31\/05\/2026/);
  assert.match(text, /Vigência: 01\/03\/2026 a 28\/02\/2027/);
  assert.match(text, /Periodicidade: Anual/);
  assert.match(text, /Renovação: Renovação automática por igual período/);
  assert.match(text, /2\.3 Valor total dos serviços: R\$\s?4\.550,00/);
  assert.match(text, /2\.4 Cada serviço acima tem vigência, valor e encerramento próprios\. O cancelamento ou o encerramento de um serviço não cancela os demais automaticamente/);
});

test("cláusulas: serviço sem negociação não mostra desconto nem justificativa; periodicidade opcional é omitida", () => {
  const text = buildNumberedServiceClauses([service({ periodicity: undefined })]);
  assert.doesNotMatch(text, /Justificativa|desconto|acréscimo|Periodicidade/);
  assert.match(text, /Valor unitário: R\$\s?1\.000,00/);
});

test("histórico de negociação: só itens diferentes da tabela, com tabela, negociado, ajuste e justificativa", () => {
  const entries = buildNegotiationRecord([
    service({ title: "A", negotiatedUnitPrice: 900, negotiationReason: "Volume" }),
    service({ title: "B" }),
  ]);
  assert.equal(entries.length, 1);
  assert.deepEqual(
    { title: entries[0].title, list: entries[0].listUnitPrice, negotiated: entries[0].negotiatedUnitPrice, adj: entries[0].adjustmentAmount, reason: entries[0].reason },
    { title: "A", list: 1000, negotiated: 900, adj: 300, reason: "Volume" },
  );
  const note = formatNegotiationNote(entries, "Maria", "2026-11-08T12:00:00Z");
  assert.match(note, /por Maria/);
  assert.match(note, /A: tabela R\$\s?1\.000,00 → negociado R\$\s?900,00/);
  assert.equal(formatNegotiationNote([], "Maria", "2026-11-08T12:00:00Z"), "");
});

test("snapshot da venda → cláusulas do documento OFICIAL com os mesmos valores (preço original = unitPrice; negociado = total ÷ quantidade)", () => {
  const services = servicesFromSaleSnapshots([{
    service_title: "Painel LED", service_channel: "led_panel",
    source_snapshot: { quantity: 2, unitPrice: 500, discountAmount: 100, totalAmount: 900 },
    starts_on: "2026-04-01", ends_on: "2026-06-30", service_location: "Praça central", service_scope: "Exibição de 30 s", execution_conditions: null,
  }]);
  assert.equal(services[0].listUnitPrice, 500);
  assert.equal(services[0].negotiatedUnitPrice, 450);
  const text = buildNumberedServiceClauses(services);
  assert.match(text, /Valor total deste serviço: R\$\s?900,00 \(valor de tabela R\$\s?1\.000,00; desconto negociado de R\$\s?100,00\)/);
  assert.match(text, /Local: Praça central/);
});

// ------------------------------------------------------------------------ modelos

test("modelos: rascunho NUNCA gera minuta; teste gera com marca de teste; produção gera como conferência; documento fixo e modalidade errada são recusados", () => {
  const draft = checkTemplateForComposition(template({ testEnabled: false, active: false }), "commercial");
  assert.equal(draft.ok, false);
  const test_ = checkTemplateForComposition(template(), "commercial");
  assert.deepEqual(test_.ok && { stage: test_.stage, marking: test_.marking }, { stage: "test", marking: "MINUTA DE TESTE — SEM EFEITO CONTRATUAL" });
  const production = checkTemplateForComposition(template({ active: true, testEnabled: false }), "commercial");
  assert.deepEqual(production.ok && { stage: production.stage, marking: production.marking }, { stage: "production", marking: "MINUTA PARA CONFERÊNCIA — NÃO ASSINAR" });
  assert.equal(checkTemplateForComposition(template({ modality: "institutional" }), "commercial").ok, false);
  assert.equal(checkTemplateForComposition(template({ modality: undefined }), "commercial").ok, false);
  assert.equal(checkTemplateForComposition(template({ documentMode: "fixed_pdf" }), "commercial").ok, false);
});

// ------------------------------------------------------------------- renderização

test("renderização: troca literal; campo ausente vira [PENDENTE: rótulo]; nada é avaliado como expressão", () => {
  const out = renderCompositionContent({
    content: "Contratante {{cliente.nome}}, CNPJ {{cliente.cpf_cnpj}}, prazo {{forma_pagamento}}. {{servicos.clausulas}} {{ 1 + 1 }}",
    values: { "cliente.nome": "Fulano", "cliente.cpf_cnpj": "  " },
    labels: { "cliente.cpf_cnpj": "CPF/CNPJ do cliente", forma_pagamento: "Forma de pagamento" },
    clausesText: "2. SERVIÇOS CONTRATADOS",
  });
  assert.match(out.text, /Contratante Fulano, CNPJ \[PENDENTE: CPF\/CNPJ do cliente\], prazo \[PENDENTE: Forma de pagamento\]\. 2\. SERVIÇOS CONTRATADOS/);
  assert.ok(out.pendencies.includes("CPF/CNPJ do cliente") && out.pendencies.includes("Forma de pagamento"));
  assert.ok(out.pendencies.includes("marcadores inválidos no modelo"), "{{ 1 + 1 }} nunca é interpretado");
});

test("renderização: modelo sem {{servicos.clausulas}} recebe o bloco 2.x ao final, com aviso", () => {
  const out = renderCompositionContent({ content: "Texto do contrato.", values: {}, clausesText: "2. SERVIÇOS CONTRATADOS\n\n2.1 X" });
  assert.match(out.text, /Texto do contrato\.\n\n2\. SERVIÇOS CONTRATADOS/);
  assert.equal(out.notices.length, 1);
  const legacy = renderCompositionContent({ content: "Resumo: {{servicos.resumo}}", values: {}, clausesText: "2. SERVIÇOS" });
  assert.equal(legacy.notices.length, 0);
  assert.match(legacy.text, /Resumo: 2\. SERVIÇOS/);
});

test("texto final: marca no topo, pendências listadas e aviso de que não é contrato celebrado", () => {
  const rendered = renderCompositionContent({ content: "{{x}}", values: {}, clausesText: "c" });
  const text = composeDocumentText(rendered, "MINUTA DE TESTE — SEM EFEITO CONTRATUAL");
  assert.match(text, /^MINUTA DE TESTE — SEM EFEITO CONTRATUAL\nDocumento gerado para conferência; não constitui contrato celebrado\./);
  assert.match(text, /PENDÊNCIAS \(1\): x\./);
});

// ----------------------------------------------------------- CONTRATADA (Etapa 1)

const COMPANY: CompanyProfileRow = {
  legal_name: "Jornal Informativo Regional Ltda", trade_name: "Jornal IR", cnpj: "11222333000181",
  address_street: "Rua das Flores", address_number: "100", address_complement: null, address_district: "Centro",
  address_city: "Cidade", address_state: "RS", address_zip: "97000000", email: "contato@exemplo.com.br", phone: null,
};
const REP: LegalRepresentativeRow = {
  id: "rep-1", full_name: "Fulano de Tal", cpf: "52998224725", role_title: "Sócio-administrador", nationality: "Brasileiro",
  representation_rule: "individual", powers_description: "Poderes plenos.", powers_valid_from: "2026-01-01", powers_valid_until: "2026-12-31",
  active: true, is_default: true,
};

test("CONTRATADA: variáveis contratada.* e cabeçalho vêm das configurações; representante padrão dentro da vigência", () => {
  const profile = buildContractorProfile(COMPANY, [REP], "2026-11-08");
  assert.equal(profile.configured, true);
  assert.equal(profile.variables["contratada.razao_social"], "Jornal Informativo Regional Ltda");
  assert.equal(profile.variables["contratada.cnpj"], "11.222.333/0001-81");
  assert.match(profile.variables["contratada.endereco"], /Rua das Flores, 100, Centro - Cidade\/RS, CEP 97000-000/);
  assert.match(profile.variables["contratada.representante"], /Fulano de Tal, Brasileiro, CPF 529\.982\.247-25, Sócio-administrador/);
  assert.match(profile.headerLines.join("\n"), /CNPJ 11\.222\.333\/0001-81[\s\S]*Representante legal: Fulano de Tal/);
  assert.equal(profile.representativeId, "rep-1");
});

test("CONTRATADA: poderes fora da vigência, sem padrão ou sem empresa NÃO são presumidos — viram aviso/pendência", () => {
  const expired = buildContractorProfile(COMPANY, [REP], "2027-01-02");
  assert.equal(expired.variables["contratada.representante"], undefined);
  assert.match(expired.warnings.join(" "), /expiraram em 31\/12\/2026/);
  assert.match(expired.headerLines.join("\n"), /Representante legal: \[PENDENTE\]/);
  const future = pickContractRepresentative([REP], "2025-12-31");
  assert.equal(future.representative, undefined);
  assert.equal(pickContractRepresentative([{ ...REP, is_default: false }, { ...REP, id: "rep-2", is_default: false }], "2026-06-01").representative, undefined);
  assert.equal(pickContractRepresentative([{ ...REP, active: false }], "2026-06-01").representative, undefined);
  const none = buildContractorProfile(null, [], "2026-11-08");
  assert.equal(none.configured, false);
  assert.deepEqual(none.variables, {});
  assert.match(none.headerLines[0], /PENDENTE/);
  const joint = pickContractRepresentative([{ ...REP, representation_rule: "joint" }], "2026-06-01");
  assert.ok(joint.representative);
  assert.match(joint.warnings.join(" "), /em conjunto/);
});

test("CONTRATANTE: cabeçalho vem do cadastro mestre (aceita cliente.documento do fluxo comercial); falta vira [PENDENTE]", () => {
  assert.deepEqual(buildContracteeHeaderLines({ "cliente.nome": "Fulano", "cliente.documento": "123", "cliente.endereco": "Rua X" }), ["Fulano", "CPF/CNPJ: 123", "Endereço: Rua X"]);
  assert.match(buildContracteeHeaderLines({}).join("\n"), /\[PENDENTE: nome do cliente\][\s\S]*CPF\/CNPJ: \[PENDENTE\]/);
});

// --------------------------------------------------------------------- formulário

test("formulário: decimais brasileiros e campos variáveis adicionais (os automáticos nunca são pedidos ao operador)", () => {
  assert.equal(parseDecimal("1.234,56"), 1234.56);
  assert.equal(parseDecimal("1234,5"), 1234.5);
  assert.equal(parseDecimal("1234.5"), 1234.5);
  assert.ok(Number.isNaN(parseDecimal("")));
  assert.ok(Number.isNaN(parseDecimal("abc")));
  const manual = manualVariables({
    variables: [
      { key: "contratada.cnpj", label: "CNPJ", required: true },
      { key: "cliente.representante", label: "Rep", required: true },
      { key: "forma_pagamento", label: "Forma de pagamento", required: true },
    ],
  });
  assert.deepEqual(manual.map((variable) => variable.key), ["forma_pagamento"]);
});
