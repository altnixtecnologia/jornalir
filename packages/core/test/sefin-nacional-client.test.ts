import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync, gunzipSync } from "node:zlib";
import { MockAgent } from "undici";
import { SefinNacionalClient } from "../src/nfse/sefin-nacional-client";
import { NfseIntegrationError } from "../src/nfse/integration-errors";
import { parseAuthorizationResponse, parseRejectionResponse } from "../src/nfse/dps-builder";

const SIGNED_DPS_XML = "<DPS><infDPS Id=\"DPS4216404199999999999999999999900001000000000001\"></infDPS></DPS>";

function fakeNfseXml(): string {
  return (
    '<NFSe versao="1.01"><infNFSe Id="NFS42164041199999999999999999900000000012026100001"><nNFSe>12</nNFSe>' +
    "<dhProc>2026-10-25T12:00:00Z</dhProc></infNFSe></NFSe>"
  );
}

test("transmitDps: emissão autorizada — descompacta nfseXmlGZipB64, aceita chaveAcesso explícito, nunca inventa", async () => {
  const mock = new MockAgent();
  mock.disableNetConnect();
  const pool = mock.get("https://sefin.producaorestrita.nfse.gov.br");
  let receivedBody = "";
  pool
    .intercept({
      path: "/API/SefinNacional/nfse",
      method: "POST",
      body: (body) => { receivedBody = String(body); return true; },
    })
    .reply(200, {
      chaveAcesso: "421640419999999999999999999990000000001202610",
      nfseXmlGZipB64: gzipSync(Buffer.from(fakeNfseXml(), "utf8")).toString("base64"),
    });

  const client = new SefinNacionalClient(mock, 2_000, () => undefined);
  const envelope = await client.transmitDps(SIGNED_DPS_XML, "homologation");

  // O corpo enviado precisa ser exatamente {dpsXmlGZipB64: <gzip+base64 do XML assinado>} —
  // nunca o XML cru, nunca outro formato (3 fontes independentes convergem nisso).
  const sentJson = JSON.parse(receivedBody) as { dpsXmlGZipB64: string };
  const decompressedSent = gunzipSync(Buffer.from(sentJson.dpsXmlGZipB64, "base64")).toString("utf8");
  assert.equal(decompressedSent, SIGNED_DPS_XML);

  assert.equal(envelope.status, "authorized");
  assert.equal(envelope.accessKey, "421640419999999999999999999990000000001202610");
  assert.equal(envelope.nfseNumber, "12");
  assert.equal(envelope.issuedAt, "2026-10-25T12:00:00Z");
  assert.equal(envelope.nfseXml, fakeNfseXml());

  // O contrato interno existente (dps-builder.ts) continua funcionando com o envelope real.
  const authorization = parseAuthorizationResponse(envelope);
  assert.ok(authorization);
  assert.equal(authorization?.accessKey, "421640419999999999999999999990000000001202610");
  await mock.close();
});

test("transmitDps: sem chaveAcesso na resposta -> falha fechado, NUNCA deriva do atributo Id", async () => {
  const mock = new MockAgent();
  mock.disableNetConnect();
  const pool = mock.get("https://sefin.producaorestrita.nfse.gov.br");
  pool.intercept({ path: "/API/SefinNacional/nfse", method: "POST" }).reply(200, {
    nfseXmlGZipB64: gzipSync(Buffer.from(fakeNfseXml(), "utf8")).toString("base64"),
  });
  const client = new SefinNacionalClient(mock, 2_000, () => undefined);
  await assert.rejects(
    () => client.transmitDps(SIGNED_DPS_XML, "homologation"),
    (error: unknown) => error instanceof NfseIntegrationError && error.code === "NFSE_INVALID_RESPONSE" && error.message.includes("chaveAcesso"),
  );
  await mock.close();
});

test("transmitDps: rejeição real (E999) — interpreta erros[0].Codigo/Descricao exatamente como visto em produção restrita", async () => {
  const mock = new MockAgent();
  mock.disableNetConnect();
  const pool = mock.get("https://sefin.producaorestrita.nfse.gov.br");
  pool.intercept({ path: "/API/SefinNacional/nfse", method: "POST" }).reply(400, {
    erros: [{ Codigo: "E999", Descricao: "Erro não catalogado" }],
  });
  const client = new SefinNacionalClient(mock, 2_000, () => undefined);
  const envelope = await client.transmitDps(SIGNED_DPS_XML, "homologation");
  assert.equal(envelope.status, "rejected");
  assert.deepEqual(envelope.rejection, { code: "E999", message: "Erro não catalogado" });

  const rejection = parseRejectionResponse(envelope);
  assert.deepEqual(rejection, { code: "E999", message: "Erro não catalogado" });
  await mock.close();
});

