/**
 * Sessão mock do painel — fluxo visual/estruturado de login, sem
 * autenticação real ainda (nenhum backend, nenhuma senha validada de
 * verdade). Guarda só uma flag local para decidir se o painel interno pode
 * ser mostrado ou se a tela de login deve aparecer primeiro.
 */
const SESSION_KEY = "ir-mock-session";

export function hasMockSession(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SESSION_KEY) === "1";
}

export function setMockSession(): void {
  window.localStorage.setItem(SESSION_KEY, "1");
}

export function clearMockSession(): void {
  window.localStorage.removeItem(SESSION_KEY);
}
