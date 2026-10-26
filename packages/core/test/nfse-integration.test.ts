import { test } from "node:test";
import assert from "node:assert/strict";
import forge from "node-forge";
import { Agent, MockAgent } from "undici";
import { getNfseEnvironmentConfig } from "../src/nfse/environment";
import { NfseIntegrationError, normalizeNfseTransportError } from "../src/nfse/integration-errors";
import { NfseMunicipalParametersClient } from "../src/nfse/municipal-parameters-client";
import { createMutualTlsDispatcher } from "../src/nfse/mutual-tls";
import { buildMunicipalParametersUrl, buildTransmitDpsUrl } from "../src/nfse/national-nfse-provider";

function testIdentity(): { certificatePem: string; privateKeyPem: string } {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(Date.now() - 60_000);
  cert.validity.notAfter = new Date(Date.now() + 60_000);
  const attrs = [{ name: "commonName", value: "MTLS TEST" }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { certificatePem: forge.pki.certificateToPem(cert), privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey) };
}

test("configuração central separa Produção Restrita e Produção e mantém produção bloqueada", () => {
  assert.equal(getNfseEnvironmentConfig("homologation").label, "Produção Restrita");
  assert.equal(getNfseEnvironmentConfig("production").operationsEnabled, false);
  assert.equal(buildMunicipalParametersUrl("4216404", "homologation"), "https://adn.producaorestrita.nfse.gov.br/parametrizacao/4216404/convenio");
  // Produção Restrita usa "/API/SefinNacional"; Produção usa "/SefinNacional" SEM "/API/" —
  // paths DISTINTOS confirmados contra a própria página oficial gov.br/nfse (auditoria
  // estrutural 26/10/2026, item 7) — nunca o mesmo prefixo nos dois ambientes.
  assert.equal(buildTransmitDpsUrl("homologation"), "https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional/nfse");
  assert.equal(buildTransmitDpsUrl("production"), "https://sefin.nfse.gov.br/SefinNacional/nfse");
});

test("dispatcher mTLS é criado com certificado e chave válidos", async () => {
  const identity = testIdentity();
  const dispatcher = createMutualTlsDispatcher(identity.certificatePem, identity.privateKeyPem);
  assert.ok(dispatcher instanceof Agent);
  await dispatcher.close();
});

test("cliente ADN consulta convênio e alíquota específica do serviço no Swagger atual", async () => {
  const mock = new MockAgent();
  mock.disableNetConnect();
  const pool = mock.get("https://adn.producaorestrita.nfse.gov.br");
  pool.intercept({ path: "/parametrizacao/4216404/convenio", method: "GET" }).reply(200, { parametrosConvenio: { aderenteAmbienteNacional: 1 } });
  pool
    .intercept({ path: "/parametrizacao/4216404/170601/2026-10-06T00%3A00%3A00.000Z/aliquota", method: "GET" })
    .reply(200, { aliquotas: { "170601": [{ Aliq: 2.5 }] } });

  const logs: string[] = [];
  const client = new NfseMunicipalParametersClient(mock, 2_000, (entry) => logs.push(entry.logicalEndpoint));
  const result = await client.queryMunicipalityAndService({
    municipalityCode: "4216404",
    serviceCode: "170601",
    competence: "2026-10-06T00:00:00.000Z",
  });
  assert.equal(result.environment, "restricted");
  assert.equal(result.serviceCode, "170601");
  assert.equal(result.competence, "2026-10-06T00:00:00.000Z");
  assert.deepEqual(logs.sort(), ["municipal-agreement", "municipal-service-rate"]);
  await mock.close();
});

test("cliente ADN normaliza erro HTTP sem tratar payload como sucesso", async () => {
  const mock = new MockAgent();
  mock.disableNetConnect();
  const pool = mock.get("https://adn.producaorestrita.nfse.gov.br");
  pool.intercept({ path: "/parametrizacao/4216404/convenio", method: "GET" }).reply(500, { segredo: "não deve ser logado" });
  pool
    .intercept({ path: "/parametrizacao/4216404/170601/2026-10-06T00%3A00%3A00.000Z/aliquota", method: "GET" })
    .reply(200, { aliquotas: {} });
  const logs: Array<{ message: string; code?: string }> = [];
  const client = new NfseMunicipalParametersClient(mock, 2_000, (entry) => logs.push({ message: entry.message, code: entry.errorCode }));
  await assert.rejects(
    () => client.queryMunicipalityAndService({ municipalityCode: "4216404", serviceCode: "170601", competence: "2026-10-06T00:00:00.000Z" }),
    (error: unknown) => error instanceof NfseIntegrationError && error.code === "NFSE_HTTP_ERROR",
  );
  assert.ok(logs.every((entry) => !entry.message.includes("segredo")));
  await mock.close();
});

test("cliente ADN rejeita resposta que não seja JSON válido", async () => {
  const mock = new MockAgent();
  mock.disableNetConnect();
  const pool = mock.get("https://adn.producaorestrita.nfse.gov.br");
  pool.intercept({ path: "/parametrizacao/4216404/convenio", method: "GET" }).reply(200, "não-json");
  pool
    .intercept({ path: "/parametrizacao/4216404/170601/2026-10-06T00%3A00%3A00.000Z/aliquota", method: "GET" })
    .reply(200, { aliquotas: {} });
  const client = new NfseMunicipalParametersClient(mock, 2_000, () => undefined);
  await assert.rejects(
    () => client.queryMunicipalityAndService({ municipalityCode: "4216404", serviceCode: "170601", competence: "2026-10-06T00:00:00.000Z" }),
    (error: unknown) => error instanceof NfseIntegrationError && error.code === "NFSE_INVALID_RESPONSE",
  );
  await mock.close();
});

test("erros de timeout e TLS recebem códigos estáveis e mensagens sanitizadas", () => {
  const timeout = normalizeNfseTransportError(Object.assign(new Error("detalhe interno"), { code: "UND_ERR_CONNECT_TIMEOUT" }));
  const tls = normalizeNfseTransportError(Object.assign(new Error("private key material"), { code: "ERR_TLS_CERT_ALTNAME_INVALID" }));
  assert.equal(timeout.code, "NFSE_TIMEOUT");
  assert.equal(tls.code, "NFSE_TLS_ERROR");
  assert.ok(!tls.message.includes("private key material"));
});
