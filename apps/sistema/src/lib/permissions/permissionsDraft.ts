/** Lógica pura (sem Supabase/React) da edição local de permissões de um
 * operador: monta o rascunho a partir do estado real, aplica ativação de
 * módulo com seleção automática de padrões, seleção em lote e o diff final
 * usado para salvar só o que mudou, agrupado por tabela. Mantida separada
 * do componente para ser testável com node:test puro (padrão deste projeto).
 */
import {
  STAFF_MODULES,
  STAFF_MODULES_ELIGIBLE_FOR_BULK_ACTIVATION,
  STAFF_MODULE_ACTIONS,
  STAFF_FINANCE_ACTIONS,
  type StaffModuleKey,
  type StaffActionModule,
  type StaffModuleActionKey,
  type StaffFinanceActionKey,
} from "./staffPermissionsCatalog";

export interface ModuleVisibilityRow { module_key: StaffModuleKey; enabled: boolean }
export interface ModuleActionGrantRow { module_key: StaffActionModule; action_key: StaffModuleActionKey; allowed: boolean }
export interface FinanceGrantRow { action_key: StaffFinanceActionKey; allowed: boolean }

export interface PermissionSnapshot {
  moduleVisibility: ModuleVisibilityRow[];
  moduleActions: ModuleActionGrantRow[];
  financeActions: FinanceGrantRow[];
}

export interface PermissionDraft {
  modules: Partial<Record<StaffModuleKey, boolean>>;
  moduleActions: Record<string, boolean>;
  financeActions: Partial<Record<StaffFinanceActionKey, boolean>>;
}

export function moduleActionDraftKey(moduleKey: StaffActionModule, actionKey: StaffModuleActionKey): string {
  return `${moduleKey}:${actionKey}`;
}

export function emptySnapshot(): PermissionSnapshot {
  return { moduleVisibility: [], moduleActions: [], financeActions: [] };
}

export function buildPermissionDraft(snapshot: PermissionSnapshot): PermissionDraft {
  const modules: Partial<Record<StaffModuleKey, boolean>> = {};
  for (const mod of STAFF_MODULES) {
    modules[mod.key] = snapshot.moduleVisibility.some((row) => row.module_key === mod.key && row.enabled);
  }
  const moduleActions: Record<string, boolean> = {};
  for (const action of STAFF_MODULE_ACTIONS) {
    moduleActions[moduleActionDraftKey(action.module, action.key)] = snapshot.moduleActions.some(
      (row) => row.module_key === action.module && row.action_key === action.key && row.allowed,
    );
  }
  const financeActions: Partial<Record<StaffFinanceActionKey, boolean>> = {};
  for (const action of STAFF_FINANCE_ACTIONS) {
    financeActions[action.key] = snapshot.financeActions.some((row) => row.action_key === action.key && row.allowed);
  }
  return { modules, moduleActions, financeActions };
}

/** Primeira ativação (nunca houve linha de ação salva para este módulo/usuário)
 * versus reativação (já existiu configuração — ela deve ser preservada). */
export function moduleHasExistingActionConfig(snapshot: PermissionSnapshot, moduleKey: StaffModuleKey): boolean {
  if (moduleKey === "financeiro") return snapshot.financeActions.length > 0;
  return snapshot.moduleActions.some((row) => row.module_key === moduleKey);
}

export function applyModuleActivation(
  draft: PermissionDraft,
  moduleKey: StaffModuleKey,
  options: { hasExistingConfig: boolean },
): PermissionDraft {
  const next: PermissionDraft = {
    modules: { ...draft.modules, [moduleKey]: true },
    moduleActions: { ...draft.moduleActions },
    financeActions: { ...draft.financeActions },
  };
  if (options.hasExistingConfig) return next;
  if (moduleKey === "financeiro") {
    for (const action of STAFF_FINANCE_ACTIONS) {
      next.financeActions[action.key] = "isDefault" in action && action.isDefault === true;
    }
    return next;
  }
  for (const action of STAFF_MODULE_ACTIONS.filter((item) => item.module === moduleKey)) {
    const allowed = !("adminOnly" in action && action.adminOnly) && "isDefault" in action && action.isDefault === true;
    next.moduleActions[moduleActionDraftKey(action.module, action.key)] = allowed;
  }
  return next;
}

export function applyModuleDeactivation(draft: PermissionDraft, moduleKey: StaffModuleKey): PermissionDraft {
  return { ...draft, modules: { ...draft.modules, [moduleKey]: false } };
}

export function activateDefaultModules(
  draft: PermissionDraft,
  hasExistingConfigByModule: Partial<Record<StaffModuleKey, boolean>>,
): PermissionDraft {
  let next = draft;
  for (const moduleKey of STAFF_MODULES_ELIGIBLE_FOR_BULK_ACTIVATION) {
    next = applyModuleActivation(next, moduleKey, { hasExistingConfig: hasExistingConfigByModule[moduleKey] === true });
  }
  return next;
}

