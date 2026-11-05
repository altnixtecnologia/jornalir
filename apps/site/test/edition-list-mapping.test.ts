import test from "node:test";
import assert from "node:assert/strict";
import { mapEditionRow, type NewspaperEditionRow } from "../src/lib/public/editionListMapping";

function row(overrides: Partial<NewspaperEditionRow> = {}): NewspaperEditionRow {
  return {
    id: "9f2a3b10-0000-4000-8000-000000000776",
    edition_number: 776,
    publication_date: "2026-11-05",
    title: "Informativo Regional",
    pdf_url: null,
    cover_url: null,
    page_count: null,
    archive_provider: "r2",
    pdf_r2_key: "acervo/edicoes/IR 776.pdf",
    cover_r2_key: "jornal-online/2026/edicao-0776/capa-abc.webp",
    ...overrides,
  };
}

test("edição R2 sem pdf_url/cover_url externos usa as rotas de proxy do próprio portal, não desaparece", () => {
  const item = mapEditionRow(row());
  assert.equal(item.pdfPath, "/api/jornal-online/editions/9f2a3b10-0000-4000-8000-000000000776/pdf");
  assert.equal(item.sourceUrl, item.pdfPath);
  assert.equal(item.coverUrl, "/api/jornal-online/editions/9f2a3b10-0000-4000-8000-000000000776/cover");
});

test("links de edição R2 são relativos ao portal — nunca o endereço técnico do R2", () => {
  const item = mapEditionRow(row());
  assert.doesNotMatch(item.pdfPath ?? "", /cloudflarestorage|r2\.dev|https?:\/\//);
  assert.doesNotMatch(item.coverUrl ?? "", /cloudflarestorage|r2\.dev|https?:\/\//);
});

test("edição legada (drive/external) continua usando pdf_url/cover_url originais", () => {
  const item = mapEditionRow(
    row({
      archive_provider: "drive",
      pdf_r2_key: null,
      cover_r2_key: null,
      pdf_url: "https://drive.google.com/file/123",
      cover_url: "https://drive.google.com/file/456",
    }),
  );
  assert.equal(item.pdfPath, "https://drive.google.com/file/123");
  assert.equal(item.coverUrl, "https://drive.google.com/file/456");
});

test("edição marcada archive_provider=r2 mas sem pdf_r2_key cai no pdf_url (se houver), nunca quebra", () => {
  const item = mapEditionRow(row({ pdf_r2_key: null, pdf_url: "https://exemplo/fallback.pdf" }));
  assert.equal(item.pdfPath, "https://exemplo/fallback.pdf");
});

test("título ausente usa 'Edição N' como fallback", () => {
  const item = mapEditionRow(row({ title: null }));
  assert.equal(item.title, "Edição 776");
});
