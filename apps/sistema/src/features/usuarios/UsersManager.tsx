"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";
import { useAuth, type AuthRole } from "../../lib/auth/AuthProvider";
import { ROLE_LABELS } from "../../lib/auth/accountDisplay";
import { inviteUser, listUserInvitationStatuses, sendPasswordResetForUser } from "../../app/sistema/usuarios/actions";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import { STAFF_FINANCE_ACTIONS, STAFF_MODULES, type StaffFinanceActionKey, type StaffModuleKey } from "../../lib/permissions/staffPermissionsCatalog";

interface AgendaManagerGrantRow { profile_id: string; can_manage: boolean; }
interface AuditViewerGrantRow { profile_id: string; can_view: boolean; }
interface VisibilityRow { profile_id: string; module_key: StaffModuleKey; enabled: boolean; }
interface FinanceGrantRow { profile_id: string; action_key: StaffFinanceActionKey; allowed: boolean; }
interface InvitationStatus { id: string; pending: boolean; }

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
  const [invitationStatuses, setInvitationStatuses] = useState<InvitationStatus[] | null>(null);
  const [invitationWarning, setInvitationWarning] = useState("");
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"operator" | "admin">("operator");
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);

  const isOwner = profile?.role === "owner";
  const isAdmin = profile?.role === "admin";

  async function reload(): Promise<void> {
    const [profilesResult, visibilityResult, agendaManagersResult, auditViewersResult, financeResult, invitationsResult] = await Promise.all([
      client.from("profiles").select("id, name, role, active, created_at").order("created_at", { ascending: true }),
      client.from("staff_module_visibility").select("profile_id,module_key,enabled"),
      client.from("agenda_manager_grants").select("profile_id,can_manage"),
      client.from("audit_viewer_grants").select("profile_id,can_view"),
      client.from("staff_finance_action_permissions").select("profile_id,action_key,allowed"),
      listUserInvitationStatuses(),
    ]);
    if (profilesResult.error || visibilityResult.error || agendaManagersResult.error || auditViewersResult.error || financeResult.error) {
      setError(profilesResult.error?.message ?? visibilityResult.error?.message
        ?? agendaManagersResult.error?.message ?? auditViewersResult.error?.message ?? financeResult.error?.message ?? "Não foi possível carregar os usuários.");
      return;
    }
    setUsers((profilesResult.data ?? []) as UserRow[]);
    setModuleVisibility((visibilityResult.data ?? []) as VisibilityRow[]);
    setAgendaManagerGrants((agendaManagersResult.data ?? []) as AgendaManagerGrantRow[]);
    setAuditViewerGrants((auditViewersResult.data ?? []) as AuditViewerGrantRow[]);
    setFinanceGrants((financeResult.data ?? []) as FinanceGrantRow[]);
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
    if (!inviteEmail.trim()) {
      setError("Informe o e-mail da pessoa a convidar.");
      return;
    }
    setError(null);
    setMessage(null);
    setPending(true);
    const result = await inviteUser(inviteEmail.trim(), inviteRole);
    setPending(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setInviteEmail("");
    setMessage("Convite enviado por e-mail. A pessoa define a própria senha ao acessar o link.");
    await reload();
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
    setMessage("Link para redefinir a senha enviado por e-mail para " + target.name + ".");
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

  function invitationPending(userId: string): boolean {
    return invitationStatuses?.find((entry) => entry.id === userId)?.pending === true;
  }

  function userStatus(user: UserRow): { label: string; style: string } {
    if (!user.active) return { label: "Inativo", style: "archived" };
    if (!invitationStatuses) return { label: "A verificar", style: "scheduled" };
    if (invitationPending(user.id)) return { label: "Convite pendente", style: "adjusting" };
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
      <div className="materias-table-wrap">
        <table className="materias-table">
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
                  <td className="materia-title">{user.name}</td>
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
                      <div className="candidate-row-actions">
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
                        </button>                        <button type="button" onClick={() => setResetTarget(user)} disabled={pending}>
                          Redefinir senha
                        </button> : null}
                        <button type="button" onClick={() => toggleActive(user)} disabled={pending}>
                          {user.active ? "Desativar" : "Ativar"}
                        </button>
                      </div>
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
              <span className="materia-card-title">{user.name}</span>
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
                    </button>                    <button type="button" onClick={() => setResetTarget(user)} disabled={pending}>
                      Redefinir senha
                    </button> : null}
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
