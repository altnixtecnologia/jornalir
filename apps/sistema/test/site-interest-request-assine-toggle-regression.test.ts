import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const INSTALLED_MIGRATION_PATH = resolve(
  __dirname,
  "../../../supabase/migrations/20261022072614_site_assine_visibility_toggle.sql",
);
const NEW_MIGRATION_PATH = resolve(
  __dirname,
  "../../../supabase/migrations/20261120270000_site_interest_request_identification.sql",
);

/**
 * Regressão real (03/11/2026): a primeira versão de
 * 20261120270000_site_interest_request_identification.sql reescreveu
 * submit_site_interest_request_v4 (create or replace) e removeu, sem
 * intenção, a checagem de site_offer_settings.assine_enabled que já
 * estava instalada em produção desde 20261022072614. Este teste lê os
 * dois arquivos de SQL REAIS (nunca uma cópia da lógica) e garante que
 * qualquer "create or replace" futuro desta função continue preservando
 * essa checagem, como a PRIMEIRA validação do corpo — antes de qualquer
 * outra regra ou gravação — para que o botão administrativo de
 * habilitar/desabilitar o Assine não possa ser contornado por chamada
 * direta à RPC.
 */
function extractFunctionBody(sql: string, functionName: string): string {
  const start = sql.indexOf(`create or replace function public.${functionName}(`);
  assert.ok(start >= 0, `função ${functionName} não encontrada no SQL`);
  const bodyStart = sql.indexOf("as $$", start);
  assert.ok(bodyStart >= 0, `corpo (as $$) de ${functionName} não encontrado`);
  const bodyEnd = sql.indexOf("$$;", bodyStart + 5);
  assert.ok(bodyEnd >= 0, `fim do corpo ($$;) de ${functionName} não encontrado`);
  return sql.slice(bodyStart, bodyEnd);
}

const ASSINE_GUARD_RE =
  /if\s+not\s+exists\s*\(\s*select\s+1\s+from\s+public\.site_offer_settings\s+where\s+id\s*=\s*1\s+and\s+assine_enabled\s*=\s*true\s*\)\s*then\s*\n\s*raise exception/i;

test("submit_site_interest_request_v4 instalada em produção (20261022072614) tem a checagem de assine_enabled", () => {
  const sql = readFileSync(INSTALLED_MIGRATION_PATH, "utf8");
  const body = extractFunctionBody(sql, "submit_site_interest_request_v4");
  assert.match(body, ASSINE_GUARD_RE, "a versão de produção precisa ter a checagem de assine_enabled — se isso falhar, o teste em si está desatualizado, não a migration");
});

test("submit_site_interest_request_v4 na nova migration (20261120270000) preserva a checagem de assine_enabled", () => {
  const sql = readFileSync(NEW_MIGRATION_PATH, "utf8");
  const body = extractFunctionBody(sql, "submit_site_interest_request_v4");
  assert.match(
    body,
    ASSINE_GUARD_RE,
    "regressão: a nova definição de submit_site_interest_request_v4 removeu a checagem de site_offer_settings.assine_enabled — o botão administrativo de desativar o Assine ficaria sem efeito contra chamada direta à RPC",
  );
});

test("a checagem de assine_enabled continua sendo a PRIMEIRA validação do corpo da função na nova migration", () => {
  const sql = readFileSync(NEW_MIGRATION_PATH, "utf8");
  const body = extractFunctionBody(sql, "submit_site_interest_request_v4");
  const guardMatch = body.match(ASSINE_GUARD_RE);
  assert.ok(guardMatch, "checagem de assine_enabled não encontrada");
  const guardIdx = body.indexOf(guardMatch![0]);
  const firstOtherValidationIdx = body.indexOf("raise exception 'Tipo de solicitação inválido.'");
  assert.ok(firstOtherValidationIdx >= 0, "validação de tipo de solicitação não encontrada");
  assert.ok(
    guardIdx < firstOtherValidationIdx,
    "a checagem de assine_enabled precisa vir ANTES de qualquer outra validação ou gravação",
  );
});

test("submit_site_interest_request_v4 na nova migration não perdeu o revoke/grant restrito a anon+authenticated", () => {
  const installedSql = readFileSync(INSTALLED_MIGRATION_PATH, "utf8");
  const newSql = readFileSync(NEW_MIGRATION_PATH, "utf8");
  for (const sql of [installedSql, newSql]) {
    assert.match(sql, /revoke all on function public\.submit_site_interest_request_v4\(/);
    assert.match(sql, /grant execute on function public\.submit_site_interest_request_v4\(\s*\n?[\s\S]*?\) to anon, authenticated;/);
  }
});
