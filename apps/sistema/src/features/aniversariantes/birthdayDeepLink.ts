/**
 * Único contrato de navegação entre Cadastro mestre e Aniversariantes.
 * O vínculo editorial só é pré-selecionado após conferir no servidor se
 * o cliente está entre os grupos ativos e visíveis ao usuário autorizado.
 * Nenhuma publicação em jornal é presumida ou habilitada pelo link.
 */
export function birthdayCreateHref(clientId: string): string {
  return `/sistema/aniversariantes?novo=1&cliente=${encodeURIComponent(clientId)}`;
}

export function resolveBirthdayCreateGroupId(
  query: { novo?: string; cliente?: string } | undefined,
  allowedGroupIds: readonly string[],
): string {
  if (query?.novo !== "1" || typeof query.cliente !== "string") return "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query.cliente)) {
    return "";
  }
  return allowedGroupIds.includes(query.cliente) ? query.cliente : "";
}
