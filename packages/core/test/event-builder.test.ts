import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCancellationEventId, buildCancellationEventXml, validateCancellationEventXmlStructure } from "../src/nfse/event-builder";
import { validatePedRegEventoAgainstOfficialXsd } from "../src/nfse/xsd-validator";

// 50 caracteres, conforme TSChaveNFSe (6 dígitos + 14 alfanumérico + 30 dígitos).
const SAMPLE_ACCESS_KEY = "421640" + "41999999999999" + "999999999990000000001202610001";
const SAMPLE_CNPJ = "23970969000190";

function makeInput(overrides: Partial<Parameters<typeof buildCancellationEventXml>[0]> = {}) {
  return {
    accessKey: SAMPLE_ACCESS_KEY,
    authorCnpj: SAMPLE_CNPJ,
    sequence: 1,
    justificationCode: 1 as const,
    justificationText: "Erro de digitação no valor do serviço na emissão original.",
    environment: "homologation" as const,
    now: new Date("2026-10-25T14:00:00.000Z"),
    ...overrides,
  };
}

test("buildCancellationEventId produz Id conforme o regex oficial TSIdPedRegEvt (59 caracteres, PRE + 8 + 1 + 14 + 33)", () => {
  const id = buildCancellationEventId({ accessKey: SAMPLE_ACCESS_KEY, authorCnpj: SAMPLE_CNPJ, sequence: 1 });
  assert.equal(id.length, 59);
  assert.match(id, /^PRE[0-9]{8}(1[0-9]{14}|2[0-9A-Z]{14})[0-9]{33}$/);
});

test("buildCancellationEventXml monta estrutura completa (tpAmb/dhEvento/CNPJAutor/chNFSe/e101101) sem inventar motivo", () => {
  const xml = buildCancellationEventXml(makeInput());
  assert.ok(xml.includes("<tpAmb>2</tpAmb>"));
  assert.ok(xml.includes("<chNFSe>" + SAMPLE_ACCESS_KEY + "</chNFSe>"));
  assert.ok(xml.includes("<CNPJAutor>" + SAMPLE_CNPJ + "</CNPJAutor>"));
  assert.ok(xml.includes("<cMotivo>1</cMotivo>"));
  assert.ok(xml.includes("Erro de digitação no valor do serviço na emissão original."));
  const structural = validateCancellationEventXmlStructure(xml);
  assert.equal(structural.structurallyValid, true);
});

test("buildCancellationEventXml em produção usa tpAmb=1 (nunca confunde com homologação)", () => {
  const xml = buildCancellationEventXml(makeInput({ environment: "production" }));
  assert.ok(xml.includes("<tpAmb>1</tpAmb>"));
});

test("fixture completa do evento de cancelamento PASSA de verdade na validação XSD oficial (pedRegEvento_v1.01.xsd) — sem bypass/mock/skip", async () => {
  const xml = buildCancellationEventXml(makeInput());
  const result = await validatePedRegEventoAgainstOfficialXsd(xml);
  assert.deepEqual(result.errors, []);
  assert.equal(result.valid, true);
});

test("evento com justificativa fora do intervalo 15-255 (TSMotivo) é rejeitado pela validação XSD real", async () => {
  const xml = buildCancellationEventXml(makeInput({ justificationText: "curta" }));
  const result = await validatePedRegEventoAgainstOfficialXsd(xml);
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
});

test("XML estruturalmente incompleto nunca finge sucesso na validação XSD real", async () => {
  const result = await validatePedRegEventoAgainstOfficialXsd("<pedRegEvento><infPedReg></infPedReg></pedRegEvento>");
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
});
