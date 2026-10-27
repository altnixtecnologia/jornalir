import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPermissionDraft,
  moduleHasExistingActionConfig,
  applyModuleActivation,
  applyModuleDeactivation,
  activateDefaultModules,
  selectAllModuleActions,
  clearModuleActions,
  selectAllFinanceActions,
  clearFinanceActions,
  moduleActionsHaveCritical,
  financeActionsHaveCritical,
  countAllowedModuleActions,
  countAllowedFinanceActions,
  diffPermissionDraft,
  isPermissionDiffEmpty,
  moduleActionDraftKey,
  emptySnapshot,
  type PermissionSnapshot,
} from "../src/lib/permissions/permissionsDraft";
import { STAFF_MODULE_ACTIONS, STAFF_FINANCE_ACTIONS } from "../src/lib/permissions/staffPermissionsCatalog";

test("invariante do catálogo: nenhuma ação adminOnly ou crítica é marcada isDefault, em módulo nem financeiro", () => {
  for (const action of STAFF_MODULE_ACTIONS) {
    const isDefault = "isDefault" in action && action.isDefault === true;
    const isAdminOnly = "adminOnly" in action && action.adminOnly === true;
    const isCritical = "isCritical" in action && action.isCritical === true;
    if (isAdminOnly) assert.equal(isDefault, false, `${action.module}.${action.key} é adminOnly e não pode ser isDefault`);
    if (isCritical) assert.equal(isDefault, false, `${action.module}.${action.key} é crítica e não pode ser isDefault`);
  }
  for (const action of STAFF_FINANCE_ACTIONS) {
    const isDefault = "isDefault" in action && action.isDefault === true;
    const isCritical = "isCritical" in action && action.isCritical === true;
    if (isCritical) assert.equal(isDefault, false, `financeiro.${action.key} é crítica e não pode ser isDefault`);
  }
});

test("módulo nunca configurado: ativar aplica os padrões operacionais, sem admin/crítico", () => {
  const snapshot = emptySnapshot();
  const draft = buildPermissionDraft(snapshot);
  assert.equal(moduleHasExistingActionConfig(snapshot, "assinaturas"), false);

  const next = applyModuleActivation(draft, "assinaturas", { hasExistingConfig: false });
  assert.equal(next.modules.assinaturas, true);
  assert.equal(next.moduleActions[moduleActionDraftKey("assinaturas", "assinaturas_criar")], true);
  assert.equal(next.moduleActions[moduleActionDraftKey("assinaturas", "assinaturas_editar")], true);
  // crítico (cancelar) e não-operacional (suspender) nunca entram por padrão
  assert.equal(next.moduleActions[moduleActionDraftKey("assinaturas", "assinaturas_cancelar")], false);
  assert.equal(next.moduleActions[moduleActionDraftKey("assinaturas", "assinaturas_suspender")], false);
});

test("ativar o Financeiro pela primeira vez nunca seleciona baixa, estorno, cancelamento ou ajuste sensível", () => {
  const draft = buildPermissionDraft(emptySnapshot());
  const next = applyModuleActivation(draft, "financeiro", { hasExistingConfig: false });
  assert.equal(next.financeActions.titulos_criar, true);
  assert.equal(next.financeActions.pix_gerar, true);
  for (const sensitive of [
    "titulos_cancelar", "titulos_reabrir", "recebimentos_baixar", "recebimentos_quitar_diferenca",
    "recebimentos_estornar", "pix_cancelar", "ajustes_criar", "ajustes_estornar", "creditos_aplicar",
  ] as const) {
    assert.equal(next.financeActions[sensitive], false, `${sensitive} não deveria ser padrão`);
  }
});

test("nfse nunca recebe isDefault=true em nenhuma ação (bloqueio de release também vale para defaults)", () => {
  const draft = buildPermissionDraft(emptySnapshot());
  const next = applyModuleActivation(draft, "nfse", { hasExistingConfig: false });
  assert.equal(next.moduleActions[moduleActionDraftKey("nfse", "notas_emitir")], false);
  assert.equal(next.moduleActions[moduleActionDraftKey("nfse", "configuracoes_gerenciar")], false);
});

test("reativação (já existiu configuração) preserva as escolhas em vez de sobrescrever com o padrão", () => {
  const snapshot: PermissionSnapshot = {
    moduleVisibility: [{ module_key: "assinaturas", enabled: false }],
    moduleActions: [
      { module_key: "assinaturas", action_key: "assinaturas_cancelar", allowed: true },
      { module_key: "assinaturas", action_key: "assinaturas_criar", allowed: false },
    ],
    financeActions: [],
  };
  assert.equal(moduleHasExistingActionConfig(snapshot, "assinaturas"), true);
  const draft = buildPermissionDraft(snapshot);
  const next = applyModuleActivation(draft, "assinaturas", { hasExistingConfig: true });
  assert.equal(next.modules.assinaturas, true);
  // preferências individuais anteriores preservadas, não o padrão de fábrica
  assert.equal(next.moduleActions[moduleActionDraftKey("assinaturas", "assinaturas_cancelar")], true);
  assert.equal(next.moduleActions[moduleActionDraftKey("assinaturas", "assinaturas_criar")], false);
});

test("desativar módulo só desliga a visibilidade, preservando as concessões de ação no rascunho", () => {
  const snapshot: PermissionSnapshot = {
    moduleVisibility: [{ module_key: "clientes", enabled: true }],
    moduleActions: [{ module_key: "clientes", action_key: "clientes_criar", allowed: true }],
    financeActions: [],
  };
  const draft = buildPermissionDraft(snapshot);
  const next = applyModuleDeactivation(draft, "clientes");
  assert.equal(next.modules.clientes, false);
  assert.equal(next.moduleActions[moduleActionDraftKey("clientes", "clientes_criar")], true);
});

