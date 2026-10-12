import type { AuthRole } from "./AuthProvider";

/** Rótulo em português de cada papel — única fonte, reaproveitada por Usuários e Meu perfil. */
export const ROLE_LABELS: Record<AuthRole, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  operator: "Operador",
};

/** Iniciais do menu de conta (ex.: "Cristian Adam Berão" -> "CB") — só as duas primeiras palavras, nunca mais. */
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
