import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ACTIONS_SOURCE = readFileSync(
  resolve(__dirname, "../src/app/complementar-cadastro/actions.ts"),
  "utf8",
);

/**
 * Server Actions de "use server" não são chamáveis fora de um request
 * Next.js real (dependem de cookies()/createSupabaseServerClient()) —
 * mesma limitação já aceita no projeto para todo wrapper fino sobre
 * Supabase. Em vez de simular, estas verificações lêem o CÓDIGO REAL
 * da Server Action e confirmam, estruturalmente, as garantias pedidas
 * na pré-homologação (02/11/2026): nenhuma ação lê/grava sem sessão
 * verificada; nenhuma ação aceita clientId/authUserId do chamador;
 * o envio de OTP nunca afirma sucesso quando o canal falha.
 */

function extractFunction(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `função ${name} não encontrada`);
  const nextExport = source.indexOf("\nexport async function", start + 1);
  return nextExport === -1 ? source.slice(start) : source.slice(start, nextExport);
}

for (const fn of [
  "getClientCompletionSnapshotAction",
  "saveClientCompletionDataAction",
  "addClientCompletionFamilyMemberAction",
  "addClientCompletionRelatedPersonAction",
]) {
  test(`${fn} exige sessão verificada (requireVerifiedSession) ANTES de qualquer chamada ao banco — nenhuma leitura/escrita sem posse de canal confirmada`, () => {
    const body = extractFunction(ACTIONS_SOURCE, fn);
    const sessionIdx = body.indexOf("requireVerifiedSession(token)");
    const errorCheckIdx = body.indexOf('"error" in session');
    const firstRpcIdx = body.indexOf(".rpc(");
    assert.ok(sessionIdx >= 0, `${fn} não chama requireVerifiedSession`);
    assert.ok(errorCheckIdx > sessionIdx, `${fn} não verifica o erro da sessão antes de prosseguir`);
    assert.ok(firstRpcIdx > errorCheckIdx, `${fn} chama o banco antes de confirmar a sessão verificada`);
  });

  test(`${fn} nunca aceita clientId ou authUserId como parâmetro vindo do chamador — identidade só vem da sessão do servidor`, () => {
    const body = extractFunction(ACTIONS_SOURCE, fn);
    const signatureEnd = body.indexOf("): Promise<");
    const signature = body.slice(0, signatureEnd);
    assert.doesNotMatch(signature, /\bclientId\b/);
    assert.doesNotMatch(signature, /\bauthUserId\b/);
  });
}

test("sendClientCompletionOtpAction só retorna sucesso (sent: true) DEPOIS de checar o erro do envio — nunca afirma envio quando o canal OTP falha/não está configurado", () => {
  const body = extractFunction(ACTIONS_SOURCE, "sendClientCompletionOtpAction");
  const errorCheckIdx = body.indexOf("if (error) return { error:");
  const successIdx = body.indexOf("{ ok: true, sent: true }");
  assert.ok(errorCheckIdx >= 0, "checagem de erro do signInWithOtp não encontrada");
  assert.ok(successIdx > errorCheckIdx, "sucesso é retornado antes (ou sem) checar o erro do envio");
  // A própria mensagem de erro nunca promete envio bem-sucedido.
  assert.doesNotMatch(body.slice(errorCheckIdx, errorCheckIdx + 120), /enviado|sucesso/i);
});

test("verifyClientCompletionOtpAction confere o resultado do Supabase Auth (data.user?.id) antes de marcar o canal como verificado — nunca confia em código correto sozinho", () => {
  const body = extractFunction(ACTIONS_SOURCE, "verifyClientCompletionOtpAction");
  const verifyIdx = body.indexOf("db.auth.verifyOtp(");
  const guardIdx = body.indexOf("if (error || !data.user?.id)");
  const rpcIdx = body.indexOf("verify_client_completion_channel");
  assert.ok(verifyIdx >= 0 && guardIdx > verifyIdx && rpcIdx > guardIdx);
});

test("nenhuma Server Action deste arquivo usa a chave publishable do navegador para gravar — toda escrita passa por createSupabaseAdminClient (service_role)", () => {
  const writeFns = ["saveClientCompletionDataAction", "addClientCompletionFamilyMemberAction", "addClientCompletionRelatedPersonAction", "getClientCompletionSnapshotAction"];
  for (const fn of writeFns) {
    const body = extractFunction(ACTIONS_SOURCE, fn);
    assert.match(body, /createSupabaseAdminClient\(\)/, `${fn} não usa o cliente admin`);
  }
});
