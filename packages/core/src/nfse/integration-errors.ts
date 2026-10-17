export type NfseIntegrationErrorCode =
  | "CERTIFICATE_NOT_CONFIGURED"
  | "CERTIFICATE_INVALID"
  | "CERTIFICATE_EXPIRED"
  | "CERTIFICATE_CNPJ_MISMATCH"
  | "CERTIFICATE_DECRYPT_FAILED"
  | "NFSE_TLS_ERROR"
  | "NFSE_TIMEOUT"
  | "NFSE_HTTP_ERROR"
  | "NFSE_INVALID_RESPONSE";

export class NfseIntegrationError extends Error {
  constructor(
    public readonly code: NfseIntegrationErrorCode,
    message: string,
    public readonly httpStatus?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "NfseIntegrationError";
  }
}

function errorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const direct = "code" in error && typeof error.code === "string" ? error.code : "";
  const cause = "cause" in error ? error.cause : undefined;
  if (direct) return direct;
  return cause && typeof cause === "object" && "code" in cause && typeof cause.code === "string" ? cause.code : "";
}

export function normalizeNfseTransportError(error: unknown): NfseIntegrationError {
  if (error instanceof NfseIntegrationError) return error;
  const code = errorCode(error).toUpperCase();
  const name = error instanceof Error ? error.name : "";
  if (name === "AbortError" || code.includes("TIMEOUT")) {
    return new NfseIntegrationError("NFSE_TIMEOUT", "O serviço da NFS-e não respondeu dentro do tempo limite.", undefined, { cause: error });
  }
  if (/(TLS|SSL|CERT|SOCKET|ECONNRESET|EPROTO)/.test(code)) {
    return new NfseIntegrationError("NFSE_TLS_ERROR", "Não foi possível estabelecer a conexão mTLS segura com o serviço da NFS-e.", undefined, { cause: error });
  }
  return new NfseIntegrationError("NFSE_HTTP_ERROR", "Falha de comunicação com o serviço da NFS-e.", undefined, { cause: error });
}
