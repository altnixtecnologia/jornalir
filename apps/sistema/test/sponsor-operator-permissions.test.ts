import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STAFF_MODULES, STAFF_MODULES_ELIGIBLE_FOR_BULK_ACTIVATION, STAFF_MODULE_ACTIONS } from "../src/lib/permissions/staffPermissionsCatalog";
import { buildPermissionDraft, emptySnapshot, applyModuleActivation, activateDefaultModules, moduleActionDraftKey } from "../src/lib/permissions/permissionsDraft";

const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");

test("módulo patrocinadores nunca ativa Comercial ou vendas por associação", () => {
  assert.ok(STAFF_MODULES.some((mod) => mod.key === "patrocinadores"));
  assert.equal(STAFF_MODULES_ELIGIBLE_FOR_BULK_ACTIVATION.includes("patrocinadores"), false);
  assert.ok(STAFF_MODULE_ACTIONS.some((item) => item.module === "patrocinadores" && item.key === "gerenciar"));
  const next = applyModuleActivation(buildPermissionDraft(emptySnapshot()), "patrocinadores", {hasExistingConfig:false});
  assert.equal(next.modules.patrocinadores, true);
  assert.equal(next.moduleActions[moduleActionDraftKey("patrocinadores","gerenciar")], true);
  assert.notEqual(next.modules.publicidade, true);
  assert.notEqual(next.moduleActions[moduleActionDraftKey("publicidade","vendas_editar")], true);
  const bulk = activateDefaultModules(buildPermissionDraft(emptySnapshot()), {});
  assert.notEqual(bulk.modules.patrocinadores, true);
});

test("guard é servidor + middleware + RLS, não apenas menu", () => {
  const actions = read("../src/app/sistema/configuracoes/patrocinadores/actions.ts");
  const page = read("../src/app/sistema/patrocinadores/page.tsx");
  const middleware = read("../src/middleware.ts");
  const sql = read("../../../supabase/migrations/20261122341100_sponsor_operator_permissions.sql");
  assert.doesNotMatch(actions, /checkModuleAction\("publicidade","vendas_editar"\)/);
  assert.match(actions, /checkModuleAction\("patrocinadores","gerenciar"\)/);
  assert.match(page, /p_module:"patrocinadores",p_action:"gerenciar"/);
  assert.match(middleware, /matches\("\/sistema\/patrocinadores"\)\) moduleKey="patrocinadores"/);
  assert.match(sql, /ALTER POLICY media_assets_insert_staff/);
  assert.match(sql, /ALTER POLICY site_ad_media_delete_staff/);
  assert.match(sql, /staff_module_visibility_module_key_check/);
});
