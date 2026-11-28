/**
 * Classificação das falhas do provedor WhatsApp (Meta Cloud API) para o despacho durável.
 *
 *  - "retryable": a Meta respondeu e recusou de forma transitória (HTTP 429/5xx, limite de taxa):
 *    pode haver nova tentativa LIMITADA, pois a mensagem não foi aceita;
 *  - "permanent": recusa definitiva (número inválido, template/parâmetros, credencial): sem nova
 *    tentativa automática;
 *  - "ambiguous": sem resposta conclusiva (rede/timeout, resposta sem ID): a Meta pode ter aceitado,
 *    portanto NUNCA se reenvia às cegas; fica "uncertain" para conciliação.
 */
export type ProviderFailureKind = "retryable" | "permanent" | "ambiguous";

export class WhatsappProviderError extends Error {
  constructor(message: string, readonly kind: ProviderFailureKind, readonly httpStatus?: number, readonly code?: string) {
    super(message);
    this.name = "WhatsappProviderError";
  }
}

/** Códigos Meta transitórios documentados (limite de taxa/indisponibilidade). */
const RETRYABLE_META_CODES = new Set([4, 80007, 130429, 131000, 131016, 131048, 131056]);

export function classifyMetaRefusal(httpStatus: number, metaCode?: number): "retryable" | "permanent" {
  if (metaCode !== undefined && RETRYABLE_META_CODES.has(metaCode)) return "retryable";
  if (httpStatus === 429 || httpStatus >= 500) return "retryable";
  return "permanent";
}

/** Erro desconhecido (inclui falhas locais antes da chamada): nunca presumir aceitação nem repetir às cegas. */
export function failureKind(error: unknown): ProviderFailureKind {
  return error instanceof WhatsappProviderError ? error.kind : "ambiguous";
}
