/**
 * Importador de metadados do acervo histórico de edições (PDFs já enviados
 * pelo Informativo03 ao bucket R2 exclusivo, padrão `acervo/edicoes/IR
 * NNN.pdf`). FUNÇÃO PURA: não acessa R2, Supabase nem sistema de arquivos —
 * recebe listas já consultadas e só calcula o relatório de conciliação.
 * Nunca grava nada e nunca inventa `publication_date`.
 */

const ACERVO_KEY_PATTERN = /^acervo\/edicoes\/IR\s*0*(\d+)\.pdf$/i;

export function parseEditionArchiveObjectKey(key: string): number | null {
  const match = key.match(ACERVO_KEY_PATTERN);
  if (!match) return null;
  const editionNumber = Number(match[1]);
  return Number.isInteger(editionNumber) && editionNumber > 0 ? editionNumber : null;
}

export interface EditionArchiveObjectInput {
  key: string;
  size: number;
}

export interface ExistingEditionRow {
  editionNumber: number;
  publicationDate: string | null;
  archiveProvider: string | null;
  pdfR2Key: string | null;
  pdfFileSize: number | null;
  pdfSha256: string | null;
}

export type EditionArchiveImportStatus =
  | "already_linked_matching"
  | "already_linked_diverging"
  | "ready_to_link"
  | "edition_not_found_pending_identification"
  | "duplicate_object"
  | "unrecognized_key";

export interface EditionArchiveImportRow {
  editionNumber: number | null;
  key: string;
  sizeBytes: number;
  status: EditionArchiveImportStatus;
  note: string;
}

export interface EditionArchiveImportReport {
  rows: EditionArchiveImportRow[];
  gaps: number[];
  minEditionNumber: number | null;
  maxEditionNumber: number | null;
  counts: Record<EditionArchiveImportStatus, number>;
}

const STATUS_NOTES: Record<EditionArchiveImportStatus, string> = {
  already_linked_matching: "Edição já vinculada a este mesmo objeto R2 (chave e tamanho conferem).",
  already_linked_diverging:
    "Edição já tem arquive_provider=r2, mas apontando para outro objeto/tamanho — revisar manualmente antes de sobrescrever.",
  ready_to_link: "Edição existe no cadastro e pode ser vinculada a este objeto (ainda não vinculada).",
  edition_not_found_pending_identification:
    "Número de edição reconhecido no nome do arquivo, mas sem registro em newspaper_editions — não inventar data; aguardando identificação manual.",
  duplicate_object: "Mais de um objeto no bucket aponta para o mesmo número de edição — revisar antes de vincular.",
  unrecognized_key: "Nome de objeto fora do padrão acervo/edicoes/IR NNN.pdf — revisar manualmente.",
};

export function buildEditionArchiveImportReport(
  objects: readonly EditionArchiveObjectInput[],
  existingEditions: readonly ExistingEditionRow[],
): EditionArchiveImportReport {
  const editionByNumber = new Map(existingEditions.map((row) => [row.editionNumber, row]));

  const parsed = objects.map((object) => ({
    object,
    editionNumber: parseEditionArchiveObjectKey(object.key),
  }));

  const countByEditionNumber = new Map<number, number>();
  for (const item of parsed) {
    if (item.editionNumber === null) continue;
    countByEditionNumber.set(item.editionNumber, (countByEditionNumber.get(item.editionNumber) ?? 0) + 1);
  }

  const rows: EditionArchiveImportRow[] = parsed.map(({ object, editionNumber }) => {
    if (editionNumber === null) {
      return {
        editionNumber: null,
        key: object.key,
        sizeBytes: object.size,
        status: "unrecognized_key",
        note: STATUS_NOTES.unrecognized_key,
      };
    }

    if ((countByEditionNumber.get(editionNumber) ?? 0) > 1) {
      return {
        editionNumber,
        key: object.key,
        sizeBytes: object.size,
        status: "duplicate_object",
        note: STATUS_NOTES.duplicate_object,
      };
    }

    const existing = editionByNumber.get(editionNumber);
    if (!existing) {
      return {
        editionNumber,
        key: object.key,
        sizeBytes: object.size,
        status: "edition_not_found_pending_identification",
        note: STATUS_NOTES.edition_not_found_pending_identification,
      };
    }

    const alreadyLinkedToThisObject =
      existing.archiveProvider === "r2" &&
      existing.pdfR2Key === object.key &&
      existing.pdfFileSize === object.size;
    if (alreadyLinkedToThisObject) {
      return {
        editionNumber,
        key: object.key,
        sizeBytes: object.size,
        status: "already_linked_matching",
        note: STATUS_NOTES.already_linked_matching,
      };
    }

    const linkedToAnotherObject =
      existing.archiveProvider === "r2" && existing.pdfR2Key !== null && existing.pdfR2Key !== object.key;
    if (linkedToAnotherObject) {
      return {
        editionNumber,
        key: object.key,
        sizeBytes: object.size,
        status: "already_linked_diverging",
        note: STATUS_NOTES.already_linked_diverging,
      };
    }

    return {
      editionNumber,
      key: object.key,
      sizeBytes: object.size,
      status: "ready_to_link",
      note: STATUS_NOTES.ready_to_link,
    };
  });

  const recognizedNumbers = rows
    .map((row) => row.editionNumber)
    .filter((value): value is number => value !== null);
  const minEditionNumber = recognizedNumbers.length ? Math.min(...recognizedNumbers) : null;
  const maxEditionNumber = recognizedNumbers.length ? Math.max(...recognizedNumbers) : null;

  const gaps: number[] = [];
  if (minEditionNumber !== null && maxEditionNumber !== null) {
    const present = new Set(recognizedNumbers);
    for (let n = minEditionNumber; n <= maxEditionNumber; n += 1) {
      if (!present.has(n)) gaps.push(n);
    }
  }

  const counts: Record<EditionArchiveImportStatus, number> = {
    already_linked_matching: 0,
    already_linked_diverging: 0,
    ready_to_link: 0,
    edition_not_found_pending_identification: 0,
    duplicate_object: 0,
    unrecognized_key: 0,
  };
  for (const row of rows) counts[row.status] += 1;

  return { rows, gaps, minEditionNumber, maxEditionNumber, counts };
}

function csvEscape(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Relatório em CSV para revisão humana — nenhuma gravação, só leitura. */
export function editionArchiveImportReportToCsv(report: EditionArchiveImportReport): string {
  const header = ["edition_number", "key", "size_bytes", "status", "note"].join(",");
  const lines = report.rows
    .slice()
    .sort((a, b) => (a.editionNumber ?? 0) - (b.editionNumber ?? 0))
    .map((row) =>
      [row.editionNumber ?? "", row.key, row.sizeBytes, row.status, row.note].map(csvEscape).join(","),
    );
  const gapLines = report.gaps.map((n) => [n, "", "", "gap_missing_object", "Número de edição ausente no bucket dentro do intervalo observado."].map(csvEscape).join(","));
  return [header, ...lines, ...gapLines].join("\n");
}
