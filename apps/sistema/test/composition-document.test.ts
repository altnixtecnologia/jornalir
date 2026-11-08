import test from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import type { Client, ContractTemplate } from "@ir/types";
import {
  buildCompositionDocument,
  type CatalogProduct,
  type CompositionDeps,
  type CompositionRequest,
} from "../src/lib/contracts/compositionDocument";
import { buildContractTemplatePdf, type ContractTemplatePdfInput } from "../src/lib/contracts/contractTemplatePdf";
import { buildContractorProfile, type CompanyProfileRow, type LegalRepresentativeRow } from "../src/lib/contracts/contractorProfile";
import type { CompositionServiceInput } from "../src/lib/contracts/contractComposition";

// Etapa 2: minuta (PDF) com cabeçalho CONTRATADA/CONTRATANTE e marca visível.
// Dependências falsas — nenhum teste toca produção, grava, assina ou envia.

const CLIENT = {
  id: "cli-1", kind: "company", companyName: "Exemplo Comércio Ltda", tradeName: "Exemplo", cnpj: "23970969000190",
  responsibleName: "Maria da Silva", phonePrimary: "48999990000", email: "contato@exemplo.invalid",
  address: { zip: "88900000", street: "Rua das Flores", number: "100", neighborhood: "Centro", city: "São João do Sul", state: "SC" },
} as unknown as Client;

const COMPANY: CompanyProfileRow = {
  legal_name: "Jornal Informativo Regional Ltda", trade_name: null, cnpj: "11222333000181", address_street: "Rua A", address_number: "1",
  address_complement: null, address_district: "Centro", address_city: "Cidade", address_state: "RS", address_zip: "97000000", email: null, phone: null,
};
const REP: LegalRepresentativeRow = {
  id: "rep-1", full_name: "Fulano de Tal", cpf: "52998224725", role_title: "Sócio", nationality: "Brasileiro", representation_rule: "individual",
  powers_description: "Poderes plenos.", powers_valid_from: null, powers_valid_until: null, active: true, is_default: true,
};

function template(overrides: Partial<ContractTemplate> = {}): ContractTemplate {
  return {
    id: "tpl-1", groupId: "grp-1", version: 2, title: "Contrato combinado", content: "Contrato entre {{contratada.razao_social}} e {{cliente.nome}}.\n\n{{servicos.clausulas}}\n\nPagamento: {{forma_pagamento}}.",
    variables: [{ key: "forma_pagamento", label: "Forma de pagamento", required: true }],
    active: false, testEnabled: true, modality: "commercial", documentMode: "text", createdAt: "2026-11-01T00:00:00Z", ...overrides,
  };
}

const PRODUCT: CatalogProduct = { id: "prod-1", name: "Anúncio de página inteira", channel: "newspaper", suggestedPrice: 1000, active: true };

function line(overrides: Partial<CompositionServiceInput> = {}): CompositionServiceInput {
  return {
    kind: "catalog", productId: "prod-1", title: "Anúncio de página inteira", quantity: 2, listUnitPrice: 1000, negotiatedUnitPrice: 1000,
    startsOn: "2026-03-01", endsOn: "2026-05-31", periodicity: "monthly", ...overrides,
  };
}

function request(overrides: Partial<CompositionRequest> = {}): CompositionRequest {
  return { clientId: "cli-1", modality: "commercial", templateId: "tpl-1", services: [line()], customValues: { forma_pagamento: "Boleto mensal" }, ...overrides };
}

interface Spy { pdfInputs: ContractTemplatePdfInput[]; calls: string[] }

function deps(overrides: Partial<CompositionDeps> = {}, tpl: ContractTemplate | null = template()): { deps: CompositionDeps; spy: Spy } {
  const spy: Spy = { pdfInputs: [], calls: [] };
  const base: CompositionDeps = {
    loadClient: async () => { spy.calls.push("client"); return CLIENT; },
    loadTemplate: async () => { spy.calls.push("template"); return tpl; },
    loadProducts: async () => { spy.calls.push("products"); return [PRODUCT]; },
    loadContractor: async (today, representativeId) => buildContractorProfile(COMPANY, [REP], today, representativeId),
    canNegotiateValues: async () => true,
    buildPdf: async (input) => { spy.pdfInputs.push(input); return buildContractTemplatePdf(input); },
    now: () => new Date("2026-11-08T12:00:00Z"),
  };
  return { deps: { ...base, ...overrides }, spy };
}

const WIN_ANSI_EXTRA: Record<number, string> = { 0x85: "…", 0x91: "‘", 0x92: "’", 0x93: "“", 0x94: "”", 0x95: "•", 0x96: "–", 0x97: "—" };
/** Decodificação WinAnsi independente do ICU do Node (0x80–0x9F diferem de Latin-1). */
function decodeWinAnsi(bytes: Buffer): string {
  return [...bytes].map((byte) => WIN_ANSI_EXTRA[byte] ?? String.fromCharCode(byte)).join("");
}

