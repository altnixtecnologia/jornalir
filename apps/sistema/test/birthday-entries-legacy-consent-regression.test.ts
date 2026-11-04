import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const MIGRATION_PATH = resolve(
  __dirname,
  "../../../supabase/migrations/20261120290000_birthday_entries_consent_and_sync.sql",
);

/**
 * Regressão real (03/11/2026): a consulta de leitura em produção
 * (site-system-ir) encontrou 1 linha de public.birthday_entries com
 * publish_in_print = true. Como consent_status nasce 'pending' por
 * default, a nova CHECK birthday_entries_publish_requires_consent
 * (publish_in_print = false OR consent_status = 'granted') rejeitaria essa
 * linha legada e a migration falharia ao aplicar. A correção é um UPDATE
 * que despublica (nunca apaga) qualquer linha sem consentimento 'granted'
 * — este teste lê o SQL REAL da migration e garante que esse UPDATE
 * continua existindo, na ordem certa, e que nenhuma versão futura passa a
 * forjar consent_status='granted' para resolver o mesmo problema.
 */
const sql = readFileSync(MIGRATION_PATH, "utf8");

function indexOfOrFail(haystack: string, needle: string, label: string): number {
  const idx = haystack.indexOf(needle);
  assert.ok(idx >= 0, `${label} não encontrado no SQL da migration`);
  return idx;
}

test("a migration despublica (nunca apaga) qualquer linha legada com publish_in_print=true sem consentimento concedido", () => {
  const updateRe =
    /update\s+public\.birthday_entries\s+set\s+publish_in_print\s*=\s*false\s+where\s+publish_in_print\s*=\s*true\s+and\s+consent_status\s+is\s+distinct\s+from\s+'granted'/i;
  assert.match(sql, updateRe, "o UPDATE de correção do dado legado não foi encontrado — a migration voltaria a falhar ao aplicar sobre uma linha com publish_in_print=true");
});

test("o UPDATE de correção nunca forja consent_status='granted' — só desliga publish_in_print", () => {
  const updateStart = indexOfOrFail(sql, "update public.birthday_entries", "UPDATE de correção do dado legado");
  const updateEnd = sql.indexOf(";", updateStart);
  assert.ok(updateEnd > updateStart, "fim do UPDATE de correção não encontrado");
  const updateStatement = sql.slice(updateStart, updateEnd);
  assert.doesNotMatch(updateStatement, /consent_status\s*=\s*'granted'/i, "regressão: o UPDATE de correção não deveria nunca atribuir consent_status='granted' automaticamente — isso presumiria consentimento");
});

test("o UPDATE de correção do dado legado roda ANTES da constraint birthday_entries_publish_requires_consent", () => {
  const updateIdx = indexOfOrFail(sql, "update public.birthday_entries", "UPDATE de correção do dado legado");
  const constraintIdx = indexOfOrFail(sql, "birthday_entries_publish_requires_consent", "constraint birthday_entries_publish_requires_consent");
  assert.ok(updateIdx < constraintIdx, "o UPDATE de correção precisa ocorrer ANTES de criar a constraint, para que a validação dos dados existentes não falhe");
});

test("o UPDATE de correção roda DEPOIS da coluna consent_status existir (não pode referenciar coluna ainda não criada)", () => {
  const columnIdx = indexOfOrFail(sql, "add column if not exists consent_status", "criação da coluna consent_status");
  const updateIdx = indexOfOrFail(sql, "update public.birthday_entries", "UPDATE de correção do dado legado");
  assert.ok(columnIdx < updateIdx, "a coluna consent_status precisa existir antes do UPDATE que a referencia");
});
