"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";
import { useAuth, type AuthRole } from "../../lib/auth/AuthProvider";
import { ROLE_LABELS } from "../../lib/auth/accountDisplay";
import { hasRealStaffName, staffNameLabel } from "../../lib/auth/userIdentity";
import { inviteUser, listUserInvitationStatuses, sendPasswordResetForUser, updateManagedUserDetails, resendPendingUserAccess } from "../../app/sistema/usuarios/actions";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import { STAFF_FINANCE_ACTIONS, STAFF_MODULE_ACTIONS, STAFF_MODULES, type StaffFinanceActionKey, type StaffModuleActionKey, type StaffActionModule, type StaffModuleKey } from "../../lib/permissions/staffPermissionsCatalog";


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
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
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

  const isOwner = profile?.role === "owner";
  const isAdmin = profile?.role === "admin";

  useEffect(() => {
    const dialog = editDialogRef.current;
    if (!dialog) return;
    if (editingTarget && !dialog.open) dialog.showModal();
    if (!editingTarget && dialog.open) dialog.close();
  }, [editingTarget]);

  async function reload(): Promise<void> {
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
      setError(profilesResult.error?.message ?? visibilityResult.error?.message
        ?? agendaManagersResult.error?.message ?? auditViewersResult.error?.message ?? financeResult.error?.message ?? moduleActionsResult.error?.message ?? membershipsResult.error?.message ?? "Não foi possível carregar os usuários.");
      return;
    }
    // Signatários externos do Auth possuem profile técnico, mas não são
    // colaboradores e não devem aparecer na administração de usuários.
    const staffIds=new Set((membershipsResult.data??[]).map(m=>m.profile_id));
    setUsers((profilesResult.data??[]).filter(profile=>staffIds.has(profile.id)) as UserRow[]);
    setModuleVisibility((visibilityResult.data ?? []) as VisibilityRow[]);
    setAgendaManagerGrants((agendaManagersResult.data ?? []) as AgendaManagerGrantRow[]);
    setAuditViewerGrants((auditViewersResult.data ?? []) as AuditViewerGrantRow[]);
    setFinanceGrants((financeResult.data ?? []) as FinanceGrantRow[]);
    setModuleActionGrants((moduleActionsResult.data ?? []) as ModuleActionGrantRow[]);
    if ("ok" in invitationsResult) {
      setInvitationStatuses(invitationsResult.statuses);
      setInvitationWarning("");
    } else {
      setInvitationStatuses(null);
      setInvitationWarning(invitationsResult.error);
    }
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
      setError("Não é possível habilitar o painel antes da confirmação do e-mail do colaborador.");
      return;
    }
    setError(null);
    setMessage(null);
    setPending(true);
    const { error: updateError } = await client
      .from("profiles")
      .update({ active: !target.active })
      .eq("id", target.id);
    setPending(false);
    if (updateError) {
      setError("Não foi possível alterar o status deste usuário.");
      return;
    }
    await reload();
  }

  async function changeRole(target: UserRow, role: "admin" | "operator"): Promise<void> {
    setError(null);
    setMessage(null);
    setPending(true);
    const { error: updateError } = await client.from("profiles").update({ role }).eq("id", target.id);
    setPending(false);
    if (updateError) {
      setError("Não foi possível alterar o papel deste usuário.");
      return;
    }
    await reload();
  }

  async function handleInvite(): Promise<void> {
    if (inviteName.trim().length < 3) { setError("Informe o nome real da pessoa."); return; }
    if (!inviteEmail.trim()) {
      setError("Informe o e-mail da pessoa a convidar.");
      return;
    }
    setError(null);
    setMessage(null);
    setPending(true);
    try {
      const result = await inviteUser(inviteEmail.trim(), inviteName.trim(), inviteRole);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setInviteEmail("");
      setInviteName("");
      setMessage("Solicitação de convite aceita pelo Supabase. A entrega ainda depende do SMTP e da confirmação pelo destinatário.");
      await reload();
    } catch {
      setError("Falha ao solicitar convite. Verifique Auth Logs, SMTP e URL de retorno antes de tentar novamente.");
    } finally {
      setPending(false);
    }
  }

  function openUserEditor(target: UserRow): void {
    if (pending || !canManage(target)) return;
    setEditingTarget(target);
    setEditingName(target.name);
    setEditingEmail(userEmail(target.id));
    setEditError("");
    setError(null);
    setMessage(null);
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
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email) || email.length > 254) {
      setEditError("Informe um endereço de e-mail válido.");
      return;
    }
    setPending(true);
    setEditError("");
    setError(null);
    setMessage(null);
    try {
      const result = await updateManagedUserDetails(target.id, name, email);
      if ("error" in result) {
        setEditError(result.error);
        return;
      }
      await reload();
      setEditingTarget(null);
      setMessage(result.emailChanged
        ? "Nome e e-mail atualizados. O endereço de login foi alterado diretamente, sem envio de convite. Confirme o endereço com a pessoa; contas pendentes ainda dependem de convite e SMTP."
        : "Dados do usuário atualizados.");
    } catch {
      setEditError("Falha ao atualizar usuário. Consulte os registros do sistema antes de tentar novamente.");
    } finally {
      setPending(false);
    }
  }

  async function resendAccess(target: UserRow): Promise<void> {
    if (pending || !canManage(target) || !invitationPending(target.id)) return;
    setPending(true); setError(null); setMessage(null);
    try {
      const result = await resendPendingUserAccess(target.id);
      if ("error" in result) setError(result.error);
      else setMessage("Novo e-mail de definição de senha solicitado para " + target.name +
        ". Confirme o recebimento com a pessoa (inclusive spam).");
    } catch {
      setError("Não foi possível solicitar o envio do e-mail. Confira a configuração do SMTP.");
    } finally { setPending(false); }
  }

  async function confirmPasswordReset(): Promise<void> {
    const target = resetTarget;
    if (!target || !canManage(target) || pending) return;
    setPending(true);
    setError(null);
    setMessage(null);
    const result = await sendPasswordResetForUser(target.id);
    setPending(false);
    setResetTarget(null);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setMessage("Solicitação de redefinição aceita pelo Supabase para " + userName(target) + ". Confirme o recebimento com a pessoa.");
  }

  async function setAgendaManagerGrant(target: UserRow, enabled: boolean): Promise<void> {
    if (!isOwner || target.role !== "admin" || !target.active || pending || !profile) return;
    setError(null);
    setMessage(null);
    setPending(true);
    const { error: saveError } = await client.from("agenda_manager_grants").upsert({
      profile_id: target.id,
      can_manage: enabled,
      granted_by: profile.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "profile_id" });
    setPending(false);
    if (saveError) {
      setError("Não foi possível alterar a autorização da Agenda: " + saveError.message);
      return;
    }
    setMessage((enabled ? "Gestão liberada para " : "Gestão revogada de ") + target.name + ".");
    await reload();
  }

  async function setAuditViewerGrant(target: UserRow, enabled: boolean): Promise<void> {
    if (!isOwner || target.role !== "operator" || pending || !profile) return;
    setError(null);
    setMessage(null);
    setPending(true);
    const { error: saveError } = await client.from("audit_viewer_grants").upsert({
      profile_id: target.id,
      can_view: enabled,
      granted_by: profile.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "profile_id" });
    setPending(false);
    if (saveError) {
      setError("Não foi possível salvar o acesso à auditoria: " + saveError.message);
      return;
    }
    setMessage((enabled ? "Auditoria liberada para " : "Auditoria bloqueada para ") + target.name + ".");
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

  function financeAllowed(userId: string, key: StaffFinanceActionKey): boolean {
    return financeGrants.some((item) => item.profile_id === userId && item.action_key === key && item.allowed);
  }

  async function saveFinancePermission(target: UserRow, key: StaffFinanceActionKey, allowed: boolean): Promise<void> {
    if (target.role !== "operator" || !canManage(target) || !isModuleEnabled(target.id, "financeiro")) return;
    setPending(true);
    setError(null);
    setMessage(null);
    const { error: saveError } = await client.from("staff_finance_action_permissions").upsert({
      profile_id: target.id, action_key: key, allowed, updated_at: new Date().toISOString(),
    }, { onConflict: "profile_id,action_key" });
    if (saveError) setError("Erro ao salvar autorização financeira: " + saveError.message);
    else setMessage("Permissão atualizada para " + target.name + ".");
    await reload();
    setPending(false);
  }

  function moduleActionAllowed(userId: string, module: StaffActionModule, key: StaffModuleActionKey): boolean {
    return moduleActionGrants.some((grant) =>
      grant.profile_id === userId && grant.module_key === module && grant.action_key === key && grant.allowed);
  }

  async function saveModuleActionPermission(
    target: UserRow, module: StaffActionModule, key: StaffModuleActionKey, allowed: boolean,
  ): Promise<void> {
    if (target.role !== "operator" || !canManage(target) || !isModuleEnabled(target.id, module)) return;
    setPending(true);
    setError(null);
    setMessage(null);
    const { error: saveError } = await client.from("staff_module_action_permissions").upsert({
      profile_id: target.id, module_key: module, action_key: key, allowed,
      updated_at: new Date().toISOString(),
    }, { onConflict: "profile_id,module_key,action_key" });
    if (saveError) setError("Erro ao salvar ação do módulo: " + saveError.message);
    else setMessage("Permissão atualizada para " + target.name + ".");
    await reload();
    setPending(false);
  }

  function isModuleEnabled(userId: string, key: StaffModuleKey): boolean {
    return moduleVisibility.some((item) =>
      item.profile_id === userId && item.module_key === key && item.enabled);
  }

  async function saveModuleVisibility(target: UserRow, key: StaffModuleKey, enabled: boolean): Promise<void> {
    if (target.role !== "operator" || !canManage(target)) return;
    setPending(true);
    setError(null);
    setMessage(null);
    const { error: saveError } = await client.from("staff_module_visibility").upsert({
      profile_id: target.id,
      module_key: key,
      enabled,
      updated_at: new Date().toISOString(),
    }, { onConflict: "profile_id,module_key" });
    if (saveError) setError("Erro ao salvar módulo: " + saveError.message);
    else setMessage((enabled ? "Módulo habilitado" : "Módulo desabilitado") + " para " + target.name + ".");
    await reload();
    setPending(false);
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
            onClick={() => setEditingUserId((id) => id === user.id ? null : user.id)} disabled={pending}>
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
      {message ? <p className="helper-text">{message}</p> : null}

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
                    {user.role === "operator" ? <button type="button" onClick={() => setEditingUserId((id) => id === user.id ? null : user.id)} disabled={pending}>
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
          <strong>Administradores autorizados a gerenciar Agenda e Pauta</strong>
          <p className="helper-text">Somente o proprietário libera ou revoga este poder. A baixa individual continua disponível para responsáveis comuns.</p>
          {(users ?? []).filter((user) => user.role === "admin").map((user) => (
            <label key={user.id} className="staff-permission-choice">
              <input type="checkbox"
                checked={agendaManagerGrants.some((grant) => grant.profile_id === user.id && grant.can_manage)}
                disabled={pending || !isOwner || !user.active}
                onChange={(event) => void setAgendaManagerGrant(user, event.target.checked)}
              />
              <span>{user.name} · {user.active ? "ativo" : "inativo"} · pode criar, editar, cancelar e reabrir</span>
            </label>
          ))}
          {(users ?? []).every((user) => user.role !== "admin") ? <p className="helper-text">Nenhum administrador cadastrado ainda.</p> : null}
        </div>
        <p className="helper-text">
          Os demais módulos continuam com visibilidade individual. Desativar um módulo o oculta
          do menu e bloqueia seu acesso pelas permissões do servidor.
        </p>
        {!editingUserId ? <p className="helper-text">Clique em "Editar permissões" na linha de um operador para configurar módulos e ações liberadas.</p> : null}
        {(users ?? []).filter((user) => user.role === "operator" && user.id === editingUserId).map((user) => (
          <div key={user.id} className="inline-form">
            <strong>{user.name} {user.active ? "" : "(inativo)"}</strong>
            <h3>Auditoria / Histórico de atividades</h3>
            <p className="helper-text">Somente o proprietário pode liberar a consulta ao histórico. Operadores autorizados apenas visualizam os registros.</p>
            <label className="staff-permission-choice">
              <input type="checkbox"
                checked={auditViewerGrants.some((grant) => grant.profile_id === user.id && grant.can_view)}
                disabled={pending || !isOwner || !user.active}
                onChange={(event) => void setAuditViewerGrant(user, event.target.checked)}
              />
              <span>Permitir consulta aos logs do sistema</span>
            </label>
            <h3>Módulos disponíveis</h3>
            <p className="helper-text">Desmarque o módulo para removê-lo dos menus deste operador.</p>
            <div className="staff-permissions-grid">
              {STAFF_MODULES.map((item) => (
                <label key={item.key} className="staff-permission-choice">
                  <input
                    type="checkbox"
                    checked={isModuleEnabled(user.id, item.key)}
                    disabled={pending || !canManage(user)}
                    onChange={(event) => void saveModuleVisibility(user, item.key, event.target.checked)}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
            <h3>Ações de cada módulo</h3>
            <p className="helper-text">
              A caixa do módulo permite consultar e acessar a área. As ações abaixo liberam
              operações específicas, independentemente umas das outras. Desmarcado = negado.
            </p>
            {STAFF_MODULES.filter((mod) => mod.key !== "financeiro").map((mod) => {
              const actions = STAFF_MODULE_ACTIONS.filter((action) => action.module === mod.key);
              if (!actions.length) return null;
              return (
                <div key={mod.key} className="staff-permissions-section">
                  <strong>{mod.label}</strong>
                  {!isModuleEnabled(user.id, mod.key) ? <span className="helper-text">Ative o módulo acima para permitir estas operações.</span> : null}
                  <div className="staff-permissions-grid">
                    {actions.map((action) => (
                      <label key={action.key} className="staff-permission-choice">
                        <input type="checkbox"
                          checked={moduleActionAllowed(user.id, action.module, action.key)}
                          disabled={pending || !canManage(user) || !isModuleEnabled(user.id, action.module) || ("adminOnly" in action && action.adminOnly === true)}
                          onChange={(event) => void saveModuleActionPermission(user, action.module, action.key, event.target.checked)}
                        />
                        <span>{action.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
            <h3>Ações do Financeiro</h3>
            <p className="helper-text">
              Acesso ao módulo e autorização de ações são diferentes. Desmarcado significa negado.
              Criar um título NÃO permite dar baixa, cancelar, estornar ou exportar. Não existe exclusão
              definitiva de lançamentos: use cancelamento conforme a autorização.
            </p>
            {!isModuleEnabled(user.id, "financeiro")
              ? <p className="helper-text">Ative primeiro o módulo Financeiro para configurar suas ações.</p>
              : null}
            <div className="staff-permissions-grid">
              {STAFF_FINANCE_ACTIONS.map((item) => (
                <label key={item.key} className="staff-permission-choice">
                  <input
                    type="checkbox"
                    checked={financeAllowed(user.id, item.key)}
                    disabled={pending || !canManage(user) || !isModuleEnabled(user.id, "financeiro")}
                    onChange={(event) => void saveFinancePermission(user, item.key, event.target.checked)}
                  />
                  <span>{item.group} · {item.label}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
        {(users ?? []).filter((user) => user.role === "operator").length === 0
          ? <p className="helper-text">Ainda não há operadores cadastrados. Os controles aparecerão aqui quando um operador for convidado.</p>
          : null}
      </section>
    </>
  );
}