/** Texto desenhado em TODAS as páginas (fluxos de conteúdo são comprimidos; strings em hex). */
function drawnText(pdf: Uint8Array): string {
  const raw = Buffer.from(pdf).toString("latin1");
  const parts: string[] = [];
  for (const match of raw.matchAll(/(?<!end)stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try {
      const content = inflateSync(Buffer.from(match[1], "latin1")).toString("latin1");
      for (const hex of content.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) parts.push(decodeWinAnsi(Buffer.from(hex[1], "hex")));
    } catch {
      // streams que não são conteúdo de página (fontes) são ignorados
    }
  }
  return parts.join("\n");
}

async function pageCount(pdf: Uint8Array): Promise<number> {
  return (await PDFDocument.load(pdf)).getPageCount();
}

test("minuta de modelo em TESTE: PDF válido, marca visível em TODAS as páginas, cabeçalho CONTRATADA/CONTRATANTE, cláusulas 2.x", async () => {
  const longServices = Array.from({ length: 8 }, (_, index) => line({ title: `Serviço ${index + 1} de veiculação`, description: "Descrição extensa. ".repeat(20) }));
  const { deps: d, spy } = deps();
  const result = await buildCompositionDocument(request({ services: longServices }), d);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.stage, "test");
  assert.equal(result.marking, "MINUTA DE TESTE — SEM EFEITO CONTRATUAL");
  const pages = await pageCount(result.pdf);
  assert.ok(pages >= 2, "o documento longo ocupa mais de uma página");
  const text = drawnText(result.pdf);
  const markings = text.split("MINUTA DE TESTE — SEM EFEITO CONTRATUAL").length - 1;
  assert.ok(markings >= pages * 3, `marca em cada página (faixa topo, faixa rodapé, tarja): ${markings} ocorrências para ${pages} páginas`);
  assert.match(text, /CONTRATADA/);
  assert.match(text, /CONTRATANTE/);
  assert.match(text, /Jornal Informativo Regional Ltda/);
  assert.match(text, /CNPJ 11\.222\.333\/0001-81/);
  assert.match(text, /Exemplo Comércio Ltda|Exemplo/);
  assert.match(text, /2\. SERVIÇOS CONTRATADOS/);
  assert.match(text, /2\.1 Serviço 1 de veiculação/);
  assert.match(text, /2\.8 Serviço 8 de veiculação/);
  assert.match(text, /Pagamento: Boleto mensal\./);
  assert.equal(spy.pdfInputs[0].watermark, "MINUTA DE TESTE — SEM EFEITO CONTRATUAL");
  assert.deepEqual(result.pendencies, []);
  assert.equal(result.contractorConfigured, true);
  assert.match(result.sha256, /^[0-9a-f]{64}$/);
});

test("modelo em PRODUÇÃO gera só 'MINUTA PARA CONFERÊNCIA — NÃO ASSINAR' (não é a emissão oficial); a minuta nunca ativa o modelo", async () => {
  const tpl = template({ active: true, testEnabled: false });
  const { deps: d } = deps({}, tpl);
  const result = await buildCompositionDocument(request(), d);
  assert.equal(result.ok && result.marking, "MINUTA PARA CONFERÊNCIA — NÃO ASSINAR");
  assert.equal(tpl.active, true);
  const draft = template({ testEnabled: false });
  const refused = await buildCompositionDocument(request(), deps({}, draft).deps);
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.match(refused.error, /Rascunho/);
  assert.equal(draft.testEnabled, false, "recusar a minuta não altera o modelo");
});

test("modalidade errada, documento fixo e modelo inexistente são recusados com mensagem clara", async () => {
  const wrong = await buildCompositionDocument(request({ modality: "institutional" }), deps().deps);
  assert.equal(wrong.ok, false);
  const fixed = await buildCompositionDocument(request(), deps({}, template({ documentMode: "fixed_pdf" })).deps);
  assert.equal(fixed.ok, false);
  const missing = await buildCompositionDocument(request(), deps({}, null).deps);
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.match(missing.error, /não encontrado/);
});

test("o preço de TABELA do item do catálogo vem do servidor — o navegador não decide o preço original", async () => {
  const { deps: d } = deps();
  const result = await buildCompositionDocument(request({ services: [line({ listUnitPrice: 1, negotiatedUnitPrice: 1000, negotiationReason: "tentativa de adulterar a tabela" })] }), d);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.services[0].listUnitPrice, 1000, "sobrescrito pelo valor sugerido do catálogo");
  assert.equal(result.negotiation.length, 0);
  assert.equal(result.totals.negotiatedTotal, 2000);
  const negotiated = await buildCompositionDocument(request({ services: [line({ negotiatedUnitPrice: 800 })] }), d);
  assert.equal(negotiated.ok, false, "valor negociado ≠ tabela exige justificativa");
  const justified = await buildCompositionDocument(request({ services: [line({ negotiatedUnitPrice: 800, negotiationReason: "Cliente antigo" })] }), d);
  assert.equal(justified.ok, true);
  if (justified.ok) {
    assert.equal(justified.negotiation[0].listUnitPrice, 1000);
    assert.equal(justified.negotiation[0].negotiatedUnitPrice, 800);
    assert.equal(justified.negotiation[0].adjustmentAmount, 400);
    assert.match(drawnText(justified.pdf), /Valor unitário de tabela: R\$\s?1\.000,00/);
  }
});

