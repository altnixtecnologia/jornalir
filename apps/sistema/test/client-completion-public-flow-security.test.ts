import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKENS_MIGRATION = readFileSync(
  resolve(__dirname, "../../../supabase/migrations/20261120300000_client_completion_tokens.sql"),
  "utf8",
);
const PUBLIC_FLOW_MIGRATION = readFileSync(
  resolve(__dirname, "../../../supabase/migrations/20261120310000_client_completion_public_flow.sql"),
  "utf8",
);

/**
 * Lê o SQL REAL das duas migrations do fluxo público de complementação
 * cadastral (Bloco D) e confirma, por inspeção do texto de verdade —
 * nunca uma cópia da lógica —, as garantias de segurança pedidas na
 * pré-homologação (02/11/2026): token expirado/revogado/utilizado/de
 * outra pessoa nunca permite leitura nem escrita; CPF/CNPJ nunca é
 * usado como autenticação; consentimento de publicação nunca é
 * presumido. Não há Postgres real neste ambiente — isto é o mais
 * próximo de um teste executável que a lógica 100% SQL permite (mesmo
 * princípio já aceito em contract-templates-seed-minutas.test.ts).
 */

function extractFunctionBody(sql: string, functionName: string): string {
  const marker = `function public.${functionName}(`;
  const start = sql.indexOf(marker);
  assert.ok(start >= 0, `função ${functionName} não encontrada na migration`);
  const end = sql.indexOf("\n$$;", start);
  assert.ok(end > start, `fim da função ${functionName} não encontrado`);
  return sql.slice(start, end);
}

test("require_verified_client_completion (helper central) exige service_role, status='verified', mesmo verified_user_id e não expirado — nenhuma das quatro checagens falta", () => {
  const body = extractFunctionBody(PUBLIC_FLOW_MIGRATION, "require_verified_client_completion");
  assert.match(body, /auth\.role\(\)\s+is\s+distinct\s+from\s+'service_role'/i);
  assert.match(body, /v_row\.status\s*<>\s*'verified'/);
  assert.match(body, /v_row\.verified_user_id\s+is\s+distinct\s+from\s+p_auth_user_id/);
  assert.match(body, /v_row\.expires_at\s*<=\s*now\(\)/);
});

for (const fn of ["get_client_completion_snapshot", "public_complete_add_family_member", "public_complete_add_related_person"]) {
  test(`${fn} (leitura/escrita do fluxo público) sempre chama require_verified_client_completion antes de tocar o cadastro`, () => {
    const body = extractFunctionBody(PUBLIC_FLOW_MIGRATION, fn);
    assert.match(body, /public\.require_verified_client_completion\(p_token_sha256,\s*p_auth_user_id\)/);
  });
}

test("consume_client_completion_token (passo final) exige status='verified' + mesmo verified_user_id + não expirado — token completed/pending/revoked/expired/de outra pessoa é recusado", () => {
  const body = extractFunctionBody(PUBLIC_FLOW_MIGRATION, "consume_client_completion_token");
  assert.match(body, /v_row\.status\s*<>\s*'verified'/);
  assert.match(body, /v_row\.verified_user_id\s+is\s+distinct\s+from\s+p_auth_user_id/);
  assert.match(body, /v_row\.expires_at\s*<=\s*now\(\)/);
});

test("nenhuma função do fluxo público aceita CPF/CNPJ/kind como entrada ou como campo alterável — identidade nunca muda por este link", () => {
  assert.doesNotMatch(PUBLIC_FLOW_MIGRATION, /p_cpf|p_cnpj/i);
  // allow-list de consume_client_completion_token: nunca inclui cpf/cnpj/kind.
  const allowListMatch = /v_allowed_keys text\[\] := array\[([\s\S]*?)\];/.exec(PUBLIC_FLOW_MIGRATION);
  assert.ok(allowListMatch, "allow-list de consume_client_completion_token não encontrada");
  const allowList = allowListMatch![1];
  assert.doesNotMatch(allowList, /'cpf'|'cnpj'|'kind'/);
});

test("publish_in_print de familiar nunca é gravado como true sem o consentimento explícito (p_consent) — nunca presumido", () => {
  const body = extractFunctionBody(PUBLIC_FLOW_MIGRATION, "public_complete_add_family_member");
  // publish_in_print só pode vir de uma expressão que depende de p_consent
  // (coalesce(p_consent, false)) — nunca um literal "true" isolado.
  assert.match(body, /coalesce\(p_consent,\s*false\)/);
  assert.doesNotMatch(body.replace(/coalesce\(p_consent,\s*false\)/g, ""), /publish_in_print['"]?\s*,?\s*true/i);
});

test("titular_consent (consentimento do próprio titular) só grava publish_in_print=true quando o valor informado é explicitamente true — nunca por omissão", () => {
  const body = extractFunctionBody(PUBLIC_FLOW_MIGRATION, "consume_client_completion_token");
  const titularBlock = /if p_updates \? 'titular_consent' then([\s\S]*?)end if;/.exec(body);
  assert.ok(titularBlock, "bloco de titular_consent não encontrado");
  assert.match(titularBlock![1], /\(p_updates->>'titular_consent'\)::boolean/);
});

test("reserve_client_completion_otp e verify_client_completion_channel (verificação de posse de canal) são restritas a service_role, nunca a anon/authenticated direto", () => {
  for (const fn of ["reserve_client_completion_otp", "verify_client_completion_channel"]) {
    const revokeLine = new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated;`);
    assert.match(TOKENS_MIGRATION, revokeLine, `${fn} precisa revogar public/anon/authenticated`);
    const grantLine = new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to service_role;`);
    assert.match(TOKENS_MIGRATION, grantLine, `${fn} precisa conceder só a service_role`);
  }
});

test("generate_client_completion_token (gerar o link) exige is_active_staff() e nunca é concedida a anon — só a equipe autenticada gera o link", () => {
  const body = extractFunctionBody(TOKENS_MIGRATION, "generate_client_completion_token");
  assert.match(body, /if not public\.is_active_staff\(\) then/);
  assert.match(TOKENS_MIGRATION, /revoke all on function public\.generate_client_completion_token\([^)]*\) from public, anon;/);
});

test("verify_client_completion_channel só transiciona de 'pending' — nunca re-verifica um token já verified/completed (uso único da verificação)", () => {
  const body = extractFunctionBody(TOKENS_MIGRATION, "verify_client_completion_channel");
  assert.match(body, /v_row\.status\s*<>\s*'pending'/);
});

test("reserve_client_completion_otp aplica o mesmo limite já aprovado (60s entre pedidos, máx. 8 por janela de 24h)", () => {
  const body = extractFunctionBody(TOKENS_MIGRATION, "reserve_client_completion_otp");
  assert.match(body, /interval '60 seconds'/);
  assert.match(body, /interval '24 hours'/);
  assert.match(body, />=\s*8/);
});

test("client_completion_tokens: só um token ativo (pending/verified) por cliente — índice único parcial impede dois links simultâneos", () => {
  assert.match(
    TOKENS_MIGRATION,
    /create unique index client_completion_tokens_single_active_idx[\s\S]*?where status in \('pending', 'verified'\);/,
  );
});

test("birthday_entries_publish_requires_consent (Bloco B, reaproveitada pelo Bloco D) continua exigindo consent_status='granted' para publicar — nunca enfraquecida", () => {
  const consentMigration = readFileSync(
    resolve(__dirname, "../../../supabase/migrations/20261120290000_birthday_entries_consent_and_sync.sql"),
    "utf8",
  );
  assert.match(consentMigration, /check \(publish_in_print = false or consent_status = 'granted'\)/);
});
