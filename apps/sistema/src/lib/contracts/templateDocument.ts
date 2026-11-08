import { createHash } from "node:crypto";

/**
 * Documento fixo (PDF) de um modelo de contrato — licitações, órgãos
 * públicos e outras condições com texto próprio. NÃO mescla variáveis: o PDF
 * é usado exatamente como enviado, com conferência manual (limite
 * explícito na tela). Os bytes são inspecionados; não se confia no tipo
 * enviado pelo navegador.
 */

export const TEMPLATE_DOCUMENT_BUCKET = "contract-template-files";
export const MAX_TEMPLATE_DOCUMENT_BYTES = 10 * 1024 * 1024;

export type TemplateDocumentInspection =
  | { ok: true; bytes: number; sha256: string; path: string }
  | { ok: false; error: string };

function indexOfAscii(haystack: Uint8Array, needle: string, from = 0): number {
  const n = needle.length;
  outer: for (let i = from; i <= haystack.length - n; i += 1) {
    for (let j = 0; j < n; j += 1) if (haystack[i + j] !== needle.charCodeAt(j)) continue outer;
    return i;
  }
  return -1;
}

export function inspectTemplatePdf(bytes: Uint8Array): TemplateDocumentInspection {
  if (bytes.length === 0) return { ok: false, error: "Arquivo vazio." };
  if (bytes.length > MAX_TEMPLATE_DOCUMENT_BYTES) return { ok: false, error: "O PDF deve ter no máximo 10 MB." };
  // "%PDF-" nos primeiros bytes (a especificação tolera lixo até 1024 bytes).
  const header = indexOfAscii(bytes.subarray(0, 1024), "%PDF-");
  if (header === -1) return { ok: false, error: "O arquivo não é um PDF válido." };
  const tail = bytes.subarray(Math.max(0, bytes.length - 2048));
  if (indexOfAscii(tail, "%%EOF") === -1) return { ok: false, error: "PDF incompleto ou corrompido (fim do arquivo ausente)." };
  // Documento fixo precisa estar legível por conferência humana: sem criptografia.
  if (indexOfAscii(bytes, "/Encrypt") !== -1) return { ok: false, error: "PDF protegido por senha não é aceito." };
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return { ok: true, bytes: bytes.length, sha256, path: `templates/${sha256}.pdf` };
}
