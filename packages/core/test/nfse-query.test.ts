import { test } from "node:test";
import assert from "node:assert/strict";
import { MockAgent } from "undici";
import { fetchDpsById, fetchNfseByAccessKey } from "../src/nfse/national-nfse-query-client";
import { NfseIntegrationError } from "../src/nfse/integration-errors";
import { buildDpsByIdUrl, buildNfseByAccessKeyUrl } from "../src/nfse/national-nfse-provider";

function poolFor(url: string) {
  const parsed = new URL(url);
  const mock = new MockAgent();
  mock.disableNetConnect();
  return { mock, pool: mock.get(parsed.origin), path: parsed.pathname };
}

test("fetchDpsById devolve o corpo bruto em HTTP 200", async () => {
  const url = buildDpsByIdUrl("DPS123", "homologation");
  const { mock, pool, path } = poolFor(url);
  pool.intercept({ path, method: "GET" }).reply(200, "<nfse>conteudo</nfse>", { headers: { "content-type": "application/xml" } });
  const result = await fetchDpsById(mock, "DPS123", "homologation");
  assert.equal(result, "<nfse>conteudo</nfse>");
  await mock.close();
});

test("fetchDpsById devolve null em HTTP 404 — nunca trata 'não encontrado' como erro", async () => {
  const url = buildDpsByIdUrl("DPS404", "homologation");
  const { mock, pool, path } = poolFor(url);
  pool.intercept({ path, method: "GET" }).reply(404, "");
  const result = await fetchDpsById(mock, "DPS404", "homologation");
  assert.equal(result, null);
  await mock.close();
});

test("fetchNfseByAccessKey lança NfseIntegrationError em HTTP 404 (nunca devolve string vazia silenciosamente)", async () => {
  const url = buildNfseByAccessKeyUrl("CHAVE404", "homologation");
  const { mock, pool, path } = poolFor(url);
  pool.intercept({ path, method: "GET" }).reply(404, "");
  await assert.rejects(
    () => fetchNfseByAccessKey(mock, "CHAVE404", "homologation"),
    (error: unknown) => error instanceof NfseIntegrationError && error.code === "NFSE_INVALID_RESPONSE",
  );
  await mock.close();
});

test("resposta HTTP 200 vazia é tratada como inesperada, nunca como sucesso silencioso", async () => {
  const url = buildDpsByIdUrl("DPS200VAZIO", "homologation");
  const { mock, pool, path } = poolFor(url);
  pool.intercept({ path, method: "GET" }).reply(200, "");
  await assert.rejects(
    () => fetchDpsById(mock, "DPS200VAZIO", "homologation"),
    (error: unknown) => error instanceof NfseIntegrationError && error.code === "NFSE_INVALID_RESPONSE",
  );
  await mock.close();
});

test("erro HTTP (ex.: 500) é normalizado como NFSE_HTTP_ERROR, nunca confundido com 'ausência de resposta'", async () => {
  const url = buildDpsByIdUrl("DPS500", "homologation");
  const { mock, pool, path } = poolFor(url);
  pool.intercept({ path, method: "GET" }).reply(500, "erro interno");
  await assert.rejects(
    () => fetchDpsById(mock, "DPS500", "homologation"),
    (error: unknown) => error instanceof NfseIntegrationError && error.code === "NFSE_HTTP_ERROR",
  );
  await mock.close();
});

test("falha de rede/timeout é normalizada como NFSE_TIMEOUT, distinta de rejeição/erro HTTP", async () => {
  const url = buildDpsByIdUrl("DPSXX", "homologation");
  const { mock, pool, path } = poolFor(url);
  pool.intercept({ path, method: "GET" }).replyWithError(Object.assign(new Error("timeout"), { code: "UND_ERR_CONNECT_TIMEOUT" }));
  await assert.rejects(
    () => fetchDpsById(mock, "DPSXX", "homologation"),
    (error: unknown) => error instanceof NfseIntegrationError && error.code === "NFSE_TIMEOUT",
  );
  await mock.close();
});
