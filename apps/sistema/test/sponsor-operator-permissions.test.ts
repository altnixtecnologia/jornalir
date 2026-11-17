import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  STAFF_MODULES, STAFF_MODULES_ELIGIBLE_FOR_BULK_ACTIVATION, STAFF_MODULE_ACTIONS,
} from "../src/lib/permissions/staffPermissionsCatalog";
import {
  buildPermissionDraft, emptySnapshot, applyModuleActivation, activateDefaultModules,
  moduleActionDraftKey, diffPermissionDraft,
} from "../src/lib/permissions/permissionsDraft";

const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");

test("Configurações aparece em Usuários e não concede funções sensíveis ao ser ativado", () => {
  assert.ok(STAFF_MODULES.some((mod) => mod.key === "configuracoes" && mod.label === "Configurações"));
  assert.equal(STAFF_MODULES_ELIGIBLE_FOR_BULK_ACTIVATION.includes("configuracoes"), false);
  assert.ok(STAFF_MODULE_ACTIONS.some((item) =>
    item.module === "configuracoes" && item.key === "patrocinadores_gerenciar"));
  const draft = applyModuleActivation(
    buildPermissionDraft(emptySnapshot()), "configuracoes", { hasExistingConfig: false },
  );
  assert.equal(draft.modules.configuracoes, true);
  assert.notEqual(draft.moduleActions[moduleActionDraftKey("configuracoes", "patrocinadores_gerenciar")], true);
  assert.notEqual(draft.moduleActions[moduleActionDraftKey("publicidade", "vendas_editar")], true);
  const bulk = activateDefaultModules(buildPermissionDraft(emptySnapshot()), {});
  assert.notEqual(bulk.modules.configuracoes, true);
});

test("permissão de patrocinadores pode ser concedida separada de vendas", () => {
  const draft = applyModuleActivation(
    buildPermissionDraft(emptySnapshot()), "configuracoes", { hasExistingConfig: false },
  );
  draft.moduleActions[moduleActionDraftKey("configuracoes", "patrocinadores_gerenciar")] = true;
  const diff = diffPermissionDraft(emptySnapshot(), draft);
  assert.deepEqual(diff.moduleActions, [
    { module_key:"configuracoes", action_key:"patrocinadores_gerenciar", allowed:true },
  ]);
  assert.ok(!diff.visibility.some((m) => m.module_key === "publicidade"));
});

test("rota + Server Actions + RLS exigem Configurações e ação específica", () => {
  const actions = read("../src/app/sistema/configuracoes/patrocinadores/actions.ts");
  const page = read("../src/app/sistema/patrocinadores/page.tsx");
  const middleware = read("../src/middleware.ts");
  const sql = read("../../../supabase/migrations/20261122341100_sponsor_operator_permissions.sql");
  assert.doesNotMatch(actions, /checkModuleAction\("publicidade","vendas_editar"\)/);
  assert.match(actions, /checkModuleAction\("configuracoes","patrocinadores_gerenciar"\)/);
  assert.match(page, /p_module:"configuracoes",p_action:"patrocinadores_gerenciar"/);
  assert.match(middleware, /matches\("\/sistema\/patrocinadores"\)\) moduleKey="configuracoes"/);
  assert.match(middleware, /matches\("\/sistema\/configuracoes\/modelos-contratos"\)/);
  assert.match(middleware, /matches\("\/sistema\/configuracoes"\) && !operatorSettingsPath/);
  assert.match(sql, /ALTER POLICY media_assets_insert_staff/);
  assert.match(sql, /ALTER POLICY site_ad_media_delete_staff/);
  assert.match(sql, /staff_module_visibility_module_key_check/);
  assert.match(sql, /staff_can_module_action\('configuracoes','patrocinadores_gerenciar'\)/);
});

test("a página Configurações somente mostra rotas autorizadas a operadores", () => {
  const index = read("../src/app/sistema/configuracoes/page.tsx");
  const desktop = read("../src/components/admin/AdminHeader.tsx");
  const mobile = read("../src/components/admin/MobileNav.tsx");
  assert.match(index, /canManageSponsors === true/);
  assert.match(index, /canUseModels/);
  assert.match(index, /isAdminOrOwner \? <Link[^\n]*\/sistema\/usuarios/);
  assert.match(desktop, /!canManageUsers && hasModule\("configuracoes"\)/);
  assert.match(mobile, /hasModule\(key\)/);
  assert.match(mobile, /configuracoesNavGroup\.label && !canManageUsers/);
});
