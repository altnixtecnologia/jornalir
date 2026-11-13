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

test("envio real de cancelamento existe SOMENTE na server action restrita", () => {
  const actions = read("app/sistema/nfse/notas/[id]/cancellation-actions.ts");
  assert.match(actions, /submitCancellationRestrictedAction/);
  assert.match(actions, /if \(!isRestrictedSefinEnvironment\(restrictedSefinEnvironmentFromServer\(\)\)\)/);
  assert.match(actions, /await requireFiscalAdmin\(client\)/);
  assert.match(actions, /prepareRestrictedCancellationDispatchService\(client\)\.submit\(requestId, true\)/);
  const official = read("composition/nfse.ts");
  assert.doesNotMatch(official, /prepareRestrictedCancellationDispatchService/);
  assert.doesNotMatch(official, /RestrictedCancellationDispatchService/);
  const restricted = read("composition/nfse-cancelamento-restricted.ts");
  assert.match(restricted, /assertRestrictedSefinEnvironment\(restrictedSefinEnvironmentFromServer\(\)\)/);
  assert.match(restricted, /environment !== "homologation"/);
  assert.match(restricted, /await dispatcher\.close\(\)/);
});

test("rotas oficiais permanecem fechadas sem duas flags e banco isolado", () => {
  const middle = read("middleware.ts");
  const auth = read("lib/permissions/checkModuleAction.ts");
  const action = read("app/sistema/nfse/rascunhos/[id]/actions.ts");
  assert.match(middle, /!isRestrictedSefinEnvironment\(restrictedSefinEnvironmentFromServer\(\)\)/);
  assert.match(auth, /!isRestrictedSefinEnvironment\(restrictedSefinEnvironmentFromServer\(\)\)/);
  assert.match(action, /prepareRestrictedNfseTransmissionService\(supabase\)/);
  assert.match(action, /getTransmissionService\(supabase\)/);
  assert.match(action, /checkModuleAction\("nfse", "notas_emitir"\)/);
});
