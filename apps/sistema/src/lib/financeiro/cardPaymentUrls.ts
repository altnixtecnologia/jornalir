/**
 * URLs do pagamento por cartão (fatura hospedada do Asaas). Funções puras e sem dependências:
 *
 *  - `trustedAsaasInvoiceUrl`: só devolve URLs https da fatura em domínio do Asaas; qualquer outra
 *    coisa (outro domínio, http, credenciais, porta, caminho inesperado) vira `null` e nunca é exibida;
 *  - retorno após o pagamento: a URL é MONTADA aqui a partir de partes validadas (origem da lista
 *    permitida + código de portal + referência opaca), nunca copiada de entrada externa — sem open redirect.
 *    O retorno é só experiência: nunca prova pagamento (isso é do webhook).
 */
const INVOICE_HOSTS = new Set(["asaas.com", "www.asaas.com", "sandbox.asaas.com", "www.sandbox.asaas.com"]);

export function trustedAsaasInvoiceUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 300) return null;
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  if (!INVOICE_HOSTS.has(url.hostname.toLowerCase())) return null;
  if (!/^\/i\/[A-Za-z0-9_-]{4,64}$/.test(url.pathname)) return null;
  return `https://${url.hostname.toLowerCase()}${url.pathname}`;
}

export const PORTAL_CODE_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
export const OPAQUE_REF_PATTERN = /^[0-9a-f]{32}$/;
export const PUBLIC_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

/** Origens permitidas para o retorno do portal (lista em variável de ambiente; padrão: portal oficial). */
export function allowedReturnOrigins(raw: string | undefined): string[] {
  const list = (raw ?? "https://cliente.altnix.com.br").split(/[\s,;]+/).filter(Boolean);
  return list.flatMap((entry) => {
    try {
      const url = new URL(entry);
      return url.protocol === "https:" && !url.username && !url.password && !url.port && !url.pathname.replace(/\//g, "")
        ? [url.origin] : [];
    } catch { return []; }
  });
}

/** Retorno ao portal do cliente: `${origem}/${código}?finance=return&ref=${referência}`. */
export function buildPortalReturnUrl(input: { origins: string[]; origin?: string; portalCode: unknown; ref: unknown }): string | null {
  const origin = input.origin ?? input.origins[0];
  if (!origin || !input.origins.includes(origin)) return null;
  if (typeof input.portalCode !== "string" || !PORTAL_CODE_PATTERN.test(input.portalCode)) return null;
  if (typeof input.ref !== "string" || !OPAQUE_REF_PATTERN.test(input.ref)) return null;
  return `${origin}/${input.portalCode}?finance=return&ref=${input.ref}`;
}

/** Retorno à página pública de pagamento do próprio Jornal. */
export function buildPublicReturnUrl(origin: string, token: unknown): string | null {
  if (typeof token !== "string" || !PUBLIC_TOKEN_PATTERN.test(token)) return null;
  return `${origin}/pagamento/${token}?retorno=1`;
}