test("selecionar tudo nunca inclui ações adminOnly e só inclui críticas quando autorizado explicitamente", () => {
  const draft = buildPermissionDraft(emptySnapshot());
  assert.equal(moduleActionsHaveCritical("publicidade"), true);

  const withoutCritical = selectAllModuleActions(draft, "publicidade", { includeCritical: false });
  assert.equal(withoutCritical.moduleActions[moduleActionDraftKey("publicidade", "vendas_cancelar")], false);
  assert.equal(withoutCritical.moduleActions[moduleActionDraftKey("publicidade", "vendas_criar")], true);

  const withCritical = selectAllModuleActions(draft, "publicidade", { includeCritical: true });
  assert.equal(withCritical.moduleActions[moduleActionDraftKey("publicidade", "vendas_cancelar")], true);

  const nfseAll = selectAllModuleActions(draft, "nfse", { includeCritical: true });
  assert.equal(nfseAll.moduleActions[moduleActionDraftKey("nfse", "notas_emitir")], false, "adminOnly nunca é selecionado, nem com includeCritical");
});

test("limpar seleção zera todas as ações do módulo, inclusive as críticas já marcadas", () => {
  let draft = buildPermissionDraft(emptySnapshot());
  draft = selectAllModuleActions(draft, "assinaturas", { includeCritical: true });
  assert.equal(countAllowedModuleActions(draft, "assinaturas").allowed > 0, true);
  draft = clearModuleActions(draft, "assinaturas");
  assert.deepEqual(countAllowedModuleActions(draft, "assinaturas"), { allowed: 0, total: countAllowedModuleActions(draft, "assinaturas").total });
});

test("ações financeiras: selecionar tudo e limpar seguem a mesma regra de crítico", () => {
  assert.equal(financeActionsHaveCritical(), true);
  let draft = buildPermissionDraft(emptySnapshot());
  draft = selectAllFinanceActions(draft, { includeCritical: false });
  assert.equal(draft.financeActions.recebimentos_estornar, false);
  assert.equal(draft.financeActions.pix_cancelar, false);
  assert.equal(draft.financeActions.titulos_criar, true);
  draft = selectAllFinanceActions(draft, { includeCritical: true });
  assert.equal(draft.financeActions.recebimentos_estornar, true);
  draft = clearFinanceActions(draft);
  assert.equal(countAllowedFinanceActions(draft).allowed, 0);
});

test("ativar módulos (padrão) nunca liga a NFS-e, mesmo sendo o comando geral", () => {
  const draft = buildPermissionDraft(emptySnapshot());
  const next = activateDefaultModules(draft, {});
  assert.equal(next.modules.nfse, false, "nfse não deve ser tocada pelo comando geral");
  assert.equal(next.modules.editorial, true);
  assert.equal(next.modules.financeiro, true);
  assert.equal(next.financeActions.titulos_criar, true);
  // garante que nenhuma ação crítica/sensível entrou via ativação em lote
  assert.equal(next.moduleActions[moduleActionDraftKey("publicidade", "vendas_cancelar")], false);
});

test("diff só retorna o que mudou de fato, agrupado por tabela, e nunca persiste adminOnly=true", () => {
  const snapshot: PermissionSnapshot = {
    moduleVisibility: [{ module_key: "editorial", enabled: true }],
    moduleActions: [{ module_key: "editorial", action_key: "materias_criar", allowed: true }],
    financeActions: [{ action_key: "titulos_criar", allowed: true }],
  };
  const draft = buildPermissionDraft(snapshot);

  const noChangeDiff = diffPermissionDraft(snapshot, draft);
  assert.equal(isPermissionDiffEmpty(noChangeDiff), true);

  const changed = applyModuleActivation(draft, "clientes", { hasExistingConfig: false });
  changed.moduleActions[moduleActionDraftKey("editorial", "materias_criar")] = false;
  // tentativa indevida (não deveria ocorrer pela UI, mas o diff tem que blindar mesmo assim)
  changed.moduleActions[moduleActionDraftKey("nfse", "notas_emitir")] = true;

  const diff = diffPermissionDraft(snapshot, changed);
  assert.equal(isPermissionDiffEmpty(diff), false);
  assert.ok(diff.visibility.some((row) => row.module_key === "clientes" && row.enabled === true));
  assert.ok(diff.moduleActions.some((row) => row.module_key === "editorial" && row.action_key === "materias_criar" && row.allowed === false));
  assert.ok(diff.moduleActions.some((row) => row.module_key === "clientes" && row.action_key === "clientes_criar" && row.allowed === true));
  assert.equal(diff.moduleActions.some((row) => row.module_key === "nfse" && row.action_key === "notas_emitir"), false,
    "o diff nunca grava adminOnly=true, mesmo que o rascunho tenha chegado nesse estado");
  assert.equal(diff.financeActions.length, 0, "financeiro não mudou, não deve aparecer no diff");
});

test("contagens por módulo refletem o rascunho ao vivo, antes de salvar", () => {
  let draft = buildPermissionDraft(emptySnapshot());
  assert.deepEqual(countAllowedModuleActions(draft, "editorial"), { allowed: 0, total: 6 });
  draft = applyModuleActivation(draft, "editorial", { hasExistingConfig: false });
  const { allowed, total } = countAllowedModuleActions(draft, "editorial");
  assert.equal(total, 6);
  assert.ok(allowed > 0 && allowed < total, "deve ter padrões ligados sem ligar tudo");
});
