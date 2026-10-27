"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";
import { useAuth, type AuthRole } from "../../lib/auth/AuthProvider";
import { ROLE_LABELS } from "../../lib/auth/accountDisplay";
import { hasRealStaffName, staffNameLabel } from "../../lib/auth/userIdentity";
import { inviteUser, listUserInvitationStatuses, sendPasswordResetForUser, updateManagedUserDetails, resendPendingUserAccess } from "../../app/sistema/usuarios/actions";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import { notify } from "../../lib/feedback/notify";
import { STAFF_FINANCE_ACTIONS, STAFF_MODULE_ACTIONS, STAFF_MODULES, type StaffFinanceActionKey, type StaffModuleActionKey, type StaffActionModule, type StaffModuleKey } from "../../lib/permissions/staffPermissionsCatalog";
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
  type PermissionDraft,
  type PermissionSnapshot,
} from "../../lib/permissions/permissionsDraft";


type UserActionIconName = "edit" | "promote" | "demote" | "permissions" | "access" | "password" | "disable" | "enable";

function UserActionIcon({ name }: { name: UserActionIconName }): JSX.Element {
  return (
    <svg aria-hidden="true" focusable="false" width="19" height="19" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {name === "edit" ? <><path d="M4 20l4.5-1 10.8-10.8a2.1 2.1 0 0 0-3-3L5.5 16 4 20Z" /><path d="m15.5 6 3 3" /></> : null}
      {name === "promote" ? <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></> : null}
      {name === "demote" ? <><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></> : null}
      {name === "permissions" ? <><path d="M4 6h7m4 0h5M4 12h3m4 0h9M4 18h10m4 0h2" /><circle cx="13" cy="6" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="16" cy="18" r="2" /></> : null}
      {name === "access" ? <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 7 9-7" /><path d="M16 16h4m-2-2 2 2-2 2" /></> : null}
      {name === "password" ? <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8C8 2.5 16 2.5 16 8V11" /><path d="M12 15v2" /></> : null}
      {name === "disable" ? <><path d="M12 3v9" /><path d="M7.3 5.6a9 9 0 1 0 9.4 0" /></> : null}
      {name === "enable" ? <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></> : null}
    </svg>
  );
}

/** Switch liga/desliga acessível — `<input type="checkbox">` real por baixo
 * (teclado e leitor de tela funcionam de fábrica), apenas com aparência de
 * trilho/bolinha. `role="switch"` + `aria-checked` descrevem a semântica
 * real sem abandonar a caixa nativa. */
function PermissionSwitch({
  label, checked, disabled, onChange, className = "",
}: {
  label: ReactNode; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void; className?: string;
}): JSX.Element {
  return (
    <label className={"ir-switch-row " + className}>
      <input
        type="checkbox"
        className="ir-switch"
        role="switch"
        aria-checked={checked}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="ir-switch-track" aria-hidden="true"><span className="ir-switch-thumb" /></span>
      <span className="ir-switch-label">{label}</span>
    </label>
  );
}

/** Cartão recolhível de um módulo: cabeçalho sempre visível com nome,
 * contagem de ações liberadas e o switch de ativação; corpo (ações) só
 * monta quando expandido. O switch fica fora do botão de expandir para
 * nunca disparar os dois comportamentos com um único clique. */
function ModulePermissionCard({
  moduleKey, label, enabled, switchDisabled, releaseBlocked, allowedCount, totalCount,
  expanded, onToggleExpanded, onToggleEnabled, children,
}: {
  moduleKey: string; label: string; enabled: boolean; switchDisabled: boolean; releaseBlocked?: boolean;
  allowedCount: number; totalCount: number; expanded: boolean;
  onToggleExpanded: () => void; onToggleEnabled: (enabled: boolean) => void; children: ReactNode;
}): JSX.Element {
  const bodyId = "perm-module-body-" + moduleKey;
  const statusText = releaseBlocked
    ? "Bloqueado pela política de release"
    : enabled
      ? allowedCount + " de " + totalCount + " ações liberadas"
      : "Módulo desativado";
  return (
    <div className={"permission-module-card" + (enabled ? " permission-module-card--enabled" : "")}>
      <div className="permission-module-card-head">
        <button
          type="button"
          className="permission-module-card-toggle"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={onToggleExpanded}
        >
          <span className={"permission-module-chevron" + (expanded ? " permission-module-chevron--open" : "")} aria-hidden="true">▸</span>
          <span className="permission-module-card-label">{label}</span>
        </button>
        <span className="permission-module-card-count helper-text">{statusText}</span>
        <PermissionSwitch
          label={<span className="sr-only">{(enabled ? "Desativar " : "Ativar ") + label}</span>}
          checked={enabled}
          disabled={switchDisabled}
          onChange={onToggleEnabled}
        />
      </div>
      {expanded ? <div id={bodyId} className="permission-module-card-body">{children}</div> : null}
    </div>
  );
}

interface AgendaManagerGrantRow { profile_id: string; can_manage: boolean; }
interface AuditViewerGrantRow { profile_id: string; can_view: boolean; }
interface VisibilityRow { profile_id: string; module_key: StaffModuleKey; enabled: boolean; }
interface FinanceGrantRow { profile_id: string; action_key: StaffFinanceActionKey; allowed: boolean; }
interface ModuleActionGrantRow { profile_id: string; module_key: StaffActionModule; action_key: StaffModuleActionKey; allowed: boolean; }
interface InvitationStatus { id: string; pending: boolean; confirmed: boolean; invited: boolean; email: string; }

interface UserRow {
  id: string;
  name: string;
  role: AuthRole;
  active: boolean;
  created_at: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Gestão de usuários — visível só para owner/admin (a própria página
 * garante isso; o menu já esconde o link para operator). Promover/rebaixar
 * e ativar/desativar são `UPDATE`s no cliente, sujeitos à RLS real de
 * `profiles` (o banco decide o que cada papel pode). Convidar usuário novo
 * é diferente: sempre server-side (`actions.ts`, Fase 20) — nunca
 * `service_role` no navegador, nunca troca a sessão de quem convida.
 */
export function UsersManager(): JSX.Element {
  const { profile } = useAuth();
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [agendaManagerGrants, setAgendaManagerGrants] = useState<AgendaManagerGrantRow[]>([]);
  const [auditViewerGrants, setAuditViewerGrants] = useState<AuditViewerGrantRow[]>([]);
  const [moduleVisibility, setModuleVisibility] = useState<VisibilityRow[]>([]);
  const [financeGrants, setFinanceGrants] = useState<FinanceGrantRow[]>([]);
  const [moduleActionGrants, setModuleActionGrants] = useState<ModuleActionGrantRow[]>([]);
  const [invitationStatuses, setInvitationStatuses] = useState<InvitationStatus[] | null>(null);
  const [invitationWarning, setInvitationWarning] = useState("");
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  // Só validação pré-vôo do formulário de convite (abaixo do próprio
  // formulário); resultado de operação usa `notify` (avisos flutuantes).
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [editingTarget, setEditingTarget] = useState<UserRow | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingEmail, setEditingEmail] = useState("");
  const [editError, setEditError] = useState("");
  const editDialogRef = useRef<HTMLDialogElement>(null);
  const [inviteRole, setInviteRole] = useState<"operator" | "admin">("operator");
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [permissionDraft, setPermissionDraft] = useState<PermissionDraft | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<StaffModuleKey>>(new Set());
  const [pendingSwitch, setPendingSwitch] = useState<{ target: string | null } | null>(null);
  const [criticalConfirm, setCriticalConfirm] = useState<{ scope: "module"; moduleKey: StaffActionModule } | { scope: "finance" } | null>(null);

  const isOwner = profile?.role === "owner";
  const isAdmin = profile?.role === "admin";

  useEffect(() => {
    const dialog = editDialogRef.current;
    if (!dialog) return;
    if (editingTarget && !dialog.open) dialog.showModal();
    if (!editingTarget && dialog.open) dialog.close();
  }, [editingTarget]);

  async function reload(): Promise<{ moduleVisibility: VisibilityRow[]; moduleActionGrants: ModuleActionGrantRow[]; financeGrants: FinanceGrantRow[] } | void> {
    const [profilesResult, visibilityResult, agendaManagersResult, auditViewersResult, financeResult, moduleActionsResult, membershipsResult, invitationsResult] = await Promise.all([
      client.from("profiles").select("id, name, role, active, created_at").order("created_at", { ascending: true }),
      client.from("staff_module_visibility").select("profile_id,module_key,enabled"),
      client.from("agenda_manager_grants").select("profile_id,can_manage"),
      client.from("audit_viewer_grants").select("profile_id,can_view"),
      client.from("staff_finance_action_permissions").select("profile_id,action_key,allowed"),
      client.from("staff_module_action_permissions").select("profile_id,module_key,action_key,allowed"),
      client.from("staff_memberships").select("profile_id"),
      listUserInvitationStatuses(),
    ]);
    if (profilesResult.error || visibilityResult.error || agendaManagersResult.error || auditViewersResult.error || financeResult.error || moduleActionsResult.error || membershipsResult.error) {
      notify.error("Não foi possível carregar os usuários",
        "Verifique sua conexão e recarregue a página. Se persistir, confira os registros do sistema.");
      return;
    }
    // Signatários externos do Auth possuem profile técnico, mas não são
    // colaboradores e não devem aparecer na administração de usuários.
    const staffIds=new Set((membershipsResult.data??[]).map(m=>m.profile_id));
    setUsers((profilesResult.data??[]).filter(profile=>staffIds.has(profile.id)) as UserRow[]);
    const freshVisibility = (visibilityResult.data ?? []) as VisibilityRow[];
    const freshModuleActions = (moduleActionsResult.data ?? []) as ModuleActionGrantRow[];
    const freshFinance = (financeResult.data ?? []) as FinanceGrantRow[];
    setModuleVisibility(freshVisibility);
    setAgendaManagerGrants((agendaManagersResult.data ?? []) as AgendaManagerGrantRow[]);
    setAuditViewerGrants((auditViewersResult.data ?? []) as AuditViewerGrantRow[]);
    setFinanceGrants(freshFinance);
    setModuleActionGrants(freshModuleActions);
    if ("ok" in invitationsResult) {
      setInvitationStatuses(invitationsResult.statuses);
      setInvitationWarning("");
    } else {
      setInvitationStatuses(null);
      setInvitationWarning(invitationsResult.error);
    }
    return { moduleVisibility: freshVisibility, moduleActionGrants: freshModuleActions, financeGrants: freshFinance };
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function canManage(target: UserRow): boolean {
    if (target.role === "owner") return false;
    if (isOwner) return true;
    if (isAdmin) return target.role === "operator";
    return false;
  }

  function canPromoteToAdmin(): boolean {
    return isOwner;
  }

  async function toggleActive(target: UserRow): Promise<void> {
    if(!target.active && invitationStatuses?.find(s=>s.id===target.id)?.confirmed!==true){
      notify.error("Não é possível habilitar o acesso",
        "Confirme o e-mail do colaborador antes de habilitar o painel para ele.");
      return;
    }
    setPending(true);
    const { error: updateError } = await client
      .from("profiles")
      .update({ active: !target.active })
      .eq("id", target.id);
    setPending(false);
    if (updateError) {
      notify.error("Não foi possível alterar o status", "Verifique sua conexão e tente novamente.");
      return;
    }
    notify.success(target.active ? "Acesso desativado" : "Acesso ativado",
      userName(target) + (target.active ? " não pode mais entrar no painel." : " já pode entrar no painel."));
    await reload();
  }

  async function changeRole(target: UserRow, role: "admin" | "operator"): Promise<void> {
    setPending(true);
    const { error: updateError } = await client.from("profiles").update({ role }).eq("id", target.id);
    setPending(false);
    if (updateError) {
      notify.error("Não foi possível alterar o papel", "Verifique sua conexão e tente novamente.");
      return;
    }
    notify.success("Papel atualizado",
      userName(target) + " agora é " + (role === "admin" ? "administrador" : "operador") + ".");
    await reload();
  }

  async function handleInvite(): Promise<void> {
    if (inviteName.trim().length < 3) { setError("Informe o nome real da pessoa."); return; }
    if (!inviteEmail.trim()) {
      setError("Informe o e-mail da pessoa a convidar.");
      return;
    }
    setError(null);
    const sentName = inviteName.trim();
    setPending(true);
    try {
      const result = await inviteUser(inviteEmail.trim(), sentName, inviteRole);
      if ("error" in result) {
        notify.error("Convite não enviado", result.error);
        return;
      }
      setInviteEmail("");
      setInviteName("");
      notify.success("Convite solicitado",
        "O Supabase aceitou a solicitação de envio para " + sentName + ". A entrega ainda depende do serviço de e-mail.");
      await reload();
    } catch {
      notify.error("Convite não enviado",
        "Verifique Auth Logs, SMTP e URL de retorno antes de tentar novamente.");
    } finally {
      setPending(false);
    }
  }

  function openUserEditor(target: UserRow): void {
    if (pending || !canManage(target)) return;
    setEditingTarget(target);
    setEditingName(hasRealStaffName(target.name, userEmail(target.id)) ? target.name : "");
    setEditingEmail(userEmail(target.id));
    setEditError("");
  }

  function closeUserEditor(): void {
    if (!pending) {
      setEditingTarget(null);
      setEditError("");
    }
  }

  async function saveUserDetails(): Promise<void> {
    const target = editingTarget;
    if (!target || pending || !canManage(target)) return;
    const name = editingName.trim();
    const email = editingEmail.trim().toLowerCase();
    if (name.length < 3 || name.length > 120) {
      setEditError("Informe o nome completo (3 a 120 caracteres).");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      setEditError("Informe um endereço de e-mail válido.");
      return;
    }
    setPending(true);
    setEditError("");
    try {
      const result = await updateManagedUserDetails(target.id, name, email);
      if ("error" in result) {
        setEditError(result.error);
        return;
      }
      await reload();
      setEditingTarget(null);
      notify.success("Dados atualizados", result.emailChanged
        ? "Nome e e-mail atualizados. O endereço de login foi alterado diretamente, sem envio de convite. Confirme o endereço com a pessoa; contas pendentes ainda dependem de convite e SMTP."
        : "Nome e e-mail de " + name + " foram atualizados.");
    } catch {
      setEditError("Falha ao atualizar usuário. Consulte os registros do sistema antes de tentar novamente.");
    } finally {
      setPending(false);
    }
  }

  async function resendAccess(target: UserRow): Promise<void> {
    if (pending || !canManage(target) || !invitationPending(target.id)) return;
    setPending(true);
    try {
      const result = await resendPendingUserAccess(target.id);
      if ("error" in result) {
        notify.error("Reenvio não solicitado", result.error);
      } else {
        notify.success("Acesso reenviado", "Novo e-mail de definição de senha solicitado para " + target.name +
          ". Confirme o recebimento com a pessoa (inclusive spam).");
      }
    } catch {
      notify.error("Reenvio não solicitado", "Não foi possível solicitar o envio do e-mail. Confira a configuração do SMTP.");
    } finally { setPending(false); }
  }

  async function confirmPasswordReset(): Promise<void> {
    const target = resetTarget;
    if (!target || !canManage(target) || pending) return;
    setPending(true);
    const result = await sendPasswordResetForUser(target.id);
    setPending(false);
    setResetTarget(null);
    if ("error" in result) {
      notify.error("Redefinição não solicitada", result.error);
      return;
    }
    notify.success("Redefinição solicitada",
      "O pedido de envio do link de recuperação para " + userName(target) + " foi aceito pelo Supabase. Confirme o recebimento com a pessoa.");
  }

  async function setAgendaManagerGrant(target: UserRow, enabled: boolean): Promise<void> {
    if (!isOwner || target.role !== "admin" || !target.active || pending || !profile) return;
    setPending(true);
    const { error: saveError } = await client.from("agenda_manager_grants").upsert({
      profile_id: target.id,
      can_manage: enabled,
      granted_by: profile.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "profile_id" });
    setPending(false);
    if (saveError) {
      notify.error("Não foi possível alterar a Agenda", "Verifique sua conexão e tente novamente.");
      return;
    }
    notify.success(enabled ? "Gestão da Agenda liberada" : "Gestão da Agenda revogada",
      (enabled ? "Gestão liberada para " : "Gestão revogada de ") + target.name + ".");
    await reload();
  }

  async function setAuditViewerGrant(target: UserRow, enabled: boolean): Promise<void> {
    if (!isOwner || target.role !== "operator" || pending || !profile) return;
    setPending(true);
    const { error: saveError } = await client.from("audit_viewer_grants").upsert({
      profile_id: target.id,
      can_view: enabled,
      granted_by: profile.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "profile_id" });
    setPending(false);
    if (saveError) {
      notify.error("Não foi possível alterar a Auditoria", "Verifique sua conexão e tente novamente.");
      return;
    }
    notify.success(enabled ? "Acesso à Auditoria liberado" : "Acesso à Auditoria bloqueado",
      (enabled ? "Auditoria liberada para " : "Auditoria bloqueada para ") + target.name + ".");
    await reload();
  }

  function userEmail(userId: string): string { return invitationStatuses?.find((s) => s.id === userId)?.email ?? ""; }
  function userName(target:UserRow):string {return staffNameLabel(target.name,userEmail(target.id));}
  function nameNeedsReview(target:UserRow):boolean {
    return !hasRealStaffName(target.name,userEmail(target.id));
  }

  function invitationPending(userId: string): boolean {
    return invitationStatuses?.find((entry) => entry.id === userId)?.pending === true;
  }

  function userStatus(user: UserRow): { label: string; style: string } {
    if (!user.active) return { label: "Inativo", style: "archived" };
    if (!invitationStatuses) return { label: "A verificar", style: "scheduled" };
    if (invitationPending(user.id)) return { label: "Convite pendente", style: "adjusting" };
    const auth=invitationStatuses.find((item)=>item.id===user.id);
    if(!auth) return {label:"Verificar no Auth",style:"scheduled"};
    if(!auth.confirmed) return {label:"E-mail não confirmado",style:"adjusting"};
    return { label: "Ativo", style: "published" };
  }

  /** Projeta os grants brutos (como vêm do Supabase, com profile_id) no
   * formato de snapshot puro (sem profile_id) usado por `permissionsDraft`.
   * Recebe as linhas como parâmetro (em vez de ler o state direto) para que
   * o chamador possa montar o snapshot com dados recém-recarregados, sem
   * depender de um closure desatualizado após `await reload()`. */
  function snapshotFromRows(
    userId: string, visibilityRows: VisibilityRow[], actionRows: ModuleActionGrantRow[], financeRows: FinanceGrantRow[],
  ): PermissionSnapshot {
    return {
      moduleVisibility: visibilityRows.filter((row) => row.profile_id === userId).map((row) => ({ module_key: row.module_key, enabled: row.enabled })),
      moduleActions: actionRows.filter((row) => row.profile_id === userId).map((row) => ({ module_key: row.module_key, action_key: row.action_key, allowed: row.allowed })),
      financeActions: financeRows.filter((row) => row.profile_id === userId).map((row) => ({ action_key: row.action_key, allowed: row.allowed })),
    };
  }

  function buildSnapshotForUser(userId: string): PermissionSnapshot {
    return snapshotFromRows(userId, moduleVisibility, moduleActionGrants, financeGrants);
  }

  const permissionsDirty = useMemo(() => {
    if (!editingUserId || !permissionDraft) return false;
    return !isPermissionDiffEmpty(diffPermissionDraft(buildSnapshotForUser(editingUserId), permissionDraft));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingUserId, permissionDraft, moduleVisibility, moduleActionGrants, financeGrants]);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent): void {
      if (!permissionsDirty) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [permissionsDirty]);

  function applyEditTarget(userId: string | null): void {
    setEditingUserId(userId);
    setPermissionDraft(userId ? buildPermissionDraft(buildSnapshotForUser(userId)) : null);
    setExpandedModules(new Set());
    setCriticalConfirm(null);
  }

  function requestEditTarget(userId: string | null): void {
    if (pending) return;
    if (permissionsDirty) {
      setPendingSwitch({ target: userId });
      return;
    }
    applyEditTarget(userId);
  }

  function updateModuleEnabled(moduleKey: StaffModuleKey, enabled: boolean): void {
    if (!editingUserId || !permissionDraft) return;
    if (!enabled) {
      setPermissionDraft(applyModuleDeactivation(permissionDraft, moduleKey));
      return;
    }
    const hasExistingConfig = moduleHasExistingActionConfig(buildSnapshotForUser(editingUserId), moduleKey);
    setPermissionDraft(applyModuleActivation(permissionDraft, moduleKey, { hasExistingConfig }));
  }

  function updateModuleAction(moduleKey: StaffActionModule, actionKey: StaffModuleActionKey, allowed: boolean): void {
    if (!permissionDraft) return;
    setPermissionDraft({ ...permissionDraft, moduleActions: { ...permissionDraft.moduleActions, [moduleActionDraftKey(moduleKey, actionKey)]: allowed } });
  }

  function updateFinanceAction(actionKey: StaffFinanceActionKey, allowed: boolean): void {
    if (!permissionDraft) return;
    setPermissionDraft({ ...permissionDraft, financeActions: { ...permissionDraft.financeActions, [actionKey]: allowed } });
  }

  function handleSelectAllModule(moduleKey: StaffActionModule): void {
    if (!permissionDraft) return;
    setPermissionDraft(selectAllModuleActions(permissionDraft, moduleKey, { includeCritical: false }));
    if (moduleActionsHaveCritical(moduleKey)) setCriticalConfirm({ scope: "module", moduleKey });
  }

  function handleClearModule(moduleKey: StaffActionModule): void {
    if (!permissionDraft) return;
    setPermissionDraft(clearModuleActions(permissionDraft, moduleKey));
  }

  function handleSelectAllFinance(): void {
    if (!permissionDraft) return;
    setPermissionDraft(selectAllFinanceActions(permissionDraft, { includeCritical: false }));
    if (financeActionsHaveCritical()) setCriticalConfirm({ scope: "finance" });
  }

  function handleClearFinance(): void {
    if (!permissionDraft) return;
    setPermissionDraft(clearFinanceActions(permissionDraft));
  }

  function confirmCriticalSelection(): void {
    if (!permissionDraft || !criticalConfirm) return;
    setPermissionDraft(
      criticalConfirm.scope === "module"
        ? selectAllModuleActions(permissionDraft, criticalConfirm.moduleKey, { includeCritical: true })
        : selectAllFinanceActions(permissionDraft, { includeCritical: true }),
    );
    setCriticalConfirm(null);
  }

  function handleActivateDefaultModules(): void {
    if (!editingUserId || !permissionDraft) return;
    const snapshot = buildSnapshotForUser(editingUserId);
    const hasExisting: Partial<Record<StaffModuleKey, boolean>> = {};
    for (const mod of STAFF_MODULES) hasExisting[mod.key] = moduleHasExistingActionConfig(snapshot, mod.key);
    setPermissionDraft(activateDefaultModules(permissionDraft, hasExisting));
  }

  async function savePermissions(): Promise<void> {
    if (!editingUserId || !permissionDraft || pending) return;
    const target = (users ?? []).find((item) => item.id === editingUserId);
    if (!target) return;
    const diff = diffPermissionDraft(buildSnapshotForUser(target.id), permissionDraft);
    if (isPermissionDiffEmpty(diff)) {
      applyEditTarget(null);
      return;
    }
    setPending(true);
    const now = new Date().toISOString();
    const [visibilityResult, actionsResult, financeResult] = await Promise.all([
      diff.visibility.length
        ? client.from("staff_module_visibility").upsert(
            diff.visibility.map((row) => ({ profile_id: target.id, module_key: row.module_key, enabled: row.enabled, updated_at: now })),
            { onConflict: "profile_id,module_key" },
          )
        : Promise.resolve({ error: null }),
      diff.moduleActions.length
        ? client.from("staff_module_action_permissions").upsert(
            diff.moduleActions.map((row) => ({ profile_id: target.id, module_key: row.module_key, action_key: row.action_key, allowed: row.allowed, updated_at: now })),
            { onConflict: "profile_id,module_key,action_key" },
          )
        : Promise.resolve({ error: null }),
      diff.financeActions.length
        ? client.from("staff_finance_action_permissions").upsert(
            diff.financeActions.map((row) => ({ profile_id: target.id, action_key: row.action_key, allowed: row.allowed, updated_at: now })),
            { onConflict: "profile_id,action_key" },
          )
        : Promise.resolve({ error: null }),
    ]);
    const fresh = await reload();
    const failures = [visibilityResult, actionsResult, financeResult].filter((result) => result.error);
    setPending(false);
    if (failures.length > 0) {
      notify.error("Permissões não foram salvas",
        "Não foi possível salvar " + failures.length + " de 3 grupos de permissões. " +
        "O estado foi recarregado a partir do banco — revise e tente salvar novamente.");
      if (fresh) setPermissionDraft(buildPermissionDraft(snapshotFromRows(target.id, fresh.moduleVisibility, fresh.moduleActionGrants, fresh.financeGrants)));
      return;
    }
    notify.success("Permissões atualizadas", "As permissões de " + target.name + " foram salvas e já estão valendo.");
    applyEditTarget(null);
  }

  // Ações compactas somente no desktop. Mobile conserva os botões de texto.
  function renderUserActions(user: UserRow): JSX.Element {
    const roleLabel = user.role === "admin" ? "Rebaixar a operador" : "Promover a admin";
    const permissionsLabel = editingUserId === user.id ? "Fechar permissões" : "Editar permissões";
    const activeLabel = user.active ? "Desativar" : "Ativar";
    return (
      <div className="usuarios-row-actions">
        <button type="button" className="usuarios-action-button"
          title="Editar dados do usuário" aria-label={"Editar dados de " + userName(user)}
          onClick={() => openUserEditor(user)} disabled={pending}>
          <UserActionIcon name="edit" /><span>Editar</span>
        </button>
        {isOwner ? (
          <button type="button" className="usuarios-action-button" title={roleLabel}
            aria-label={roleLabel + ": " + userName(user)}
            onClick={() => changeRole(user, user.role === "admin" ? "operator" : "admin")} disabled={pending}>
            <UserActionIcon name={user.role === "admin" ? "demote" : "promote"} /><span>{roleLabel}</span>
          </button>
        ) : null}
        {user.role === "operator" ? (
          <button type="button" className="usuarios-action-button" title={permissionsLabel}
            aria-label={permissionsLabel + ": " + userName(user)}
            onClick={() => requestEditTarget(editingUserId === user.id ? null : user.id)} disabled={pending}>
            <UserActionIcon name="permissions" /><span>{permissionsLabel}</span>
          </button>
        ) : null}
        {invitationPending(user.id) ? (
          <button type="button" className="usuarios-action-button" title="Reenviar convite de acesso"
            aria-label={"Reenviar acesso para " + userName(user)}
            onClick={() => void resendAccess(user)} disabled={pending}>
            <UserActionIcon name="access" /><span>Reenviar acesso</span>
          </button>
        ) : null}
        <button type="button" className="usuarios-action-button" title="Enviar link para redefinir senha"
          aria-label={"Redefinir senha de " + userName(user)}
          onClick={() => setResetTarget(user)} disabled={pending}>
          <UserActionIcon name="password" /><span>Redefinir senha</span>
        </button>
        <button type="button" className={"usuarios-action-button" + (user.active ? " usuarios-action-button--danger" : "")}
          title={activeLabel + " usuário"} aria-label={activeLabel + ": " + userName(user)}
          onClick={() => toggleActive(user)} disabled={pending}>
          <UserActionIcon name={user.active ? "disable" : "enable"} /><span>{activeLabel}</span>
        </button>
      </div>
    );
  }

  if (!profile || (!isOwner && !isAdmin)) {
    return <p className="helper-text">Você não tem permissão para gerenciar usuários.</p>;
  }

  return (
    <>
      <div className="materias-toolbar">
        <span className="materias-count">{users?.length ?? 0} usuário(s)</span>
      </div>

      <div className="inline-form">
        <p className="field-label">Convidar usuário</p>
        <p className="helper-text">
          Envia um convite por e-mail (processado no servidor — nunca troca a sua sessão). A pessoa define
          a própria senha ao acessar o link e depois entra normalmente por e-mail e senha.
        </p>
        <div className="form-grid">
          <label className="form-field">
            <span className="field-label">Nome completo</span>
            <input type="text" autoComplete="name" required minLength={3} maxLength={120}
              value={inviteName} onChange={(event) => setInviteName(event.target.value)}
              placeholder="Nome e sobrenome da pessoa" />
          </label>
          <label className="form-field">
            <span className="field-label">E-mail</span>
            <input
              type="email"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder="pessoa@informativoregional.com.br"
            />
          </label>
          <label className="form-field">
            <span className="field-label">Papel</span>
            <select
              value={inviteRole}
              onChange={(event) => setInviteRole(event.target.value as "operator" | "admin")}
            >
              <option value="operator">Operador</option>
              {canPromoteToAdmin() ? <option value="admin">Administrador</option> : null}
            </select>
          </label>
        </div>
        <div className="form-actions">
          <button type="button" className="form-action-primary" onClick={handleInvite} disabled={pending}>
            Convidar
          </button>
        </div>
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {invitationWarning ? <p className="helper-text" role="status">A situação dos convites não pôde ser conferida: {invitationWarning}</p> : null}
      <p className="helper-text">"Convite pendente" significa que há convite sem confirmação;
        "E-mail não confirmado" identifica outras contas que ainda não confirmaram endereço.
        O Supabase aceitar uma solicitação não comprova entrega nem leitura da mensagem.
        Para endereços externos à equipe do projeto, configure SMTP próprio em Supabase:
        Authentication → SMTP Settings; confira também Auth Logs, Rate Limits,
        Authentication → URL Configuration e a pasta de spam.
        O plano Pro não configura SMTP automaticamente.</p>
      <div className="materias-table-wrap usuarios-table-wrap">
        <table className="materias-table usuarios-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Papel</th>
              <th>Status</th>
              <th>Criado em</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {(users ?? []).map((user) => {
              const manageable = canManage(user);
              return (
                <tr key={user.id}>
                  <td><span className="usuarios-cell-name">{userName(user)}</span>{nameNeedsReview(user) ? <span className="helper-text" style={{ display: "block" }}>Nome cadastral pendente de revisão</span> : null}{userEmail(user.id) ? <span className="helper-text" style={{ display: "block" }}>{userEmail(user.id)}</span> : null}</td>
                  <td>
                    {user.role === "owner" ? (
                      <span className="status-pill status-pill--published">{ROLE_LABELS.owner}</span>
                    ) : (
                      ROLE_LABELS[user.role]
                    )}
                  </td>
                  <td>
                    <span className={`status-pill status-pill--${userStatus(user).style}`}>
                      {userStatus(user).label}
                    </span>
                  </td>
                  <td>{formatDate(user.created_at)}</td>
                  <td>
                    {user.role === "owner" ? (
                      <span className="helper-text">Sem ações — proprietário</span>
                    ) : manageable ? (
                      renderUserActions(user)
                    ) : (
                      <span className="helper-text">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="materias-cards">
        {(users ?? []).map((user) => {
          const manageable = canManage(user);
          return (
            <li key={user.id} className="materia-card materia-card--static">
              <div className="materia-card-head">
                <span className={`status-pill status-pill--${userStatus(user).style}`}>
                  {userStatus(user).label}
                </span>
                <span className="materia-reference">{formatDate(user.created_at)}</span>
              </div>
              <span className="materia-card-title">{userName(user)}</span>
              {nameNeedsReview(user) ? <span className="helper-text">Nome cadastral pendente de revisão</span> : null}
              {userEmail(user.id) ? <span className="helper-text">{userEmail(user.id)}</span> : null}
              <span className="materia-subtitle">{ROLE_LABELS[user.role]}</span>
              <div className="materia-card-foot">
                {user.role === "owner" ? (
                  <span className="helper-text">Sem ações — proprietário</span>
                ) : manageable ? (
                  <>
                    {isOwner ? (
                      <button
                        type="button"
                        onClick={() => changeRole(user, user.role === "admin" ? "operator" : "admin")}
                        disabled={pending}
                      >
                        {user.role === "admin" ? "Rebaixar a operador" : "Promover a admin"}
                      </button>
                    ) : null}
                    {user.role === "operator" ? <button type="button" onClick={() => requestEditTarget(editingUserId === user.id ? null : user.id)} disabled={pending}>
                      {editingUserId === user.id ? "Fechar permissões" : "Editar permissões"}
                    </button> : null}
                    <button type="button" onClick={() => openUserEditor(user)} disabled={pending}>
                      Editar
                    </button>
                    {invitationPending(user.id) ? <button type="button" onClick={() => void resendAccess(user)} disabled={pending}>
                      Reenviar acesso
                    </button> : null}
                        <button type="button" onClick={() => setResetTarget(user)} disabled={pending}>
                      Redefinir senha
                    </button>
                    <button type="button" onClick={() => toggleActive(user)} disabled={pending}>
                      {user.active ? "Desativar" : "Ativar"}
                    </button>
                  </>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <dialog
        ref={editDialogRef}
        className="ir-modal ir-modal--form usuarios-edit-modal"
        aria-labelledby="usuarios-edit-title"
        onCancel={(event) => { if (pending) event.preventDefault(); else closeUserEditor(); }}
        onClick={(event) => { if (event.target === editDialogRef.current) closeUserEditor(); }}
      >
        <form onSubmit={(event) => { event.preventDefault(); void saveUserDetails(); }}>
          <h2 id="usuarios-edit-title">Editar dados do usuário</h2>
          <p className="helper-text">Preencha os dados obrigatórios do colaborador.</p>
          <div className="usuarios-edit-fields">
            <label className="form-field">
              <span className="field-label">Nome completo *</span>
              <input type="text" autoComplete="name" minLength={3} maxLength={120}
                required autoFocus disabled={pending} value={editingName}
                onChange={(event) => { setEditingName(event.target.value); setEditError(""); }}
                placeholder="Nome e sobrenome" />
            </label>
            <label className="form-field">
              <span className="field-label">E-mail *</span>
              <input type="email" autoComplete="email" maxLength={254}
                required disabled={pending} value={editingEmail}
                onChange={(event) => { setEditingEmail(event.target.value); setEditError(""); }}
                placeholder="nome@exemplo.com" />
            </label>
          </div>
          <div className="usuarios-edit-meta">
            <span><strong>Papel:</strong> {editingTarget ? ROLE_LABELS[editingTarget.role] : "—"}</span>
            <span><strong>Status:</strong> {editingTarget ? userStatus(editingTarget).label : "—"}</span>
            <span><strong>Criado em:</strong> {editingTarget ? formatDate(editingTarget.created_at) : "—"}</span>
          </div>
          <p className="helper-text">O e-mail é o endereço de login. Sua alteração não envia convite nem confirma automaticamente o recebimento. Convites pendentes continuam sujeitos às configurações de SMTP.</p>
          {editError ? <p className="form-error" role="alert">{editError}</p> : null}
          <div className="usuarios-edit-actions">
            <button type="button" onClick={closeUserEditor} disabled={pending}>Cancelar</button>
            <button type="submit" className="form-action-primary" disabled={pending || !editingName.trim() || !editingEmail.trim()}>
              {pending ? "Salvando…" : "Salvar alterações"}
            </button>
          </div>
        </form>
      </dialog>

      <ConfirmDialog
        open={Boolean(resetTarget)}
        title="Enviar link para redefinir senha?"
        description={
          <p>Será enviado um e-mail para {resetTarget?.name ?? "o usuário"} com um link seguro. A senha atual não será exibida nem alterada até a pessoa confirmar a nova senha.</p>
        }
        confirmLabel={pending ? "Enviando…" : "Enviar link"}
        destructive={false}
        onConfirm={() => { void confirmPasswordReset(); }}
        onCancel={() => { if (!pending) setResetTarget(null); }}
      />

      <section className="form-section">
        <h2>Permissões por usuário e módulo</h2>
        <p className="helper-text">
          Agenda e Pauta são compartilhadas: todos os usuários ativos podem visualizar a equipe
          e concluir as próprias tarefas. A edição geral é exclusiva do proprietário e dos
          administradores autorizados pelo proprietário.
        </p>
        <div className="inline-form">
          <strong>Administradores autorizados a gerenciar Agenda e Pauta</strong>{" "}
          <span className="status-pill status-pill--published">Salvo imediatamente</span>
          <p className="helper-text">Somente o proprietário libera ou revoga este poder. A baixa individual continua disponível para responsáveis comuns. Cada switch abaixo grava direto no banco ao ser clicado — não depende do botão "Salvar permissões" nem é desfeito por "Cancelar".</p>
          {(users ?? []).filter((user) => user.role === "admin").map((user) => (
            <PermissionSwitch
              key={user.id}
              className="staff-permission-choice"
              checked={agendaManagerGrants.some((grant) => grant.profile_id === user.id && grant.can_manage)}
              disabled={pending || !isOwner || !user.active}
              onChange={(checked) => void setAgendaManagerGrant(user, checked)}
              label={<>{user.name} · {user.active ? "ativo" : "inativo"} · pode criar, editar, cancelar e reabrir</>}
            />
          ))}
          {(users ?? []).every((user) => user.role !== "admin") ? <p className="helper-text">Nenhum administrador cadastrado ainda.</p> : null}
        </div>
        <p className="helper-text">
          Os demais módulos continuam com visibilidade individual. Desativar um módulo o oculta
          do menu e bloqueia seu acesso pelas permissões do servidor; as escolhas de ações ficam
          guardadas e voltam exatamente como estavam se o módulo for reativado depois.
        </p>
        {!editingUserId ? <p className="helper-text">Clique em "Editar permissões" na linha de um operador para configurar módulos e ações liberadas.</p> : null}
        {(users ?? []).filter((user) => user.role === "operator" && user.id === editingUserId && permissionDraft).map((user) => (
          <div key={user.id} className="inline-form permission-editor">
            <div className="permission-editor-head">
              <strong>{user.name} {user.active ? "" : "(inativo)"}</strong>
              {permissionsDirty ? <span className="helper-text status-pill status-pill--adjusting" role="status">Há alterações não salvas</span> : null}
            </div>

            <h3>Auditoria / Histórico de atividades</h3>{" "}
            <span className="status-pill status-pill--published">Salvo imediatamente</span>
            <p className="helper-text">Somente o proprietário pode liberar a consulta ao histórico. Operadores autorizados apenas visualizam os registros. Este switch grava direto no banco ao ser clicado — não depende do botão "Salvar permissões" nem é desfeito por "Cancelar", abaixo.</p>
            <PermissionSwitch
              className="staff-permission-choice"
              checked={auditViewerGrants.some((grant) => grant.profile_id === user.id && grant.can_view)}
              disabled={pending || !isOwner || !user.active}
              onChange={(checked) => void setAuditViewerGrant(user, checked)}
              label="Permitir consulta aos logs do sistema"
            />

            <div className="permission-editor-toolbar">
              <h3>Módulos e ações</h3>{" "}
              <span className="status-pill status-pill--adjusting">Rascunho local — exige "Salvar permissões"</span>
              <button type="button" className="permission-bulk-button" disabled={pending || !canManage(user)} onClick={handleActivateDefaultModules}>
                Ativar módulos (padrão)
              </button>
            </div>
            <p className="helper-text">
              Diferente da Auditoria e da Agenda acima, nada aqui é gravado ao clicar: as mudanças de
              módulos e ações ficam só nesta tela até você clicar em "Salvar permissões"; clicar em
              "Cancelar" descarta apenas essas mudanças pendentes, sem afetar nada já salvo. O switch
              do cartão ativa ou desativa o acesso ao módulo. Ao ativar pela primeira vez, as ações
              operacionais padrão são marcadas automaticamente — nunca ações críticas, administrativas
              ou da NFS-e. Expanda o cartão para revisar ou ajustar as ações.
            </p>

            {STAFF_MODULES.map((mod) => {
              const isFinance = mod.key === "financeiro";
              const actions = isFinance ? STAFF_FINANCE_ACTIONS : STAFF_MODULE_ACTIONS.filter((action) => action.module === mod.key);
              const counts = isFinance ? countAllowedFinanceActions(permissionDraft!) : countAllowedModuleActions(permissionDraft!, mod.key);
              const enabled = permissionDraft!.modules[mod.key] ?? false;
              const expanded = expandedModules.has(mod.key);
              const releaseBlocked = "releaseBlocked" in mod && mod.releaseBlocked === true;
              return (
                <ModulePermissionCard
                  key={mod.key}
                  moduleKey={mod.key}
                  label={mod.label}
                  enabled={enabled}
                  releaseBlocked={releaseBlocked}
                  switchDisabled={pending || !canManage(user)}
                  allowedCount={counts.allowed}
                  totalCount={counts.total}
                  expanded={expanded}
                  onToggleExpanded={() => setExpandedModules((prev) => {
                    const next = new Set(prev);
                    if (next.has(mod.key)) next.delete(mod.key); else next.add(mod.key);
                    return next;
                  })}
                  onToggleEnabled={(checked) => updateModuleEnabled(mod.key, checked)}
                >
                  {!actions.length ? <p className="helper-text">Este módulo não possui ações adicionais — só a visibilidade acima.</p> : (
                    <>
                      {!enabled ? <p className="helper-text">Ative o módulo acima para liberar estas ações; as escolhas abaixo continuam guardadas mesmo desativado.</p> : null}
                      <div className="permission-bulk-row">
                        <button type="button" className="permission-bulk-button" disabled={pending || !canManage(user)}
                          onClick={() => isFinance ? handleSelectAllFinance() : handleSelectAllModule(mod.key)}>
                          Selecionar tudo
                        </button>
                        <button type="button" className="permission-bulk-button" disabled={pending || !canManage(user)}
                          onClick={() => isFinance ? handleClearFinance() : handleClearModule(mod.key)}>
                          Limpar seleção
                        </button>
                      </div>
                      <div className="staff-permissions-grid">
                        {isFinance ? STAFF_FINANCE_ACTIONS.map((action) => (
                          <PermissionSwitch
                            key={action.key}
                            className="staff-permission-choice"
                            checked={permissionDraft!.financeActions[action.key] === true}
                            disabled={pending || !canManage(user)}
                            onChange={(checked) => updateFinanceAction(action.key, checked)}
                            label={<>{action.group} · {action.label}</>}
                          />
                        )) : STAFF_MODULE_ACTIONS.filter((action) => action.module === mod.key).map((action) => (
                          <PermissionSwitch
                            key={action.key}
                            className="staff-permission-choice"
                            checked={permissionDraft!.moduleActions[moduleActionDraftKey(action.module, action.key)] === true}
                            disabled={pending || !canManage(user) || ("adminOnly" in action && action.adminOnly === true)}
                            onChange={(checked) => updateModuleAction(action.module, action.key, checked)}
                            label={action.label}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </ModulePermissionCard>
              );
            })}

            <div className="permission-editor-actions">
              <button type="button" title="Descarta só as mudanças de módulos e ações ainda não salvas nesta tela; Agenda e Auditoria acima já estão gravadas e não são afetadas."
                onClick={() => requestEditTarget(null)} disabled={pending}>Cancelar</button>
              <button type="button" className="form-action-primary" onClick={() => void savePermissions()} disabled={pending || !permissionsDirty}>
                {pending ? "Salvando…" : "Salvar permissões"}
              </button>
            </div>
          </div>
        ))}
        {(users ?? []).filter((user) => user.role === "operator").length === 0
          ? <p className="helper-text">Ainda não há operadores cadastrados. Os controles aparecerão aqui quando um operador for convidado.</p>
          : null}
      </section>

      <ConfirmDialog
        open={criticalConfirm !== null}
        title="Incluir ações críticas na seleção?"
        description={
          <p>
            "Selecionar tudo" também inclui operações críticas (cancelar vendas ou assinaturas,
            estornar recebimento, cancelar cobrança Pix). Confirme para incluí-las também.
          </p>
        }
        confirmLabel="Incluir ações críticas"
        destructive
        onConfirm={confirmCriticalSelection}
        onCancel={() => setCriticalConfirm(null)}
      />

      <ConfirmDialog
        open={pendingSwitch !== null}
        title="Descartar alterações não salvas?"
        description={<p>Há permissões alteradas e ainda não salvas para este operador. Continuar vai descartá-las.</p>}
        confirmLabel="Descartar e continuar"
        destructive
        onConfirm={() => { if (pendingSwitch) applyEditTarget(pendingSwitch.target); setPendingSwitch(null); }}
        onCancel={() => setPendingSwitch(null)}
      />
    </>
  );
}
