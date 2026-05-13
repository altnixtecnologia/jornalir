export interface CalameoEdition {
  id: string;
  title: string;
  dateLabel: string;
  category: string;
  pdfPath: string;
  sourceUrl?: string;
  pageCount?: number;
}

export const calameoEditions: CalameoEdition[] = [
  { id: "ir-700", title: "Informativo Regional - Edição 700", dateLabel: "Acervo", category: "Edição Semanal", pdfPath: "/uploads/jornal-online/IR%20700_compressed.pdf", sourceUrl: "https://www.calameo.com/books/0015652979c5b5646e395", pageCount: 28 },
  { id: "ir-699", title: "Informativo Regional - Edição 699", dateLabel: "Acervo", category: "Edição Semanal", pdfPath: "/uploads/jornal-online/IR%20699_compressed.pdf", sourceUrl: "https://www.calameo.com/books/00156529798c175f3235f", pageCount: 28 },
  { id: "ir-698", title: "Informativo Regional - Edição 698", dateLabel: "Acervo", category: "Edição Semanal", pdfPath: "/uploads/jornal-online/IR%20698_compressed.pdf", sourceUrl: "https://www.calameo.com/books/00156529749412db6e86c", pageCount: 28 },
  { id: "ir-697", title: "Informativo Regional - Edição 697", dateLabel: "Acervo", category: "Edição Semanal", pdfPath: "/uploads/jornal-online/IR%20697_compressed.pdf", sourceUrl: "https://www.calameo.com/books/001565297262fb4f5fbbf", pageCount: 28 },
  { id: "ir-696", title: "Informativo Regional - Edição 696", dateLabel: "Acervo", category: "Edição Semanal", pdfPath: "/uploads/jornal-online/IR%20696_compressed.pdf", sourceUrl: "https://www.calameo.com/books/001565297927b1b146500", pageCount: 28 },
  { id: "ir-687", title: "Informativo Regional - Edição 687", dateLabel: "Acervo", category: "Edição Semanal", pdfPath: "/uploads/jornal-online/IR%20687_compressed.pdf", sourceUrl: "https://www.calameo.com/books/0015652973d2495f69098", pageCount: 28 },
  { id: "ir-685", title: "Informativo Regional - Edição 685", dateLabel: "Acervo", category: "Edição Semanal", pdfPath: "/uploads/jornal-online/IR%20685_compressed.pdf", sourceUrl: "https://www.calameo.com/books/00156529793e052dd3a60", pageCount: 28 }
];

export function calameoReadUrl(id: string): string {
  return `https://www.calameo.com/read/${id}`;
}
