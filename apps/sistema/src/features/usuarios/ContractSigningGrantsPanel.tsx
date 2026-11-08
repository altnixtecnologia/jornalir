"use client";

import { useState } from "react";
import { setContractSigningGrantAction } from "../../app/sistema/usuarios/contract-signing-actions";
import { notify } from "../../lib/feedback/notify";

export interface SigningGrantUser {
  id: string;
  name: string;
  role: "owner" | "admin" | "operator";
  active: boolean;
  granted: boolean;
}

const ROLE_LABEL = { owner: "Proprietário", admin: "Administrador", operator: "Operador" } as const;

/**
 * Concessão EXPLÍCITA do poder de assinar contratos comerciais pela empresa.
 * Vale para TODOS, inclusive administrador e proprietário — o papel não
 * presume esse poder (as demais permissões administrativas não mudam). Sem a
 * concessão, o PNG de assinatura não aparece no Meu perfil e o servidor
 * bloqueia a operação. Cada alteração é auditada pelo banco.
 */
export function ContractSigningGrantsPanel({
  users,
  currentRole,
  currentUserId,
  onChanged,
}: {
  users: SigningGrantUser[];
  currentRole: "owner" | "admin" | "operator" | undefined;
  currentUserId: string | undefined;
  onChanged: () => Promise<unknown> | void;
}): JSX.Element | null {
  const [busyId, setBusyId] = useState<string | null>(null);
  if (currentRole !== "owner" && currentRole !== "admin") return null;

  function canChange(user: SigningGrantUser): boolean {
    if (!user.active) return false;
    if (currentRole === "owner") return true;
    return user.role === "operator";
  }

  async function toggle(user: SigningGrantUser): Promise<void> {
    setBusyId(user.id);
    const result = await setContractSigningGrantAction(user.id, !user.granted);
    setBusyId(null);
    if ("error" in result) {
      notify.error("Não foi possível alterar a concessão", result.error);
      return;
    }
    notify.success(
      user.granted ? "Concessão revogada" : "Concessão registrada",
      `${user.name}: ${user.granted ? "não pode mais assinar" : "pode assinar"} contratos comerciais pela empresa. A alteração foi auditada.`,
    );
    await onChanged();
  }

  const active = users.filter((user) => user.active);
  return (
    <section className="form-section" aria-labelledby="signing-grants-title">
      <h2 id="signing-grants-title">Assinar contratos comerciais pela empresa</h2>
      <p className="helper-text">
        Concessão <strong>explícita e individual</strong>, inclusive para administradores e proprietário: o papel não presume esse poder.
        Sem a concessão, a imagem de assinatura não aparece no Meu perfil e o servidor bloqueia a operação. Cada concessão e
        revogação fica registrada na auditoria. O proprietário concede a qualquer pessoa; o administrador, somente a operadores.
      </p>
      {active.length === 0 ? <p className="helper-text">Nenhum usuário ativo.</p> : (
        <ul className="destaques-list">
          {active.map((user) => (
            <li className="destaques-item" key={user.id}>
              <div className="destaques-item-body">
                <span className="materia-title">{user.name}{user.id === currentUserId ? " (você)" : ""}</span>
                <span className="helper-text">
                  {ROLE_LABEL[user.role]} · {user.granted ? "pode assinar contratos comerciais" : "sem concessão"}
                </span>
              </div>
              <div className="form-actions">
                <button type="button" disabled={busyId !== null || !canChange(user)} onClick={() => void toggle(user)}
                  title={canChange(user) ? undefined : "Somente o proprietário altera esta concessão"}>
                  {busyId === user.id ? "Salvando…" : user.granted ? "Revogar" : "Conceder"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
