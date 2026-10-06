import { Agent } from "undici";

/**
 * Dispatcher mTLS pra chamadas reais à SEFIN Nacional (Parte 2B, item
 * "HTTP/mTLS") — ESTRITAMENTE server-side; a chave privada nunca sai
 * do processo Node. NÃO reexportado pelo barrel `./index.ts` (mesma
 * razão de `signature.ts`/`transmission-service.ts`: dependência
 * Node-only que não pode entrar no bundle de componente cliente) —
 * quem precisar importa direto de
 * "@ir/core/src/nfse/mutual-tls".
 *
 * Usa `undici` (a implementação por trás do `fetch` global do Node)
 * porque o `fetch` nativo não aceita certificado de cliente via
 * `https.Agent` — precisa do `dispatcher` do undici, configurado com
 * `connect: { cert, key }`.
 */
export function createMutualTlsDispatcher(certificatePem: string, privateKeyPem: string): Agent {
  return new Agent({
    connect: {
      cert: certificatePem,
      key: privateKeyPem,
    },
  });
}
