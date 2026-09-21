"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseClient } from "../../lib/supabaseClient";
import { useAuth, type AuthRole } from "../../lib/auth/AuthProvider";

interface UserRow {
  id: string;
  name: string;
  role: AuthRole;
  active: boolean;
  created_at: string;
}

const ROLE_LABELS: Record<AuthRole, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  operator: "Operador",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Gestão de usuários (Fase 19) — visível só para owner/admin (a própria
 * página garante isso; o menu já esconde o link para operator). Todas as
 * ações passam pela RLS real de `profiles`: o banco decide o que cada
 * papel pode de fato fazer, esta tela só oferece os botões coerentes com
 * isso.
 */
export function UsersManager(): JSX.Element {
  const { profile } = useAuth();
  const client = useMemo(() => createSupabaseClient(), []);
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"operator" | "admin">("operator");

  const isOwner = profile?.role === "owner";
  const isAdmin = profile?.role === "admin";

  async function reload(): Promise<void> {
    const { data, error: loadError } = await client
      .from("profiles")
      .select("id, name, role, active, created_at")
      .order("created_at", { ascending: true });
    if (loadError) {
      setError("Não foi possível carregar os usuários.");
      return;
    }
    setUsers((data ?? []) as UserRow[]);
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
    const { error: inviteError } = await client.auth.signInWithOtp({
      email: inviteEmail.trim(),
      options: { shouldCreateUser: true },
    });
    setPending(false);
    if (inviteError) {
      setError("Não foi possível enviar o convite. Confira o e-mail e tente novamente.");
      return;
    }
    // A API de convite passwordless nunca devolve o id do usuário criado —
    // o profile (sempre "operator", pelo trigger) só aparece na lista
    // abaixo depois que a linha existir. Promover a admin é sempre um
    // segundo passo manual aqui, nunca automático.
    setInviteEmail("");
    setMessage(
      inviteRole === "admin"
        ? "Convite enviado por e-mail. Assim que a pessoa aparecer na lista abaixo (como Operador), promova a Administrador."
        : "Convite enviado por e-mail (link de acesso). O papel inicial é Operador.",
    );
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
          Envia um link de acesso por e-mail (sem senha definida aqui). O papel inicial de qualquer conta
          nova é sempre Operador; se convidada como Administrador, uma segunda etapa tenta promover
          automaticamente — confirme na lista abaixo.
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
    </>
  );
}
