import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file: string) =>
  readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");

test("solicitacao fiscal privada exige autorizacao owner/admin antes de service_role", () => {
  const s = read("providers/supabase/nfseCancellationRequestRepository.supabase.ts");
  assert.match(s, /authorizedPrivateClient\(session: SupabaseClient\)/);
  assert.match(s, /session\.rpc\("is_active_admin_or_owner"\)/);
  assert.match(s, /data !== true/);
  assert.match(s, /createSupabaseAdminClient\(\)/);
  assert.match(s, /ACTIVE_STATUSES[^\n]*"uncertain"/);
  assert.doesNotMatch(s, /await client\.from\(TABLE\)/);
});

test("historico de cancelamento so e consultado por administradores", () => {
  const page = read("app/sistema/nfse/notas/[id]/page.tsx");
  assert.match(page, /supabase\.rpc\("is_active_admin_or_owner"\)/);
  assert.match(page, /canManageCancellation === true\s*\? getCancellationService\(supabase\)\.listHistory/);
  assert.match(page, /canManageCancellation === true\s*\?\s*\(/);
});

test("consulta fiscal esta vinculada ao ID de nota existente; chave arbitraria do browser e ignorada", () => {
  const action = read("app/sistema/nfse/notas/[id]/query-actions.ts");
  assert.match(action, /consultNfseByNoteIdAction\(noteId: string\)/);
  assert.match(action, /getById\(noteId\)/);
  assert.match(action, /consultNfseByAccessKey\(note\.accessKey, note\.environment\)/);
  assert.match(action, /source: "demonstration"/);
  assert.match(action, /if \(note\.environment !== "homologation"\)/);
  assert.doesNotMatch(action, /consultNfseByAccessKeyAction\(accessKey: string\)/);
  const panel = read("features/nfse/NfseConsultationPanel.tsx");
  assert.match(panel, /consultNfseByNoteIdAction\(noteId\)/);
  assert.match(panel, /DEMONSTRAÇÃO — dados fictícios/);
});

test("solicitacao incerta nao libera novo cancelamento", () => {
  const panel = read("features/nfse/NfseCancellationPanel.tsx");
  assert.match(panel, /item\.status === "uncertain"/);
});
