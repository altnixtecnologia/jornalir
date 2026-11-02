import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { STAFF_MODULE_ACTIONS } from "../src/lib/permissions/staffPermissionsCatalog";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ACTIONS_SOURCE = readFileSync(resolve(__dirname, "../src/app/sistema/assinaturas/actions.ts"), "utf8");

/**
 * "Conferir permissão assinaturas_ativar, inclusive por acesso direto à
 * Server Action" (pré-homologação, 02/11/2026). checkModuleAction em si
 * depende de uma sessão/RPC real do Supabase (não testável por unidade
 * sem Postgres) — mas duas garantias SÃO verificáveis sem rede: (1) a
 * permissão existe de fato no catálogo, separada de assinaturas_criar;
 * (2) activateSubscriptionAction checa essa permissão especificamente,
 * ANTES de qualquer efeito, mesmo se alguém chamar a Server Action
 * direto (sem passar pela UI) — acesso direto nunca pula essa linha.
 */

test("assinaturas_ativar existe no catálogo de permissões, é distinta de assinaturas_criar/assinaturas_editar/assinaturas_suspender", () => {
  const entry = STAFF_MODULE_ACTIONS.find((item) => item.module === "assinaturas" && item.key === "assinaturas_ativar");
  assert.ok(entry, "assinaturas_ativar não está registrada no catálogo");
  const others = STAFF_MODULE_ACTIONS.filter((item) => item.module === "assinaturas" && item.key !== "assinaturas_ativar");
  assert.ok(others.every((item) => item.key !== "assinaturas_ativar"));
  assert.ok(others.some((item) => item.key === "assinaturas_criar"));
});

test("assinaturas_ativar não é marcada isDefault — nenhum operador ganha a permissão automaticamente ao ativar o módulo Assinaturas", () => {
  const entry = STAFF_MODULE_ACTIONS.find((item) => item.module === "assinaturas" && item.key === "assinaturas_ativar")!;
  assert.notEqual((entry as { isDefault?: boolean }).isDefault, true);
});

test("activateSubscriptionAction checa checkModuleAction('assinaturas','assinaturas_ativar') como a primeira operação real, antes de chamar o serviço — acesso direto à Server Action nunca pula a checagem de permissão", () => {
  const start = ACTIONS_SOURCE.indexOf("export async function activateSubscriptionAction(");
  assert.ok(start >= 0, "activateSubscriptionAction não encontrada");
  const nextExport = ACTIONS_SOURCE.indexOf("\nexport async function", start + 1);
  const body = nextExport === -1 ? ACTIONS_SOURCE.slice(start) : ACTIONS_SOURCE.slice(start, nextExport);

  const permissionCallIdx = body.indexOf('checkModuleAction("assinaturas", "assinaturas_ativar")');
  const permissionGuardIdx = body.indexOf("if (permissionError) return { error: permissionError };");
  const serviceCallIdx = body.indexOf("getSubscriptionService(");

  assert.ok(permissionCallIdx >= 0, "não chama checkModuleAction com a permissão correta");
  assert.ok(permissionGuardIdx > permissionCallIdx, "não interrompe a execução quando a permissão falha");
  assert.ok(serviceCallIdx > permissionGuardIdx, "chama o serviço antes de confirmar a permissão");
});

test("activateSubscriptionAction nunca importa nem chama nada do módulo Financeiro — ativar não pode gerar cobrança automaticamente", () => {
  const start = ACTIONS_SOURCE.indexOf("export async function activateSubscriptionAction(");
  const nextExport = ACTIONS_SOURCE.indexOf("\nexport async function", start + 1);
  const body = nextExport === -1 ? ACTIONS_SOURCE.slice(start) : ACTIONS_SOURCE.slice(start, nextExport);
  assert.doesNotMatch(body, /Receivable|financeiro/i);
  assert.doesNotMatch(ACTIONS_SOURCE, /composition\/financeiro/);
});
