"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";
import { useAuth, type AuthRole } from "../../lib/auth/AuthProvider";
import { ROLE_LABELS } from "../../lib/auth/accountDisplay";
import { inviteUser } from "../../app/sistema/usuarios/actions";

type ModuleName = "agenda" | "pauta";
type PermissionLevel = "none" | "read" | "write";
interface PermissionRow { profile_id: string; module_name: ModuleName; can_read: boolean; can_write: boolean; }

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
  const [modulePermissions, setModulePermissions] = useState<PermissionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"operator" | "admin">("operator");

  const isOwner = profile?.role === "owner";
  const isAdmin = profile?.role === "admin";

  async function reload(): Promise<void> {
    const [profilesResult, permissionsResult] = await Promise.all([
      client.from("profiles").select("id, name, role, active, created_at").order("created_at", { ascending: true }),
      client.from("staff_module_permissions").select("profile_id,module_name,can_read,can_write"),
    ]);
    if (profilesResult.error || permissionsResult.error) {
      setError(profilesResult.error?.message ?? permissionsResult.error?.message ?? "Não foi possível carregar os usuários.");
      return;
    }
    setUsers((profilesResult.data ?? []) as UserRow[]);
    setModulePermissions((permissionsResult.data ?? []) as PermissionRow[]);
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

  function permissionLevel(profileId: string, moduleName: ModuleName): PermissionLevel {
    const row = modulePermissions.find((permission) => permission.profile_id === profileId && permission.module_name === moduleName);
    return row?.can_write ? "write" : row?.can_read ? "read" : "none";
  }

  async function saveModulePermission(target: UserRow, moduleName: ModuleName, level: PermissionLevel): Promise<void> {
    if (target.role !== "operator" || !canManage(target)) return;
    setError(null);
    setMessage(null);
    setPending(true);
    const { error: saveError } = await client.from("staff_module_permissions").upsert({
      profile_id: target.id,
      module_name: moduleName,
      can_read: level !== "none",
      can_write: level === "write",
      updated_at: new Date().toISOString(),
    }, { onConflict: "profile_id,module_name" });
    setPending(false);
    if (saveError) {
      setError("Não foi possível salvar a permissão: " + saveError.message);
      return;
    }
    setMessage("Permissões atualizadas para " + target.name + ".");
    await reload();
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
                    <span className={`status-pill status-pill--${user.active ? "published" : "archived"}`}>
                      {user.active ? "Ativo" : "Inativo"}
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
                <span className={`status-pill status-pill--${user.active ? "published" : "archived"}`}>
                  {user.active ? "Ativo" : "Inativo"}
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

      <section className="form-section">
        <h2>Permissões por usuário e módulo</h2>
        <p className="helper-text">Proprietário e administradores mantêm acesso integral. Para operadores, configure individualmente Agenda e Pauta: sem acesso, somente leitura ou edição. O bloqueio também retira os atalhos correspondentes da navegação.</p>
        <p className="helper-text"><strong>Atenção:</strong> os demais módulos (Matérias, Clientes, Financeiro, Comercial, Assinaturas, NFS-e e outros) ainda não têm bloqueio individual completo. Não considere a ocultação do menu como proteção de dados. O botão Ativar/Desativar acima controla a conta inteira.</p>
        {(users ?? []).filter((user) => user.role === "operator").map((user) => (
          <div key={user.id} className="inline-form">
            <strong>{user.name} {user.active ? "" : "(inativo)"}</strong>
            <div className="form-grid">
              {(["agenda", "pauta"] as ModuleName[]).map((moduleName) => (
                <label className="form-field" key={moduleName}>
                  <span className="field-label">{moduleName === "agenda" ? "Agenda" : "Pauta da semana"}</span>
                  <select
                    value={permissionLevel(user.id, moduleName)}
                    disabled={pending || !canManage(user)}
                    onChange={(event) => void saveModulePermission(user, moduleName, event.target.value as PermissionLevel)}
                  >
                    <option value="none">Sem acesso</option>
                    <option value="read">Somente visualizar</option>
                    <option value="write">Visualizar e editar</option>
                  </select>
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