export function moduleActionsHaveCritical(moduleKey: StaffActionModule): boolean {
  return STAFF_MODULE_ACTIONS.some((action) => action.module === moduleKey && "isCritical" in action && action.isCritical === true);
}

export function financeActionsHaveCritical(): boolean {
  return STAFF_FINANCE_ACTIONS.some((action) => "isCritical" in action && action.isCritical === true);
}

export function selectAllModuleActions(
  draft: PermissionDraft,
  moduleKey: StaffActionModule,
  options: { includeCritical: boolean },
): PermissionDraft {
  const next: PermissionDraft = { ...draft, moduleActions: { ...draft.moduleActions } };
  for (const action of STAFF_MODULE_ACTIONS.filter((item) => item.module === moduleKey)) {
    if ("adminOnly" in action && action.adminOnly) continue;
    const isCritical = "isCritical" in action && action.isCritical === true;
    if (isCritical && !options.includeCritical) continue;
    next.moduleActions[moduleActionDraftKey(action.module, action.key)] = true;
  }
  return next;
}

export function clearModuleActions(draft: PermissionDraft, moduleKey: StaffActionModule): PermissionDraft {
  const next: PermissionDraft = { ...draft, moduleActions: { ...draft.moduleActions } };
  for (const action of STAFF_MODULE_ACTIONS.filter((item) => item.module === moduleKey)) {
    next.moduleActions[moduleActionDraftKey(action.module, action.key)] = false;
  }
  return next;
}

export function selectAllFinanceActions(draft: PermissionDraft, options: { includeCritical: boolean }): PermissionDraft {
  const next: PermissionDraft = { ...draft, financeActions: { ...draft.financeActions } };
  for (const action of STAFF_FINANCE_ACTIONS) {
    const isCritical = "isCritical" in action && action.isCritical === true;
    if (isCritical && !options.includeCritical) continue;
    next.financeActions[action.key] = true;
  }
  return next;
}

export function clearFinanceActions(draft: PermissionDraft): PermissionDraft {
  const next: PermissionDraft = { ...draft, financeActions: { ...draft.financeActions } };
  for (const action of STAFF_FINANCE_ACTIONS) next.financeActions[action.key] = false;
  return next;
}

export function countAllowedModuleActions(draft: PermissionDraft, moduleKey: StaffActionModule): { allowed: number; total: number } {
  const actions = STAFF_MODULE_ACTIONS.filter((action) => action.module === moduleKey);
  const allowed = actions.filter((action) => draft.moduleActions[moduleActionDraftKey(action.module, action.key)] === true).length;
  return { allowed, total: actions.length };
}

export function countAllowedFinanceActions(draft: PermissionDraft): { allowed: number; total: number } {
  const allowed = STAFF_FINANCE_ACTIONS.filter((action) => draft.financeActions[action.key] === true).length;
  return { allowed, total: STAFF_FINANCE_ACTIONS.length };
}

export interface PermissionDiff {
  visibility: ModuleVisibilityRow[];
  moduleActions: ModuleActionGrantRow[];
  financeActions: FinanceGrantRow[];
}

/** Só o que realmente mudou em relação ao estado real (`snapshot`), separado
 * por tabela, pronto para três upserts em lote (nunca um por clique). */
export function diffPermissionDraft(original: PermissionSnapshot, draft: PermissionDraft): PermissionDiff {
  const visibility: PermissionDiff["visibility"] = [];
  for (const mod of STAFF_MODULES) {
    const current = original.moduleVisibility.some((row) => row.module_key === mod.key && row.enabled);
    const next = draft.modules[mod.key] ?? current;
    if (next !== current) visibility.push({ module_key: mod.key, enabled: next });
  }

  const moduleActions: PermissionDiff["moduleActions"] = [];
  for (const action of STAFF_MODULE_ACTIONS) {
    const current = original.moduleActions.some(
      (row) => row.module_key === action.module && row.action_key === action.key && row.allowed,
    );
    const draftValue = draft.moduleActions[moduleActionDraftKey(action.module, action.key)] ?? current;
    const next = "adminOnly" in action && action.adminOnly ? false : draftValue;
    if (next !== current) moduleActions.push({ module_key: action.module, action_key: action.key, allowed: next });
  }

  const financeActions: PermissionDiff["financeActions"] = [];
  for (const action of STAFF_FINANCE_ACTIONS) {
    const current = original.financeActions.some((row) => row.action_key === action.key && row.allowed);
    const next = draft.financeActions[action.key] ?? current;
    if (next !== current) financeActions.push({ action_key: action.key, allowed: next });
  }

  return { visibility, moduleActions, financeActions };
}

export function isPermissionDiffEmpty(diff: PermissionDiff): boolean {
  return diff.visibility.length === 0 && diff.moduleActions.length === 0 && diff.financeActions.length === 0;
}
