"use client";

import { useAuth } from "../auth/AuthProvider";

type ModuleReadAccess = { agendaRead: boolean; pautaRead: boolean; loading: boolean };

/** Todos os membros ativos consultam a agenda coletiva.
 * A RLS no banco continua sendo a autoridade; nao concede acesso por UI.
 */
export function useAgendaPautaReadAccess(): ModuleReadAccess {
  const { profile, status } = useAuth();
  const canRead = status === "authenticated" && profile?.active === true &&
    ["owner", "admin", "operator"].includes(profile.role);
  return { agendaRead: canRead, pautaRead: canRead, loading: status === "loading" };
}
