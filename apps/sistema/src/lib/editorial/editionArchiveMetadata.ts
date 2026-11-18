import { createHash } from "node:crypto";

/**
 * Metadados de uma ficha que já existe em newspaper_editions.
 * A fonte oficial permanece a mesma tabela; nenhum arquivo é alterado.
 */
export interface ArchiveMetadataRow {
  id: string;
  edition_number: number;
  archive_provider: string | null;
  pdf_r2_key: string | null;
  pdf_file_size: number | null;
  pdf_sha256: string | null;
  page_count: number | null;
}

export interface CalculatedArchiveMetadata {
  sizeBytes: number;
  sha256: string;
  pageCount: number;
}

export type ArchiveMetadataDecision =
  | { status: "update"; patch: { pdf_sha256?: string; page_count?: number } }
  | { status: "unchanged"; patch: Record<string, never> }
  | { status: "conflict"; reason: string; patch: Record<string, never> };

/** Só usa bytes REAIS do PDF; ETag, nome e tamanho não servem como SHA-256. */
export function sha256OfArchivePdf(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Planeja apenas preenchimento de nulos; qualquer divergência entre
 * documento e metadados existentes bloqueia a linha inteira.
 * Nunca corrige valores preexistentes silenciosamente.
 */
export function planArchiveMetadataUpdate(
  row: ArchiveMetadataRow,
  calculated: CalculatedArchiveMetadata,
): ArchiveMetadataDecision {
  const conflict = (reason: string): ArchiveMetadataDecision => ({
    status: "conflict", reason, patch: {},
  });

  if (row.archive_provider !== "r2" || !row.pdf_r2_key) {
    return conflict("Edição não possui PDF R2 vinculado.");
  }
  if (!Number.isSafeInteger(calculated.sizeBytes) || calculated.sizeBytes <= 0 ||
      !Number.isInteger(calculated.pageCount) || calculated.pageCount <= 0 ||
      !/^[0-9a-f]{64}$/.test(calculated.sha256)) {
    return conflict("PDF inválido ou metadados calculados inconsistentes.");
  }
  if (!Number.isSafeInteger(row.pdf_file_size) || row.pdf_file_size !== calculated.sizeBytes) {
    return conflict("Tamanho do arquivo R2 diverge do tamanho já registrado.");
  }
  if (row.pdf_sha256 !== null &&
      row.pdf_sha256.toLowerCase() !== calculated.sha256) {
    return conflict("SHA-256 já cadastrado diverge do conteúdo real no R2.");
  }
  if (row.page_count !== null && row.page_count !== calculated.pageCount) {
    return conflict("Quantidade de páginas já cadastrada diverge do PDF real.");
  }
  const patch: { pdf_sha256?: string; page_count?: number } = {};
  if (row.pdf_sha256 === null) patch.pdf_sha256 = calculated.sha256;
  if (row.page_count === null) patch.page_count = calculated.pageCount;
  return Object.keys(patch).length > 0 ? { status: "update", patch } : { status: "unchanged", patch: {} };
}
