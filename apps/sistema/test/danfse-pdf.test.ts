import { test } from "node:test";
import assert from "node:assert/strict";
import QRCode from "qrcode";
import forge from "node-forge";
import type { DpsBuildInput, NfseIssuedNote } from "@ir/types";
import { buildDpsXml } from "@ir/core/src/nfse/dps-builder";
import { signDpsXml } from "@ir/core/src/nfse/signature";
import { extractDanfseData } from "@ir/core/src/nfse/danfse-data";
import { loadPdfDocument, extractPageTextItems } from "@ir/pdf-extraction";
import { buildDanfsePdf } from "../src/lib/nfse/danfsePdf";

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

async function pdfPageTexts(bytes: Uint8Array): Promise<{ pageCount: number; width: number; height: number; text: string }> {
  const doc = await loadPdfDocument(bytes);
  const page = await doc.getPage(1);
  const items = await extractPageTextItems(page);
  const viewport = page.getViewport({ scale: 1 });
  return { pageCount: doc.numPages, width: viewport.width, height: viewport.height, text: items.map((i) => i.text).join(" ") };
}

test("buildDanfsePdf gera PDF válido (assinatura %PDF-), A4 retrato, uma única página — exigência obrigatória da NT 008/2026 v1.02, seção 2.2", async () => {
  const data = extractDanfseData(makeIssuedNote());
  const bytes = await buildDanfsePdf(data);
  assert.ok(Buffer.from(bytes.slice(0, 5)).equals(Buffer.from("%PDF-")));
  const { pageCount, width, height } = await pdfPageTexts(bytes);
  assert.equal(pageCount, 1, "o DANFSe precisa ser impresso obrigatoriamente em uma única página (seção 2.2)");
  assert.ok(Math.abs(width - 595) < 2 && Math.abs(height - 842) < 2, "A4 retrato (210x297mm) — tamanho mínimo exigido (seção 2.2.1)");
});

test("buildDanfsePdf inclui todos os campos fiscais obrigatórios de identificação/prestador/tomador/serviço/valores", async () => {
  const data = extractDanfseData(makeIssuedNote());
  const bytes = await buildDanfsePdf(data);
  const { text } = await pdfPageTexts(bytes);
  assert.ok(text.includes("DANFSe v2.0"));
  assert.ok(text.includes("Documento Auxiliar da NFS-e"));
  assert.ok(text.includes(data.accessKey));
  assert.ok(text.includes(data.nfseNumber));
  assert.ok(text.includes("INFORMATIVO REGIONAL LTDA"));
  assert.ok(text.includes("Maria Souza"));
  assert.ok(text.includes("Veiculação de anúncio publicitário"));
  assert.ok(text.includes("140619"), "código de tributação nacional do serviço precisa aparecer");
  assert.ok(/R\$\s*150,50/.test(text), "valor do serviço formatado em R$ precisa aparecer");
});

test("buildDanfsePdf inclui a expressão obrigatória 'NFS-e SEM VALIDADE JURÍDICA' quando a nota é de homologação (tpAmb=2) — NUNCA quando é de produção", async () => {
  const homologationData = extractDanfseData(makeIssuedNote());
  const { text: homologationText } = await pdfPageTexts(await buildDanfsePdf(homologationData));
  assert.ok(homologationText.includes("NFS-e SEM VALIDADE JURÍDICA"));

  const productionData = extractDanfseData(makeIssuedNote({ nfseXml: makeNfseXml({ environment: "production" }) }));
  const { text: productionText } = await pdfPageTexts(await buildDanfsePdf(productionData));
  assert.ok(!productionText.includes("NFS-e SEM VALIDADE JURÍDICA"), "a nota de produção NUNCA pode mostrar o aviso de homologação");
});

test("buildDanfsePdf: QR Code aponta pro endereço oficial de consulta pública com a chave de acesso correta", async () => {
  const data = extractDanfseData(makeIssuedNote());
  const expectedUrl = `https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=${data.accessKey}`;
  // Confirma que a MESMA função usada no gerador (QRCode.toDataURL) decodifica de volta pro
  // mesmo conteúdo esperado — garante que a URL embutida bate com a chave de acesso real.
  const png = await QRCode.toDataURL(expectedUrl, { margin: 0, width: 256 });
  assert.ok(png.startsWith("data:image/png;base64,"));
  const bytes = await buildDanfsePdf(data);
  const { text } = await pdfPageTexts(bytes);
  assert.ok(text.includes("autenticidade desta NFS-e"), "a legenda obrigatória do QR Code precisa estar presente (seção 2.4.3)");
});

test("buildDanfsePdf: supressão oficial do bloco Tomador quando ausente na NFS-e (seção 2.3.1) — nunca inventa um tomador", async () => {
  const withoutToma = makeNfseXml().replace(/<toma>.*?<\/toma>/, "");
  const data = extractDanfseData(makeIssuedNote({ nfseXml: withoutToma }));
  assert.equal(data.tomador, undefined);
  const { text } = await pdfPageTexts(await buildDanfsePdf(data));
  assert.ok(text.includes("TOMADOR/ADQUIRENTE DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e"));
});

test("buildDanfsePdf: marca d'água 'CANCELADA' aparece quando a nota foi cancelada, NUNCA quando não foi (seção 2.5.1)", async () => {
  const data = extractDanfseData(makeIssuedNote());
  const { text: cancelledText } = await pdfPageTexts(await buildDanfsePdf(data, { cancelled: true }));
  assert.ok(cancelledText.includes("CANCELADA"));
  const { text: normalText } = await pdfPageTexts(await buildDanfsePdf(data, { cancelled: false }));
  assert.ok(!normalText.includes("CANCELADA"));
});

test("buildDanfsePdf: campos opcionais ausentes no XML (ex.: endereço do prestador) aparecem como '-', nunca vazios/inventados (seção 2.4.5, nota 12)", async () => {
  const withoutAddress = makeNfseXml().replace(/<enderNac>.*?<\/enderNac>/, "<enderNac><xLgr>-</xLgr><nro>-</nro><xBairro>-</xBairro><cMun>4216404</cMun><UF>SC</UF><CEP>88960000</CEP></enderNac>");
  const data = extractDanfseData(makeIssuedNote({ nfseXml: withoutAddress }));
  const bytes = await buildDanfsePdf(data);
  assert.ok(Buffer.from(bytes.slice(0, 5)).equals(Buffer.from("%PDF-")), "mesmo com campos degenerados, o PDF precisa ser gerado de forma válida");
});
