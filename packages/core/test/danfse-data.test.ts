import { test } from "node:test";
import assert from "node:assert/strict";
import type { DpsBuildInput, NfseIssuedNote } from "@ir/types";
import { buildDpsXml } from "../src/nfse/dps-builder";
import { signDpsXml } from "../src/nfse/signature";
import { DanfseDataError, extractDanfseData } from "../src/nfse/danfse-data";
import forge from "node-forge";

/**
 * Fixtures REALISTAS (nunca um XML simplificado inventado): a DPS é
 * montada pelo mesmo `buildDpsXml` real usado em produção e assinada
 * de verdade; o envelope da NFS-e autorizada segue exatamente a
 * estrutura `TCInfNFSe` confirmada no XSD oficial (emit, valores, DPS
 * embutida) — igual ao que `SefinNacionalClient` devolveria de
 * verdade (ver sefin-nacional-client.test.ts/fakeNfseXml).
 */
function makeDpsInput(overrides: Partial<DpsBuildInput> = {}): DpsBuildInput {
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
    serviceDescription: "Veiculação de anúncio publicitário",
    environment: "homologation",
    dpsSeries: "1",
    dpsNumber: 42,
    ...overrides,
  };
}

function makeTestCert(): { privateKeyPem: string; certificatePem: string } {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const attrs = [{ name: "commonName", value: "TESTE:23970969000190" }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey), certificatePem: forge.pki.certificateToPem(cert) };
}

function makeNfseXml(dpsInputOverrides: Partial<DpsBuildInput> = {}): string {
  const dpsXml = buildDpsXml(makeDpsInput(dpsInputOverrides));
  const { privateKeyPem, certificatePem } = makeTestCert();
  // A NFS-e embute a DPS como elemento filho (DPS/infDPS) — a declaração <?xml?> da DPS
  // standalone só é válida no INÍCIO do documento; embutida, precisa ser removida.
  const signedDps = signDpsXml({ xml: dpsXml, privateKeyPem, certificatePem }).signedXml.replace(/^<\?xml[^>]*\?>/, "");
  return (
    '<NFSe versao="1.01"><infNFSe Id="NFS42164041999999999999999999900000000012026100001">' +
    "<xLocEmi>São João do Sul</xLocEmi><nNFSe>12</nNFSe><cStat>100</cStat>" +
    "<dhProc>2026-10-25T12:00:00-03:00</dhProc>" +
    "<emit><CNPJ>23970969000190</CNPJ><IM>1000546</IM><xNome>INFORMATIVO REGIONAL LTDA</xNome>" +
    "<enderNac><xLgr>Rua Principal</xLgr><nro>100</nro><xBairro>Centro</xBairro><cMun>4216404</cMun><UF>SC</UF><CEP>88960000</CEP></enderNac></emit>" +
    "<valores><vBC>150.50</vBC><pAliqAplic>2.00</pAliqAplic><vISSQN>3.01</vISSQN><vLiq>150.50</vLiq></valores>" +
    signedDps +
    "</infNFSe></NFSe>"
  );
}

function makeIssuedNote(overrides: Partial<NfseIssuedNote> = {}): NfseIssuedNote {
  return {
    id: "note-1",
    draftId: "draft-1",
    issuerConfigId: "issuer-1",
    clientId: "client-1",
    environment: "homologation",
    dpsSeries: "1",
    dpsNumber: 42,
    dpsId: "DPS42164042299999999999999999999001000000000000042",
    accessKey: "421640419999999999999999999990000000001202610",
    nfseNumber: "12",
    issuedAt: "2026-10-25T12:00:00-03:00",
    competencyDate: "2026-10-01",
    serviceValue: 150.5,
    signedDpsXml: "<DPS/>",
    nfseXml: makeNfseXml(),
    createdAt: "2026-10-25T12:00:00-03:00",
    ...overrides,
  };
}

test("extractDanfseData extrai identificação, prestador, tomador, serviço e valores de um XML real e assinado — nunca inventa", () => {
  const data = extractDanfseData(makeIssuedNote());
  assert.equal(data.accessKey, "421640419999999999999999999990000000001202610");
  assert.equal(data.nfseNumber, "12");
  assert.equal(data.competencyDate, "2026-10-01");
  assert.equal(data.serviceValue, 150.5);
  assert.equal(data.statusLabel, "NFS-e Gerada");
  assert.equal(data.isHomologation, true, "ambiente homologation -> tpAmb=2 na DPS -> isHomologation true");
  assert.equal(data.prestador.federalInscription, "23970969000190");
  assert.equal(data.prestador.name, "INFORMATIVO REGIONAL LTDA");
  assert.equal(data.prestador.address, "Rua Principal, nº 100, Centro");
  assert.equal(data.tomador?.federalInscription, "11144477735");
  assert.equal(data.tomador?.name, "Maria Souza");
  assert.equal(data.serviceDescription, "Veiculação de anúncio publicitário");
  assert.equal(data.nationalServiceCode, "140619");
  assert.equal(data.issqnTaxBase, "150.50");
  assert.equal(data.issqnAmount, "3.01");
});

test("extractDanfseData: tomador PJ também é extraído corretamente (CNPJ, não CPF)", () => {
  const data = extractDanfseData(
    makeIssuedNote({ nfseXml: makeNfseXml({ tomador: { sourceClientId: "client-2", kind: "company", name: "Cliente PJ Ltda", cnpj: "11111111000199", city: "São João do Sul", state: "SC" } }) }),
  );
  assert.equal(data.tomador?.federalInscription, "11111111000199");
  assert.equal(data.tomador?.name, "Cliente PJ Ltda");
});

test("extractDanfseData: ambiente de produção (tpAmb=1) nunca marca isHomologation", () => {
  const data = extractDanfseData(makeIssuedNote({ nfseXml: makeNfseXml({ environment: "production" }) }));
  assert.equal(data.isHomologation, false);
});

test("extractDanfseData: falha fechada (DanfseDataError) se nfseXml estiver ausente — nunca gera DANFSe sem XML real", () => {
  assert.throws(() => extractDanfseData(makeIssuedNote({ nfseXml: undefined })), DanfseDataError);
});

test("extractDanfseData: falha fechada se accessKey/nfseNumber/issuedAt estiverem ausentes (nota não efetivamente autorizada)", () => {
  assert.throws(() => extractDanfseData(makeIssuedNote({ accessKey: undefined })), DanfseDataError);
  assert.throws(() => extractDanfseData(makeIssuedNote({ nfseNumber: undefined })), DanfseDataError);
  assert.throws(() => extractDanfseData(makeIssuedNote({ issuedAt: undefined })), DanfseDataError);
});

test("extractDanfseData: falha fechada se o XML estiver corrompido/sem infNFSe — nunca finge sucesso", () => {
  assert.throws(() => extractDanfseData(makeIssuedNote({ nfseXml: "<NFSe><outraCoisa/></NFSe>" })), DanfseDataError);
  assert.throws(() => extractDanfseData(makeIssuedNote({ nfseXml: "isto não é XML" })), DanfseDataError);
});

test("extractDanfseData: campos opcionais ausentes (ex.: tomador) viram undefined, nunca um valor inventado — renderizador decide o '-' ", () => {
  // DPS sem toma é estruturalmente impossível no cenário atual (buildDpsXml sempre inclui toma),
  // então simulamos removendo o grupo manualmente — equivalente a uma NFS-e sem tomador identificado.
  const withoutToma = makeNfseXml().replace(/<toma>.*?<\/toma>/, "");
  const data = extractDanfseData(makeIssuedNote({ nfseXml: withoutToma }));
  assert.equal(data.tomador, undefined);
});
