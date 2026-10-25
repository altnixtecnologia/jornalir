/** Configuração única dos links de convite/recovery de colaboradores.
 * Um erro de origem não pode enviar tokens para preview, HTTP ou hosts
 * arbitrários; a verificação ocorre ANTES de chamar o Supabase Auth.
 * Não identifica nem verifica a configuração SMTP do projeto.
 */
export function staffAuthRedirectUrl({
  configuredBaseUrl, production, recovery = false,
}: {
  configuredBaseUrl?: string;
  production: boolean;
  recovery?: boolean;
}): string {
  const base = configuredBaseUrl?.trim() ||
    (production ? "https://controle.altnix.com.br" : "http://localhost:3001");
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new Error("URL do sistema inválida. Confira NEXT_PUBLIC_SISTEMA_URL antes de enviar convites.");
  }
  if (url.username || url.password || url.search || url.hash ||
      (url.pathname !== "/" && url.pathname !== "") ||
      !["http:", "https:"].includes(url.protocol)) {
    throw new Error("URL de retorno inválida: informe apenas a origem do sistema, sem caminhos, parâmetros ou credenciais.");
  }
  if (production) {
    if (url.protocol !== "https:" || url.hostname !== "controle.altnix.com.br" || url.port) {
      throw new Error("Convites bloqueados: em produção o destino deve ser https://controle.altnix.com.br. Verifique NEXT_PUBLIC_SISTEMA_URL.");
    }
  } else if (url.protocol !== "https:" &&
      !(url.protocol === "http:" && ["localhost","127.0.0.1"].includes(url.hostname))) {
    throw new Error("Links de acesso HTTP só são permitidos para desenvolvimento local.");
  }
  const path = recovery ? "/definir-senha?recovery=1" : "/definir-senha";
  return new URL(path,url.origin).toString();
}
