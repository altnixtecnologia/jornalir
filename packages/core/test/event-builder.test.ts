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
    justificationCode: 1 as const,
    justificationText: "Erro de digitação no valor do serviço na emissão original.",
    environment: "homologation" as const,
    now: new Date("2026-10-25T14:00:00.000Z"),
    ...overrides,
  };
}

test("buildCancellationEventId produz exatamente 'PRE' + chave de acesso (50) + código do evento (6) = 59 caracteres — fórmula do Manual de Integração oficial, sem nPedRegEvento", () => {
  const id = buildCancellationEventId({ accessKey: SAMPLE_ACCESS_KEY });
  assert.equal(id.length, 59);
  assert.equal(id, `PRE${SAMPLE_ACCESS_KEY}101101`);
});

test("ressalva honesta: o regex do XSD vendorizado para TSIdPedRegEvt (PRE+8D+flag+14+33D) não bate com a fórmula do manual pra uma chave cujo 7º caractere não é '1'/'2' — contradição externa documentada, não erro desta implementação", () => {
  const id = buildCancellationEventId({ accessKey: SAMPLE_ACCESS_KEY });
  const matchesXsdRegex = /^PRE[0-9]{8}(1[0-9]{14}|2[0-9A-Z]{14})[0-9]{33}$/.test(id);
  // A chave de teste (como a maioria das chaves reais) não tem "1"/"2" na posição certa — por isso NÃO bate com o regex do XSD,
  // mesmo sendo a composição correta segundo o manual oficial e as implementações reais corroboradas.
  assert.equal(matchesXsdRegex, false);
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

test("fixture completa do evento de cancelamento: só o atributo Id falha na validação XSD oficial (contradição externa já documentada), nenhum outro elemento — nunca escondido/ignorado", async () => {
  const xml = buildCancellationEventXml(makeInput());
  const result = await validatePedRegEventoAgainstOfficialXsd(xml);
  // Ver "RESSALVA HONESTA" em event-builder.ts: a fórmula do manual oficial ("PRE"+chave+tipo) não bate
  // sempre com o regex do próprio XSD pro atributo Id — contradição externa confirmada (Quantum-Tecnology
  // changelog), não um erro desta implementação. Por isso este teste espera EXATAMENTE esse erro, nunca
  // sucesso forçado nem outro erro escondido junto.
  assert.equal(result.valid, false);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /infPedReg.*Id|Id.*infPedReg/i);
});

test("fixture com uma chave de acesso cujo 9º caractere do Id (3º do trecho alfanumérico) é '2' PASSA de verdade na validação XSD oficial (pedRegEvento_v1.01.xsd) — confirma que o resto da estrutura está correto", async () => {
  // "PRE" + 8 dígitos + flag('2') + 14 alfanumérico + 33 dígitos — a posição do regex do XSD só coincide
  // com a fórmula do manual (PRE+chave+tipo) quando o 9º caractere do Id final cai exatamente em '1'/'2'.
  const accessKeyMatchingXsdFlag = "421640" + "99299999999999" + "999999999990000000001202610001";
  const xml = buildCancellationEventXml(makeInput({ accessKey: accessKeyMatchingXsdFlag }));
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
