import { test } from "node:test";
import assert from "node:assert/strict";
import forge from "node-forge";
import { buildDpsXml } from "../src/nfse/dps-builder";
import { signDpsXml, NFSE_DPS_SIGNATURE_PROFILE } from "../src/nfse/signature";
import { validateDpsAgainstOfficialXsd } from "../src/nfse/xsd-validator";

/** Certificado/chave de TESTE gerados localmente (node-forge) — NUNCA um
 * certificado real (item 10 do ajuste de segurança Parte 2B). */
function makeTestKeyAndCert(): { privateKeyPem: string; certificatePem: string } {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const attrs = [{ name: "commonName", value: "TESTE INFORMATIVO REGIONAL LTDA:23970969000190" }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return {
    privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
    certificatePem: forge.pki.certificateToPem(cert),
  };
}

function makeSignedXml() {
  const xml = buildDpsXml({
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
  });
  const { privateKeyPem, certificatePem } = makeTestKeyAndCert();
  const result = signDpsXml({ xml, privateKeyPem, certificatePem });
  return { xml, result };
}

test("signDpsXml usa o perfil oficial fixo (RSA-SHA1/SHA1/C14N) — nunca escolha manual", () => {
  const { result } = makeSignedXml();
  assert.equal(result.signatureAlgorithm, "http://www.w3.org/2000/09/xmldsig#rsa-sha1");
  assert.equal(result.digestAlgorithm, "http://www.w3.org/2000/09/xmldsig#sha1");
  assert.equal(NFSE_DPS_SIGNATURE_PROFILE.canonicalizationAlgorithm, "http://www.w3.org/TR/2001/REC-xml-c14n-20010315");
});

test("assinatura é ENVELOPED dentro de DPS, depois de infDPS", () => {
  const { result } = makeSignedXml();
  assert.ok(result.signedXml.includes("</infDPS><Signature") || result.signedXml.includes("</infDPS>\n<Signature") || /<\/infDPS>\s*<Signature/.test(result.signedXml));
  assert.ok(result.signedXml.trim().endsWith("</DPS>"));
});

test("Reference aponta para o Id do infDPS (URI = '#' + Id) — nunca um Id novo/gerado", () => {
  const { xml, result } = makeSignedXml();
  const idMatch = xml.match(/<infDPS Id="([^"]+)"/);
  assert.ok(idMatch, "infDPS deve ter atributo Id");
  const dpsId = idMatch![1];
  assert.equal(dpsId.length, 45);
  assert.ok(dpsId.startsWith("DPS"));
  assert.ok(result.signedXml.includes(`URI="#${dpsId}"`));
});

test("Transforms incluem enveloped-signature e C14N (nesta ordem)", () => {
  const { result } = makeSignedXml();
  const transformsMatch = result.signedXml.match(/<Transforms>(.*?)<\/Transforms>/s);
  assert.ok(transformsMatch);
  const transformsXml = transformsMatch![1];
  const envIdx = transformsXml.indexOf("http://www.w3.org/2000/09/xmldsig#enveloped-signature");
  const c14nIdx = transformsXml.indexOf("http://www.w3.org/TR/2001/REC-xml-c14n-20010315");
  assert.ok(envIdx >= 0 && c14nIdx >= 0 && envIdx < c14nIdx);
});

test("SignatureMethod é RSA-SHA1 e DigestMethod é SHA1 (perfil oficial confirmado)", () => {
  const { result } = makeSignedXml();
  assert.ok(result.signedXml.includes('<SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"'));
  assert.ok(result.signedXml.includes('<DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"'));
});

test("KeyInfo contém X509Certificate (EndCertOnly) e NUNCA RSAKeyValue/Modulus/Exponent", () => {
  const { result } = makeSignedXml();
  assert.ok(result.signedXml.includes("<X509Certificate>"));
  assert.ok(!result.signedXml.includes("RSAKeyValue"));
  assert.ok(!result.signedXml.includes("<Modulus>"));
  assert.ok(!result.signedXml.includes("<Exponent>"));
});

test("CanonicalizationMethod do SignedInfo é C14N 1.0 (não exclusivo)", () => {
  const { result } = makeSignedXml();
  assert.ok(result.signedXml.includes('<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"'));
  assert.ok(!result.signedXml.includes("xml-exc-c14n"));
});

test("Parte 2C, item 11: a DPS assinada continua estruturalmente válida contra o XSD oficial (TCDPS aceita ds:Signature) — assinatura nunca quebra a conformidade", async () => {
  const { result } = makeSignedXml();
  const xsdResult = await validateDpsAgainstOfficialXsd(result.signedXml);
  assert.deepEqual(xsdResult.errors, []);
  assert.equal(xsdResult.valid, true);
});
