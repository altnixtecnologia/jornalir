import { test } from "node:test";
import assert from "node:assert/strict";
import forge from "node-forge";
import { buildCancellationEventXml } from "../src/nfse/event-builder";
import { signCancellationEventXml } from "../src/nfse/signature";
import { validatePedRegEventoAgainstOfficialXsd } from "../src/nfse/xsd-validator";

/** Certificado/chave de TESTE gerados localmente (node-forge) — NUNCA um certificado real (mesmo princípio de signature.test.ts). */
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
  return { privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey), certificatePem: forge.pki.certificateToPem(cert) };
}

// 9º caractere do Id ("PRE"+chave+tipo) cai em "2" — satisfaz também o regex do XSD pro atributo Id
// (ver ressalva honesta em event-builder.ts), pra este teste focar só na assinatura, não na contradição externa do Id.
const SAMPLE_ACCESS_KEY = "421640" + "99299999999999" + "999999999990000000001202610001";

function makeSignedXml() {
  const xml = buildCancellationEventXml({
    accessKey: SAMPLE_ACCESS_KEY,
    authorCnpj: "23970969000190",
    justificationCode: 1,
    justificationText: "Erro de digitação no valor do serviço na emissão original.",
    environment: "homologation",
    now: new Date("2026-10-25T14:00:00.000Z"),
  });
  const { privateKeyPem, certificatePem } = makeTestKeyAndCert();
  const result = signCancellationEventXml({ xml, privateKeyPem, certificatePem });
  return { xml, result };
}

test("signCancellationEventXml usa o mesmo perfil oficial (RSA-SHA1/SHA1/C14N) da assinatura da DPS", () => {
  const { result } = makeSignedXml();
  assert.equal(result.signatureAlgorithm, "http://www.w3.org/2000/09/xmldsig#rsa-sha1");
  assert.equal(result.digestAlgorithm, "http://www.w3.org/2000/09/xmldsig#sha1");
});

test("assinatura é ENVELOPED dentro de pedRegEvento, depois de infPedReg", () => {
  const { result } = makeSignedXml();
  assert.ok(/<\/infPedReg>\s*<Signature/.test(result.signedXml));
  assert.ok(result.signedXml.trim().endsWith("</pedRegEvento>"));
});

test("Reference aponta para o Id do infPedReg (URI = '#' + Id) — nunca um Id novo/gerado", () => {
  const { xml, result } = makeSignedXml();
  const idMatch = xml.match(/<infPedReg Id="([^"]+)"/);
  assert.ok(idMatch, "infPedReg deve ter atributo Id");
  const id = idMatch![1];
  assert.equal(id.length, 59);
  assert.ok(id.startsWith("PRE"));
  assert.ok(result.signedXml.includes(`URI="#${id}"`));
});

test("o pedido de registro de evento assinado continua válido contra o XSD oficial (TCPedRegEvt aceita ds:Signature)", async () => {
  const { result } = makeSignedXml();
  const xsdResult = await validatePedRegEventoAgainstOfficialXsd(result.signedXml);
  assert.deepEqual(xsdResult.errors, []);
  assert.equal(xsdResult.valid, true);
});