test("produto do catálogo inexistente/inativo e cliente inexistente são recusados", async () => {
  const noProduct = await buildCompositionDocument(request(), deps({ loadProducts: async () => [] }).deps);
  assert.equal(noProduct.ok, false);
  const inactive = await buildCompositionDocument(request(), deps({ loadProducts: async () => [{ ...PRODUCT, active: false }] }).deps);
  assert.equal(inactive.ok, false);
  const noClient = await buildCompositionDocument(request(), deps({ loadClient: async () => null }).deps);
  assert.equal(noClient.ok, false);
  if (!noClient.ok) assert.match(noClient.error, /Cliente não encontrado/);
});

test("vários serviços de tipos diferentes no MESMO documento: catálogo + assinatura do jornal + painel, cada um com cláusula e vigência próprias", async () => {
  const services: CompositionServiceInput[] = [
    line(),
    { kind: "subscription", title: "Assinatura anual do jornal impresso", quantity: 1, listUnitPrice: 360, negotiatedUnitPrice: 300, negotiationReason: "Desconto institucional", startsOn: "2026-03-01", endsOn: "2027-02-28", periodicity: "annual" },
    { kind: "other", title: "Cobertura de evento", quantity: 1, listUnitPrice: 500, negotiatedUnitPrice: 500, startsOn: "2026-04-10", endsOn: "2026-04-10", periodicity: "single" },
  ];
  const result = await buildCompositionDocument(request({ services }), deps().deps);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const text = drawnText(result.pdf);
  assert.match(text, /2\.1 Anúncio de página inteira/);
  assert.match(text, /2\.2 Assinatura anual do jornal impresso — Assinatura do jornal/);
  assert.match(text, /2\.3 Cobertura de evento/);
  assert.match(text, /Vigência: 01\/03\/2026 a 28\/02\/2027/);
  assert.match(text, /Vigência: 10\/04\/2026 a 10\/04\/2026/);
  assert.equal(result.negotiation.length, 1);
  assert.equal(result.totals.negotiatedTotal, 2800);
});

test("sem dados da empresa: cabeçalho e campos viram [PENDENTE], listados em pendências; nunca presume CNPJ/endereço", async () => {
  const { deps: d } = deps({ loadContractor: async (today) => buildContractorProfile(null, [], today) });
  const result = await buildCompositionDocument(request({ customValues: {} }), d);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.contractorConfigured, false);
  assert.ok(result.pendencies.includes("razão social da contratada"));
  assert.ok(result.pendencies.includes("Forma de pagamento"));
  const text = drawnText(result.pdf);
  assert.match(text, /\[PENDENTE: razão social da contratada\]/);
  assert.match(text, /PENDÊNCIAS/);
  assert.ok(result.notices.some((notice) => /Dados da empresa/.test(notice)));
});

test("cadastro mestre e configurações prevalecem sobre texto livre: valor digitado para contratada.* ou cliente.* é ignorado", async () => {
  const tpl = template({ variables: [
    { key: "contratada.razao_social", label: "Razão social", required: true },
    { key: "cliente.nome", label: "Nome", required: true },
    { key: "forma_pagamento", label: "Forma de pagamento", required: true },
  ] });
  const result = await buildCompositionDocument(
    request({ customValues: { "contratada.razao_social": "EMPRESA FALSA", "cliente.nome": "CLIENTE FALSO", forma_pagamento: "Pix" } }),
    deps({}, tpl).deps,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const text = drawnText(result.pdf);
  assert.doesNotMatch(text, /EMPRESA FALSA|CLIENTE FALSO/);
  assert.match(text, /Jornal Informativo Regional Ltda/);
});

test("a geração da minuta não persiste nada: as dependências não oferecem gravação e só há leituras", async () => {
  const { deps: d, spy } = deps();
  const result = await buildCompositionDocument(request(), d);
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(d).sort(), ["buildPdf", "canNegotiateValues", "loadClient", "loadContractor", "loadProducts", "loadTemplate", "now"]);
  assert.ok(spy.calls.every((call) => ["client", "template", "products"].includes(call)));
});

test("PDF sem parties/watermark continua idêntico ao formato anterior (retrocompatível)", async () => {
  const base: ContractTemplatePdfInput = { title: "Contrato", content: "Corpo do contrato", contractReference: "REF", templateTitle: "Modelo", templateVersion: 1, generatedAt: "2026-11-08T12:00:00Z" };
  const plain = await buildContractTemplatePdf(base);
  const marked = await buildContractTemplatePdf({ ...base, watermark: "MARCA", parties: { contractor: ["A"], contractee: ["B"] } });
  assert.equal(await pageCount(plain), 1);
  assert.doesNotMatch(drawnText(plain), /MARCA|CONTRATADA|CONTRATANTE/);
  assert.match(drawnText(marked), /MARCA/);
  assert.ok(marked.byteLength > plain.byteLength);
});
