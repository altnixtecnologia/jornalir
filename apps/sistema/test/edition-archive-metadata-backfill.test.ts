import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { loadPdfDocument } from "@ir/pdf-extraction";
import {
  planArchiveMetadataUpdate,
  sha256OfArchivePdf,
  type ArchiveMetadataRow,
} from "../src/lib/editorial/editionArchiveMetadata";

function fixture(overrides: Partial<ArchiveMetadataRow> = {}): ArchiveMetadataRow {
  return {
    id: "871056f5-d8e2-492f-ad53-e901b86c02f3",
    edition_number: 777,
    archive_provider: "r2",
    pdf_r2_key: "acervo/edicoes/IR 777.pdf",
    pdf_file_size: 12,
    pdf_sha256: null,
    page_count: null,
    ...overrides,
  };
}
const bytes = new TextEncoder().encode("%PDF-fixture");

test("calcula SHA-256 sobre os bytes, não pelo ETag/tamanho/nome", () => {
  assert.equal(
    sha256OfArchivePdf(new TextEncoder().encode("abc")),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.notEqual(sha256OfArchivePdf(bytes), sha256OfArchivePdf(new TextEncoder().encode("%PDF-fixturE")));
});

test("identifica ambos metadados ausentes e gera patch sem tocar outros campos", () => {
  const result = planArchiveMetadataUpdate(fixture({ pdf_file_size: bytes.length }), {
    sizeBytes: bytes.length, sha256: sha256OfArchivePdf(bytes), pageCount: 24,
  });
  assert.deepEqual(result, { status: "update", patch: { pdf_sha256: sha256OfArchivePdf(bytes), page_count: 24 } });
});

test("somente preenche nulos, sem sobrescrever SHA ou contagem já registrados", () => {
  const sha256 = sha256OfArchivePdf(bytes);
  assert.deepEqual(planArchiveMetadataUpdate(fixture({
    pdf_file_size: bytes.length,
    pdf_sha256: sha256,
  }), { sizeBytes: bytes.length, sha256, pageCount: 24 }),
  { status: "update", patch: { page_count: 24 } });

  assert.deepEqual(planArchiveMetadataUpdate(fixture({
    pdf_file_size: bytes.length, page_count: 24,
  }), { sizeBytes: bytes.length, sha256, pageCount: 24 }),
  { status: "update", patch: { pdf_sha256: sha256 } });

  assert.deepEqual(planArchiveMetadataUpdate(fixture({
    pdf_file_size: bytes.length, pdf_sha256: sha256, page_count: 24,
  }), { sizeBytes: bytes.length, sha256, pageCount: 24 }),
  { status: "unchanged", patch: {} });
});

test("tamanho, SHA ou páginas divergentes bloqueiam TODO o UPDATE", () => {
  const sha256 = sha256OfArchivePdf(bytes);
  for (const row of [
    fixture({ pdf_file_size: bytes.length - 1 }),
    fixture({ pdf_file_size: null }),
    fixture({ pdf_file_size: bytes.length, pdf_sha256: "f".repeat(64) }),
    fixture({ pdf_file_size: bytes.length, page_count: 25 }),
    fixture({ pdf_file_size: bytes.length, archive_provider: null }),
    fixture({ pdf_file_size: bytes.length, pdf_r2_key: null }),
  ]) {
    const r = planArchiveMetadataUpdate(row, { sizeBytes: bytes.length, sha256, pageCount: 24 });
    assert.equal(r.status, "conflict");
    assert.deepEqual(r.patch, {});
  }
});

test("dados calculados inválidos também bloqueiam gravação", () => {
  const row = fixture({ pdf_file_size: bytes.length });
  for (const meta of [
    { sizeBytes: bytes.length, sha256: "a", pageCount: 1 },
    { sizeBytes: bytes.length, sha256: sha256OfArchivePdf(bytes), pageCount: 0 },
    { sizeBytes: 0, sha256: sha256OfArchivePdf(bytes), pageCount: 1 },
  ]) {
    assert.equal(planArchiveMetadataUpdate(row, meta).status, "conflict");
  }
});

test("extrai número de páginas de PDF real criado em memória, sem gravar arquivo", async () => {
  const created = await PDFDocument.create();
  created.addPage([420, 594]);
  created.addPage([420, 594]);
  created.addPage([420, 594]);
  const buf = await created.save();
  const doc = await loadPdfDocument(new Uint8Array(buf));
  try {
    assert.equal(doc.numPages, 3);
    assert.equal(sha256OfArchivePdf(buf).length, 64);
  } finally {
    await doc.destroy();
  }
});

test("script exige --apply, limita lotes, verifica ID/chave/tamanho e não faz operações destrutivas", () => {
  const code = readFileSync(new URL("../scripts/backfill-editions-archive-metadata.ts", import.meta.url), "utf8");
  assert.match(code, /const apply = process\.argv\.includes\("--apply"\)/);
  assert.match(code, /MAX_PER_RUN = 25/);
  assert.match(code, /const limit = numberArg\("limit", 3, MAX_PER_RUN\)/);
  assert.match(code, /if \(apply && !hasServiceRoleKey\(\)\)/);
  assert.match(code, /if \(!apply\)/);
  assert.match(code, /\.eq\("id", row\.id\)/);
  assert.match(code, /\.eq\("pdf_r2_key", row\.pdf_r2_key as string\)/);
  assert.match(code, /\.eq\("pdf_file_size", row\.pdf_file_size as number\)/);
  assert.match(code, /q = q\.is\("pdf_sha256", null\)/);
  assert.match(code, /q = q\.is\("page_count", null\)/);
  assert.doesNotMatch(code, /\.delete\(|\.insert\(|\.upsert\(|PutObjectCommand|DeleteObjectCommand|uploadEdition|listEditionArchiveObjects/);
});
