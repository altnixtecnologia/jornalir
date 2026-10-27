/** Lógica pura de `/auth/confirm` (Fase 20 — correção de ativação),
 * separada do Route Handler só para poder testar sem subir Next.js/Supabase.
 *
 * O destino nunca vem de parâmetro de URL fornecido por quem gerou o link
 * — só do `type` que o próprio Supabase valida ao emitir o token. Isso
 * elimina qualquer superfície de redirecionamento aberto nesta rota.
 */
export type AuthConfirmType = "invite" | "recovery";

const SUCCESS_DESTINATION: Record<AuthConfirmType, string> = {
  invite: "/definir-senha",
  recovery: "/definir-senha?recovery=1",
};

const ERROR_DESTINATION: Record<AuthConfirmType, string> = {
  invite: "/definir-senha?erro=link-expirado",
  recovery: "/definir-senha?recovery=1&erro=link-expirado",
};

export const INVALID_LINK_DESTINATION = "/login?erro=link-invalido";

export function parseAuthConfirmType(value: string | null): AuthConfirmType | null {
  return value === "invite" || value === "recovery" ? value : null;
}

export function authConfirmSuccessDestination(type: AuthConfirmType): string {
  return SUCCESS_DESTINATION[type];
}

export function authConfirmErrorDestination(type: AuthConfirmType): string {
  return ERROR_DESTINATION[type];
}
