/**
 * Navegação de retorno para todo o painel interno, inclusive WebView/PWA.
 *
 * Não depende do histórico de um navegador externo: quando a tela é aberta
 * diretamente (atalho, notificações, atualização da aba) o destino será uma
 * página interna segura, nunca a saída do aplicativo nem uma rota inexistente.
 */
export function recordAdminRoute(
  stack: readonly string[],
  route: string,
  fromBrowserHistory: boolean,
): string[] {
  if (!route) return [...stack];
  if (stack.length === 0) return [route];
  if (stack[stack.length - 1] === route) return [...stack];
  if (fromBrowserHistory) {
    const previousIndex = stack.lastIndexOf(route);
    if (previousIndex >= 0) return stack.slice(0, previousIndex + 1);
  }
  return [...stack, route];
}

export function resolveAdminBackFallback(pathname: string): string {
  const path = pathname.split("?")[0].replace(/\/+$/, "") || "/sistema";
  const segments = path.split("/").filter(Boolean);
  if (segments[0] !== "sistema" || segments.length <= 2) return "/sistema";

  // Um detalhe, edição ou criação aninhada deve voltar à página que o
  // contém (cliente/contrato/rascunho/etc). Não presumir uma URL de volta
  // a partir de um ID ou parâmetro desconhecido.
  if (segments.length >= 4) return "/" + segments.slice(0, -1).join("/");

  const area = segments[1];
  switch (area) {
    case "nfse":
      return "/sistema/nfse";
    case "editorial":
      // O editorial não tem página índice em /sistema/editorial.
      return segments[2] === "materias" ? "/sistema" : "/sistema/editorial/materias";
    case "financeiro":
      return "/sistema/financeiro";
    case "publicidade":
      return "/sistema/publicidade";
    case "clientes":
      return "/sistema/clientes";
    case "assinaturas":
      return "/sistema/assinaturas";
    // Os demais módulos são acessados a partir do painel principal.
    default:
      return "/sistema";
  }
}