test("transmitDps: aceita também a capitalização codigo/descricao (segunda fonte observada)", async () => {
  const mock = new MockAgent();
  mock.disableNetConnect();
  const pool = mock.get("https://sefin.producaorestrita.nfse.gov.br");
  pool.intercept({ path: "/API/SefinNacional/nfse", method: "POST" }).reply(400, {
    erros: [{ codigo: "E123", descricao: "DPS fora do schema." }],
  });
  const client = new SefinNacionalClient(mock, 2_000, () => undefined);
  const envelope = await client.transmitDps(SIGNED_DPS_XML, "homologation");
  assert.deepEqual(envelope.rejection, { code: "E123", message: "DPS fora do schema." });
  await mock.close();
});

test("transmitDps: rejeição sem corpo JSON interpretável nunca trava — devolve UNKNOWN em vez de lançar erro genérico", async () => {
  const mock = new MockAgent();
  mock.disableNetConnect();
  const pool = mock.get("https://sefin.producaorestrita.nfse.gov.br");
  pool.intercept({ path: "/API/SefinNacional/nfse", method: "POST" }).reply(500, "erro interno do gateway");
  const client = new SefinNacionalClient(mock, 2_000, () => undefined);
  const envelope = await client.transmitDps(SIGNED_DPS_XML, "homologation");
  assert.equal(envelope.status, "rejected");
  assert.equal(envelope.rejection?.code, "UNKNOWN");
  await mock.close();
});

test("getNfseByAccessKey: descompacta nfseXmlGZipB64 da consulta por chave", async () => {
  const mock = new MockAgent();
  mock.disableNetConnect();
  const pool = mock.get("https://sefin.producaorestrita.nfse.gov.br");
  pool
    .intercept({ path: "/API/SefinNacional/nfse/421640419999999999999999999990000000001202610", method: "GET" })
    .reply(200, { nfseXmlGZipB64: gzipSync(Buffer.from(fakeNfseXml(), "utf8")).toString("base64") });
  const client = new SefinNacionalClient(mock, 2_000, () => undefined);
  const xml = await client.getNfseByAccessKey("421640419999999999999999999990000000001202610", "homologation");
  assert.equal(xml, fakeNfseXml());
  await mock.close();
});

test("getNfseByAccessKey: 404 nunca é tratado como sucesso silencioso", async () => {
  const mock = new MockAgent();
  mock.disableNetConnect();
  const pool = mock.get("https://sefin.producaorestrita.nfse.gov.br");
  pool.intercept({ path: "/API/SefinNacional/nfse/CHAVE-INEXISTENTE", method: "GET" }).reply(404, {});
  const client = new SefinNacionalClient(mock, 2_000, () => undefined);
  await assert.rejects(
    () => client.getNfseByAccessKey("CHAVE-INEXISTENTE", "homologation"),
    (error: unknown) => error instanceof NfseIntegrationError && error.httpStatus === 404,
  );
  await mock.close();
});

test("getDpsById: 404 e 403 devolvem null (nunca erro) — permissão negada não é falha de transporte", async () => {
  const mock = new MockAgent();
  mock.disableNetConnect();
  const pool = mock.get("https://sefin.producaorestrita.nfse.gov.br");
  pool.intercept({ path: "/API/SefinNacional/dps/dps-1", method: "GET" }).reply(404, {});
  pool.intercept({ path: "/API/SefinNacional/dps/dps-2", method: "GET" }).reply(403, {});
  const client = new SefinNacionalClient(mock, 2_000, () => undefined);
  assert.equal(await client.getDpsById("dps-1", "homologation"), null);
  assert.equal(await client.getDpsById("dps-2", "homologation"), null);
  await mock.close();
});

test("resposta maior que o limite de segurança é rejeitada antes de qualquer parsing", async () => {
  const mock = new MockAgent();
  mock.disableNetConnect();
  const pool = mock.get("https://sefin.producaorestrita.nfse.gov.br");
  const huge = "x".repeat(3 * 1024 * 1024);
  pool.intercept({ path: "/API/SefinNacional/nfse", method: "POST" }).reply(200, huge, {
    headers: { "content-length": String(Buffer.byteLength(huge)) },
  });
  const client = new SefinNacionalClient(mock, 2_000, () => undefined);
  await assert.rejects(
    () => client.transmitDps(SIGNED_DPS_XML, "homologation"),
    (error: unknown) => error instanceof NfseIntegrationError && error.code === "NFSE_INVALID_RESPONSE",
  );
  await mock.close();
});

test("produção continua operacionalmente bloqueada mesmo para o cliente real (assertNfseOperationAllowed)", async () => {
  const mock = new MockAgent();
  mock.disableNetConnect();
  const client = new SefinNacionalClient(mock, 2_000, () => undefined);
  await assert.rejects(() => client.transmitDps(SIGNED_DPS_XML, "production"), /bloqueadas/);
  await mock.close();
});
