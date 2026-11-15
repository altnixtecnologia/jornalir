import "server-only";
import { fetch } from "undici";
import { NfseIntegrationError } from "./integration-errors";

/** Mesmo limite para corpos fiscais e respostas sem Content-Length. */
export const NFSE_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

/**
 * Lê o corpo como stream e interrompe assim que ultrapassa o teto.
 * response.text() sozinho permite que um servidor/gateway malformado
 * mande um corpo arbitrariamente grande antes da verificação.
 */
export async function readBoundedNfseBody(
  response: Awaited<ReturnType<typeof fetch>>,
  maxBytes = NFSE_MAX_RESPONSE_BYTES,
): Promise<string> {
  const declared = response.headers.get("content-length");
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    throw new NfseIntegrationError(
      "NFSE_INVALID_RESPONSE", "O Sistema Nacional retornou uma resposta maior que o limite de segurança.", response.status,
    );
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  let total = 0;
  const buffers: Buffer[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new NfseIntegrationError(
          "NFSE_INVALID_RESPONSE", "O Sistema Nacional retornou uma resposta maior que o limite de segurança.", response.status,
        );
      }
      buffers.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(buffers, total).toString("utf8");
}
