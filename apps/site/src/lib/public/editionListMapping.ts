export interface NewspaperEditionRow {
  id: string;
  edition_number: number;
  publication_date: string;
  title: string | null;
  pdf_url: string | null;
  cover_url: string | null;
  page_count: number | null;
  archive_provider: string | null;
  pdf_r2_key: string | null;
  cover_r2_key: string | null;
}

export interface OnlineEditionItem {
  id: string;
  title: string;
  dateLabel: string;
  publicationDate: string;
  category: string;
  editionNumber: number;
  pdfPath: string | null;
  sourceUrl: string | null;
  coverUrl: string | null;
  pageCount?: number;
  archiveProvider: string;
}

export function dateLabel(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("pt-BR");
}

/**
 * Edições do acervo R2 são entregues pela própria rota de proxy do portal
 * (link relativo, nunca o endereço técnico do R2) — mesmo quando não têm
 * `pdf_url`/`cover_url` externos preenchidos, nunca podem desaparecer da
 * listagem por causa disso.
 */
export function mapEditionRow(row: NewspaperEditionRow): OnlineEditionItem {
  const isR2 = row.archive_provider === "r2";
  const pdfPath = isR2 && row.pdf_r2_key ? `/api/jornal-online/editions/${row.id}/pdf` : row.pdf_url;
  const coverUrl = isR2 && row.cover_r2_key ? `/api/jornal-online/editions/${row.id}/cover` : row.cover_url;
  return {
    id: row.id,
    title: row.title || `Edição ${row.edition_number}`,
    dateLabel: dateLabel(row.publication_date),
    publicationDate: row.publication_date,
    category: `Edição ${row.edition_number}`,
    editionNumber: row.edition_number,
    pdfPath,
    sourceUrl: pdfPath,
    coverUrl,
    pageCount: row.page_count ?? undefined,
    archiveProvider: row.archive_provider ?? "external",
  };
}
