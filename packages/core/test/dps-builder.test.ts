import { test } from "node:test";
import assert from "node:assert/strict";
import type { DpsBuildInput } from "@ir/types";
import { buildDpsId, isValidDpsSeriesFormat, isTransmissionEnvironmentAllowed } from "@ir/types";
import { buildDpsXml, parseAuthorizationResponse, parseRejectionResponse, validateDpsXmlStructure } from "../src/nfse/dps-builder";

function makeInput(overrides: Partial<DpsBuildInput> = {}): DpsBuildInput {
  return {
    issuer: {
      companyName: "INFORMATIVO REGIONAL LTDA",
      cnpj: "23970969000190",
      municipalRegistration: "1000546",
      ibgeCode: "4216404",
      municipality: "São João do Sul",
      state: "SC",
      simplesNacionalOption: "me_epp",
      specialTaxRegimeCode: "none",
    },
    tomador: { sourceClientId: "client-1", kind: "individual", name: "Maria Souza", cpf: "11144477735", city: "São João do Sul", state: "SC" },
    fiscal: { cTribNac: "140619" },
    competencyDate: "2026-10-01",
    serviceValue: 150.5,
    serviceDescription: "Veiculação de anúncio publicitário em outubro/2026",
    environment: "homologation",
    dpsSeries: "1",
    dpsNumber: 42,
    ...overrides,
  };
}

// Parte 2A, item 20 / Parte 2C — geração determinística da DPS fechada contra o XSD oficial.

test("buildDpsXml preserva EXATAMENTE a descrição informada pelo usuário — nunca autopreenchida pelo perfil", () => {
  const xml = buildDpsXml(makeInput({ serviceDescription: "Texto livre & especial <teste>" }));
  assert.ok(xml.includes("<xDescServ>Texto livre &amp; especial &lt;teste&gt;</xDescServ>"));
});

test("buildDpsXml preserva a competência escolhida no rascunho", () => {
  const xml = buildDpsXml(makeInput({ competencyDate: "2026-03-15" }));
  assert.ok(xml.includes("<dCompet>2026-03-15</dCompet>"));
});

test("buildDpsXml preserva o valor informado naquela emissão — nunca recalculado", () => {
  const xml = buildDpsXml(makeInput({ serviceValue: 999.9 }));
  assert.ok(xml.includes("<vServ>999.90</vServ>"));
});

test("buildDpsXml nunca inventa cTribNac — usa exatamente o que o perfil de serviço informou", () => {
  const xml = buildDpsXml(makeInput({ fiscal: { cTribNac: "140619" } }));
  assert.ok(xml.includes("<cTribNac>140619</cTribNac>"));
  assert.ok(!xml.includes("1706"), "código municipal antigo (1706) nunca deve aparecer — não é cTribNac válido");
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

test("buildDpsXml nunca inclui vISSQN/pAliq — alíquota do ISSQN não é mais modelada no perfil de serviço (ajuste final Parte 2B)", () => {
  const xml = buildDpsXml(makeInput());
  assert.ok(!xml.includes("<vISSQN>"));
  assert.ok(!xml.includes("<pAliq>"));
});

test("buildDpsXml emite regTrib (opSimpNac/regEspTrib) quando o prestador está configurado (Simples Nacional)", () => {
  const xml = buildDpsXml(makeInput({ issuer: { ...makeInput().issuer, simplesNacionalOption: "me_epp", specialTaxRegimeCode: "none" } }));
  assert.ok(xml.includes("<regTrib><opSimpNac>3</opSimpNac><regEspTrib>0</regEspTrib></regTrib>"));
});

test("buildDpsXml NUNCA inventa opSimpNac/regEspTrib — omite regTrib por completo se o prestador não configurou", () => {
  const xml = buildDpsXml(makeInput({ issuer: { ...makeInput().issuer, simplesNacionalOption: undefined, specialTaxRegimeCode: undefined } }));
  assert.ok(!xml.includes("<regTrib>"));
  assert.ok(!xml.includes("<opSimpNac>"));
  assert.ok(!xml.includes("<regEspTrib>"));
});

test("buildDpsXml mapeia tomador pessoa física (CPF) corretamente", () => {
  const xml = buildDpsXml(makeInput({ tomador: { sourceClientId: "c1", kind: "individual", name: "Maria Souza", cpf: "11144477735", city: "SJS", state: "SC" } }));
  assert.ok(xml.includes("<toma><CPF>11144477735</CPF><xNome>Maria Souza</xNome></toma>"));
});

test("buildDpsXml mapeia tomador pessoa jurídica (CNPJ) corretamente", () => {
  const xml = buildDpsXml(makeInput({ tomador: { sourceClientId: "c2", kind: "company", name: "Cliente PJ Ltda", cnpj: "11111111000199", city: "SJS", state: "SC" } }));
  assert.ok(xml.includes("<toma><CNPJ>11111111000199</CNPJ><xNome>Cliente PJ Ltda</xNome></toma>"));
  assert.ok(!xml.includes("<CPF>"));
});

test("buildDpsXml não emite tags opcionais vazias — cTribMun/cNBS ausentes quando não informados", () => {
  const xml = buildDpsXml(makeInput({ fiscal: { cTribNac: "140619" } }));
  assert.ok(!xml.includes("<cTribMun>"));
  assert.ok(!xml.includes("<cNBS>"));
});

test("buildDpsXml emite cTribMun/cNBS quando informados no perfil (normalizando formatação de entrada)", () => {
  const xml = buildDpsXml(makeInput({ fiscal: { cTribNac: "140619", cTribMun: "706", cNBS: "1.1406.19.00" } }));
  assert.ok(xml.includes("<cTribMun>706</cTribMun>"));
  assert.ok(xml.includes("<cNBS>114061900</cNBS>"));
});

test("validateDpsXmlStructure aprova um XML completo e reprova um incompleto", () => {
  const complete = buildDpsXml(makeInput());
  assert.equal(validateDpsXmlStructure(complete).structurallyValid, true);
  const incomplete = "<DPS><infDPS></infDPS></DPS>";
  const result = validateDpsXmlStructure(incomplete);
  assert.equal(result.structurallyValid, false);
  assert.ok(result.issues.length > 0);
});

test("buildDpsId monta os 45 caracteres: literal DPS + município+tipo+inscrição+série+número (confirmado contra TSIdDPS no XSD oficial)", () => {
  const id = buildDpsId({ ibgeCode: "4216404", federalInscriptionType: "cnpj", federalInscription: "23970969000190", series: "1", number: 42 });
  assert.equal(id.length, 45);
  assert.equal(id.slice(0, 3), "DPS");
  assert.equal(id.slice(3, 10), "4216404");
  assert.equal(id.slice(10, 11), "2");
  assert.equal(id.slice(11, 25), "23970969000190");
  assert.equal(id.slice(25, 30), "00001");
  assert.equal(id.slice(30, 45), "000000000000042");
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
