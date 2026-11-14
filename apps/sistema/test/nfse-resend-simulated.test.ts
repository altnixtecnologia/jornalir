import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  sendFiscalEmail, isNfseEmailConfigured,
  EmailOutcomeUncertainError, EmailRejectedByProviderError,
} from "../src/lib/nfse/resendDelivery";

// Simulação 100% local: fetch é substituído, credenciais são fictícias e NADA sai da máquina.
const realFetch = globalThis.fetch;
const saved = { key: process.env.RESEND_API_KEY, from: process.env.NFSE_EMAIL_FROM };
type Call = { url: string; init: RequestInit };
let calls: Call[] = [];
let reply: () => Promise<Response> = async () => new Response(JSON.stringify({ id: "msg_fake_1" }), { status: 200 });

beforeEach(() => {
  calls = [];
  process.env.RESEND_API_KEY = "re_FAKE_KEY_FOR_SIMULATION_ONLY";
  process.env.NFSE_EMAIL_FROM = "Jornal Informativo Regional - NFS-e <nfse@altnix.com.br>";
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return reply();
  }) as typeof fetch;
  reply = async () => new Response(JSON.stringify({ id: "msg_fake_1" }), { status: 200 });
});
afterEach(() => {
  globalThis.fetch = realFetch;
  if (saved.key === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = saved.key;
  if (saved.from === undefined) delete process.env.NFSE_EMAIL_FROM; else process.env.NFSE_EMAIL_FROM = saved.from;
});

const pdf = Buffer.from("%PDF-1.4 fictício\n%%EOF\n", "latin1");
const xml = Buffer.from('<?xml version="1.0"?><Teste>fictício</Teste>', "utf8");
const input = (over: Record<string, unknown> = {}) => ({
  attemptId: "11111111-1111-4111-8111-111111111111", to: "autorizado@example.com", noteNumber: "123",
  attachments: [
    { filename: "DANFSe-123.pdf", contentType: "application/pdf" as const, bytes: pdf },
    { filename: "NFS-e-123.xml", contentType: "application/xml" as const, bytes: xml },
  ],
  ...over,
});
const rejects = (p: Promise<unknown>, type: new (...a: never[]) => Error) => assert.rejects(p, (e) => e instanceof type);

test("envio válido: endpoint, autenticação, remetente, idempotência e anexos PDF+XML intactos", async () => {
  const out = await sendFiscalEmail(input());
  assert.equal(out.providerMessageId, "msg_fake_1");
  assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  assert.equal(url, "https://api.resend.com/emails");
  assert.equal(init.method, "POST");
  const h = init.headers as Record<string, string>;
  assert.equal(h["Authorization"], "Bearer re_FAKE_KEY_FOR_SIMULATION_ONLY");
  assert.equal(h["Idempotency-Key"], "nfse-email-11111111-1111-4111-8111-111111111111");
  const body = JSON.parse(String(init.body));
  assert.equal(body.from, "Jornal Informativo Regional - NFS-e <nfse@altnix.com.br>");
  assert.deepEqual(body.to, ["autorizado@example.com"]);
  assert.match(body.subject, /NFS-e nº 123/);
  assert.equal(body.attachments.length, 2);
  const byName = Object.fromEntries(body.attachments.map((a: { filename: string }) => [a.filename, a]));
  assert.equal(byName["DANFSe-123.pdf"].content_type, "application/pdf");
  assert.equal(byName["NFS-e-123.xml"].content_type, "application/xml");
  assert.ok(Buffer.from(byName["DANFSe-123.pdf"].content, "base64").equals(pdf));
  assert.ok(Buffer.from(byName["NFS-e-123.xml"].content, "base64").equals(xml));
  assert.doesNotMatch(String(init.body), /re_FAKE_KEY/, "a chave nunca vai no corpo");
  assert.doesNotMatch(String(init.body), /https?:\/\/[^"]*r2\./, "sem links públicos do R2");
});

test("assunto/texto opcionais: padrão preservado sem eles; com eles, sem quebra de linha no assunto", async () => {
  await sendFiscalEmail(input());
  await sendFiscalEmail(input({ subject: "TESTE\r\nBcc: x@y.com", text: "texto de teste" }));
  const [a, b] = calls.map((c) => JSON.parse(String(c.init.body)));
  assert.match(a.subject, /^NFS-e nº 123 — Jornal Informativo Regional$/);
  assert.equal(b.subject, "TESTE  Bcc: x@y.com");
  assert.equal(b.text, "texto de teste");
});

test("idempotência: mesma tentativa => mesma chave; tentativas diferentes => chaves diferentes", async () => {
  await sendFiscalEmail(input()); await sendFiscalEmail(input());
  await sendFiscalEmail(input({ attemptId: "22222222-2222-4222-8222-222222222222" }));
  const keys = calls.map((c) => (c.init.headers as Record<string, string>)["Idempotency-Key"]);
  assert.equal(keys[0], keys[1]);
  assert.notEqual(keys[0], keys[2]);
});

test("validações locais: sem PDF, sem XML ou destinatário inválido => rejeita sem chamar o provedor", async () => {
  await rejects(sendFiscalEmail(input({ attachments: [{ filename: "a.xml", contentType: "application/xml", bytes: xml }] })), EmailRejectedByProviderError);
  await rejects(sendFiscalEmail(input({ attachments: [{ filename: "a.pdf", contentType: "application/pdf", bytes: pdf }] })), EmailRejectedByProviderError);
  await rejects(sendFiscalEmail(input({ to: "isto-nao-e-email" })), EmailRejectedByProviderError);
  await rejects(sendFiscalEmail(input({ to: "a@b.com\r\nBcc: x@y.com" })), EmailRejectedByProviderError);
  assert.equal(calls.length, 0);
});

test("sem configuração: rejeita sem chamar o provedor", async () => {
  delete process.env.RESEND_API_KEY;
  assert.equal(isNfseEmailConfigured(), false);
  await rejects(sendFiscalEmail(input()), EmailRejectedByProviderError);
  assert.equal(calls.length, 0);
});

test("classificação do resultado: 4xx = rejeitado; 409/429/5xx/rede/timeout/JSON ruim = INCERTO (nunca reenvio automático)", async () => {
  for (const status of [400, 401, 403, 422]) {
    reply = async () => new Response("{}", { status });
    await rejects(sendFiscalEmail(input()), EmailRejectedByProviderError);
  }
  for (const status of [409, 429, 500, 502, 503]) {
    reply = async () => new Response("{}", { status });
    await rejects(sendFiscalEmail(input()), EmailOutcomeUncertainError);
  }
  reply = async () => { throw new TypeError("fetch failed"); };
  await rejects(sendFiscalEmail(input()), EmailOutcomeUncertainError);
  reply = async () => new Response("não é json", { status: 200 });
  await rejects(sendFiscalEmail(input()), EmailOutcomeUncertainError);
  reply = async () => new Response(JSON.stringify({}), { status: 200 });
  await rejects(sendFiscalEmail(input()), EmailOutcomeUncertainError);
});

test("mensagens de erro não vazam chave, destinatário nem anexos", async () => {
  reply = async () => new Response(JSON.stringify({ message: "re_FAKE_KEY_FOR_SIMULATION_ONLY invalid" }), { status: 401 });
  await assert.rejects(sendFiscalEmail(input()), (e: Error) =>
    e instanceof EmailRejectedByProviderError && !/re_FAKE|autorizado@|fictício|PDF-1/.test(e.message));
});
