import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ACTIONS_SOURCE = readFileSync(
  resolve(__dirname, "../src/app/sistema/aniversariantes/actions.ts"),
  "utf8",
);
const NEW_MIGRATION = readFileSync(
  resolve(__dirname, "../../../supabase/migrations/20261120330000_birthday_entries_simplify_editorial_flow.sql"),
  "utf8",
);
const OLD_CONSENT_MIGRATION = readFileSync(
  resolve(__dirname, "../../../supabase/migrations/20261120290000_birthday_entries_consent_and_sync.sql"),
  "utf8",
);
const PUBLIC_FLOW_MIGRATION = readFileSync(
  resolve(__dirname, "../../../supabase/migrations/20261120310000_client_completion_public_flow.sql"),
  "utf8",
);

function extractFunction(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `função ${name} não encontrada`);
  const nextExport = source.indexOf("\nexport async function", start + 1);
  return nextExport === -1 ? source.slice(start) : source.slice(start, nextExport);
}

/**
 * Simplificação do módulo Aniversariantes (03/11/2026, posterior à
 * publicação): o jornal impresso só precisa de nome/dia/mês; o fluxo
 * dedicado de consentimento editorial (telas, selos, recordBirthdayConsent)
 * foi retirado. Estes testes confirmam que a remoção foi completa no lado
 * EDITORIAL e que a migration corretiva não tocou nem o fluxo público de
 * cadastro complementar (que continua com seu próprio consentimento,
 * independente) nem a migration já aplicada em produção.
 */

test("recordBirthdayConsent foi removida de actions.ts — não existe mais fluxo dedicado de consentimento editorial", () => {
  assert.doesNotMatch(ACTIONS_SOURCE, /export async function recordBirthdayConsent/);
  assert.doesNotMatch(ACTIONS_SOURCE, /CONSENT_REQUIRED_ERROR/);
});

test("setBirthdayPublication não consulta mais consent_status antes de publicar (controle simples incluir/retirar)", () => {
  const body = extractFunction(ACTIONS_SOURCE, "setBirthdayPublication");
  assert.doesNotMatch(body, /consent_status/);
});

test("saveEditorialBirthday não bloqueia mais a criação/edição com publishInPrint=true por falta de consentimento", () => {
  const body = extractFunction(ACTIONS_SOURCE, "saveEditorialBirthday");
  assert.doesNotMatch(body, /consent_status/);
});

test("linkBirthdayEntryToClient continua migrando os campos legados de consentimento (preservação de dados, nunca reinicia)", () => {
  const body = extractFunction(ACTIONS_SOURCE, "linkBirthdayEntryToClient");
  assert.match(body, /consent_status:\s*old\.consent_status/);
});

test("a migration corretiva remove a CHECK birthday_entries_publish_requires_consent, que impedia o controle simples", () => {
  assert.match(
    NEW_MIGRATION,
    /drop constraint if exists birthday_entries_publish_requires_consent/i,
  );
});

test("a migration corretiva NÃO remove as colunas de consentimento nem as outras duas CHECKs, compartilhadas com o cadastro complementar público", () => {
  assert.doesNotMatch(NEW_MIGRATION, /drop column/i);
  assert.doesNotMatch(NEW_MIGRATION, /drop constraint if exists birthday_entries_guardian_required_for_minor/i);
  assert.doesNotMatch(NEW_MIGRATION, /drop constraint if exists birthday_entries_consent_status_valid/i);
});

test("a migration já aplicada (20261120290000) permanece intacta — a correção não a edita", () => {
  assert.match(
    OLD_CONSENT_MIGRATION,
    /check \(publish_in_print = false or consent_status = 'granted'\)/,
  );
});

test("o fluxo público de cadastro complementar (Bloco D) decide publish_in_print sozinho, sem depender da CHECK removida", () => {
  assert.match(
    PUBLIC_FLOW_MIGRATION,
    /case when p_consent then 'granted' else 'pending' end/,
  );
  assert.match(
    PUBLIC_FLOW_MIGRATION,
    /publish_in_print = \(p_updates->>'titular_consent'\)::boolean/,
  );
});
