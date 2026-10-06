import { test } from "node:test";
import assert from "node:assert/strict";
import type { DpsBuildInput } from "@ir/types";
import { buildDpsId, isValidDpsSeriesFormat, isTransmissionEnvironmentAllowed } from "@ir/types";
import { buildDpsXml, parseAuthorizationResponse, parseRejectionResponse, validateDpsXmlStructure } from "../src/nfse/dps-builder";

function makeInput(overrides: Partial<DpsBuildInput> = {}): DpsBuildInput {
  return {
    issuer: { companyName: "INFORMATIVO REGIONAL LTDA", cnpj: "23970969000190", municipalRegistration: "1000546", ibgeCode: "4216404", municipality: "São João do Sul", state: "SC" },
    tomador: { sourceClientId: "client-1", kind: "individual", name: "Maria Souza", cpf: "11144477735", city: "São João do Sul", state: "SC" },
    fiscal: { cTribNac: "010101", issqnRate: 5 },
    competencyDate: "2026-10-01",
    serviceValue: 150.5,
    serviceDescription: "Veiculação de anúncio publicitário em outubro/2026",
    environment: "homologation",
    dpsSeries: "1",
    dpsNumber: 42,
    ...overrides,
  };
}

// Parte 2A, item 20 — geração determinística da DPS.

test("buildDpsXml preserva EXATAMENTE a descrição informada pelo usuário", () => {
  const xml = buildDpsXml(makeInput({ serviceDescription: "Texto livre & especial <teste>" }));
  assert.ok(xml.includes("<xDescServ>Texto livre &amp; especial &lt;teste&gt;</xDescServ>"));
});

test("buildDpsXml preserva a competência escolhida pelo usuário", () => {
  const xml = buildDpsXml(makeInput({ competencyDate: "2026-03-15" }));
  assert.ok(xml.includes("<dCompet>2026-03-15</dCompet>"));
});

test("buildDpsXml nunca inclui chave de acesso, número de NFS-e ou data de autorização — esses só existem depois da resposta oficial", () => {
  const xml = buildDpsXml(makeInput());
  assert.ok(!xml.includes("accessKey"));
  assert.ok(!xml.includes("nfseNumber"));
  assert.ok(!/<chAcesso>/.test(xml));
  assert.ok(!/<nNFSe>/.test(xml));
});

test("buildDpsXml é determinístico para os mesmos dados de entrada (exceto dhEmi)", () => {
  const input = makeInput();
  const xmlA = buildDpsXml(input).replace(/<dhEmi>.*?<\/dhEmi>/, "");
  const xmlB = buildDpsXml(input).replace(/<dhEmi>.*?<\/dhEmi>/, "");
  assert.equal(xmlA, xmlB);
});

test("buildDpsXml nunca inventa alíquota/ISSQN quando issqnRate não foi configurado", () => {
  const xml = buildDpsXml(makeInput({ fiscal: { cTribNac: "010101" } }));
  assert.ok(!xml.includes("<vISSQN>"));
});

test("buildDpsXml calcula vISSQN só quando issqnRate foi explicitamente configurado", () => {
  const xml = buildDpsXml(makeInput({ serviceValue: 200, fiscal: { cTribNac: "010101", issqnRate: 5 } }));
  assert.ok(xml.includes("<vISSQN>10.00</vISSQN>"));
});

test("validateDpsXmlStructure aprova um XML completo e reprova um incompleto", () => {
  const complete = buildDpsXml(makeInput());
  assert.equal(validateDpsXmlStructure(complete).structurallyValid, true);
  const incomplete = "<DPS><infDPS></infDPS></DPS>";
  const result = validateDpsXmlStructure(incomplete);
  assert.equal(result.structurallyValid, false);
  assert.ok(result.issues.length > 0);
});

test("buildDpsId monta os 42 caracteres na ordem município+tipo+inscrição+série+número", () => {
  const id = buildDpsId({ ibgeCode: "4216404", federalInscriptionType: "cnpj", federalInscription: "23970969000190", series: "1", number: 42 });
  assert.equal(id.length, 42);
  assert.equal(id.slice(0, 7), "4216404");
  assert.equal(id.slice(7, 8), "2");
  assert.equal(id.slice(8, 22), "23970969000190");
  assert.equal(id.slice(22, 27), "00001");
  assert.equal(id.slice(27, 42), "000000000000042");
});

test("isValidDpsSeriesFormat só valida formato (até 5 dígitos numéricos) — nenhuma faixa semântica não confirmada", () => {
  assert.equal(isValidDpsSeriesFormat("1"), true);
  assert.equal(isValidDpsSeriesFormat("49999"), true);
  assert.equal(isValidDpsSeriesFormat("99999"), true);
  assert.equal(isValidDpsSeriesFormat(""), false);
  assert.equal(isValidDpsSeriesFormat("123456"), false);
  assert.equal(isValidDpsSeriesFormat("abc"), false);
});

test("isTransmissionEnvironmentAllowed só permite homologação nesta fase — produção sempre bloqueada", () => {
  assert.equal(isTransmissionEnvironmentAllowed("homologation"), true);
  assert.equal(isTransmissionEnvironmentAllowed("production"), false);
});

test("parseAuthorizationResponse só devolve resultado quando status=authorized e todos os campos oficiais vieram", () => {
  const ok = parseAuthorizationResponse({ status: "authorized", accessKey: "A", nfseNumber: "1", issuedAt: "2026-10-01T10:00:00Z", nfseXml: "<NFSe/>" });
  assert.ok(ok);
  assert.equal(ok?.accessKey, "A");
  const incomplete = parseAuthorizationResponse({ status: "authorized" });
  assert.equal(incomplete, null);
  const wrongStatus = parseAuthorizationResponse({ status: "rejected", rejection: { code: "X", message: "Y" } });
  assert.equal(wrongStatus, null);
});

test("parseRejectionResponse só devolve resultado quando status=rejected", () => {
  const rejection = parseRejectionResponse({ status: "rejected", rejection: { code: "E1", message: "CNPJ inválido" } });
  assert.deepEqual(rejection, { code: "E1", message: "CNPJ inválido" });
  const notRejected = parseRejectionResponse({ status: "authorized" });
  assert.equal(notRejected, null);
});
