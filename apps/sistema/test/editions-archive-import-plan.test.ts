import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEditionArchiveImportReport,
  editionArchiveImportReportToCsv,
  parseEditionArchiveObjectKey,
  type ExistingEditionRow,
} from "../src/providers/r2/editionsArchiveImportPlan";

test("reconhece o padrão acervo/edicoes/IR NNN.pdf, com variações de caixa e zeros à esquerda", () => {
  assert.equal(parseEditionArchiveObjectKey("acervo/edicoes/IR 248.pdf"), 248);
  assert.equal(parseEditionArchiveObjectKey("acervo/edicoes/ir 0776.pdf"), 776);
  assert.equal(parseEditionArchiveObjectKey("acervo/edicoes/IR300.pdf"), 300);
});

test("rejeita nomes fora do padrão, sem adivinhar número de edição", () => {
  assert.equal(parseEditionArchiveObjectKey("acervo/edicoes/edicao-300.pdf"), null);
  assert.equal(parseEditionArchiveObjectKey("acervo/edicoes/IR.pdf"), null);
  assert.equal(parseEditionArchiveObjectKey("jornal-online/2026/edicao-0300/arquivo.pdf"), null);
});

test("extensão .PDF em maiúsculas ainda é reconhecida (padrão é case-insensitive)", () => {
  assert.equal(parseEditionArchiveObjectKey("acervo/edicoes/IR 300.PDF"), 300);
});

test("edição ausente do cadastro fica pendente de identificação — nunca inventa publication_date", () => {
  const report = buildEditionArchiveImportReport(
    [{ key: "acervo/edicoes/IR 500.pdf", size: 1_000_000 }],
    [],
  );
  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0]?.status, "edition_not_found_pending_identification");
});

test("duas chaves apontando para o mesmo número de edição são marcadas como duplicate_object", () => {
  const report = buildEditionArchiveImportReport(
    [
      { key: "acervo/edicoes/IR 300.pdf", size: 1 },
      { key: "acervo/edicoes/IR0300.pdf", size: 2 },
    ],
    [],
  );
  assert.ok(report.rows.every((row) => row.status === "duplicate_object"));
});

test("edição já vinculada ao mesmo objeto (chave+tamanho) é already_linked_matching; a outro objeto é already_linked_diverging", () => {
  const existing: ExistingEditionRow[] = [
    {
      editionNumber: 300,
      publicationDate: "2024-05-01",
      archiveProvider: "r2",
      pdfR2Key: "acervo/edicoes/IR 300.pdf",
      pdfFileSize: 1000,
      pdfSha256: "abc",
    },
    {
      editionNumber: 301,
      publicationDate: "2024-05-08",
      archiveProvider: "r2",
      pdfR2Key: "jornal-online/2024/edicao-0301/antigo.pdf",
      pdfFileSize: 999,
      pdfSha256: "def",
    },
  ];
  const report = buildEditionArchiveImportReport(
    [
      { key: "acervo/edicoes/IR 300.pdf", size: 1000 },
      { key: "acervo/edicoes/IR 301.pdf", size: 1234 },
    ],
    existing,
  );
  assert.equal(report.rows.find((r) => r.editionNumber === 300)?.status, "already_linked_matching");
  assert.equal(report.rows.find((r) => r.editionNumber === 301)?.status, "already_linked_diverging");
});

test("edição cadastrada sem vínculo R2 ainda fica ready_to_link", () => {
  const existing: ExistingEditionRow[] = [
    { editionNumber: 302, publicationDate: "2024-05-15", archiveProvider: null, pdfR2Key: null, pdfFileSize: null, pdfSha256: null },
  ];
  const report = buildEditionArchiveImportReport([{ key: "acervo/edicoes/IR 302.pdf", size: 10 }], existing);
  assert.equal(report.rows[0]?.status, "ready_to_link");
});

test("lacunas (gaps) são calculadas só dentro do intervalo observado de números reconhecidos", () => {
  const report = buildEditionArchiveImportReport(
    [
      { key: "acervo/edicoes/IR 248.pdf", size: 1 },
      { key: "acervo/edicoes/IR 250.pdf", size: 1 },
      { key: "acervo/edicoes/IR 252.pdf", size: 1 },
    ],
    [],
  );
  assert.deepEqual(report.gaps, [249, 251]);
  assert.equal(report.minEditionNumber, 248);
  assert.equal(report.maxEditionNumber, 252);
});

test("chave fora do padrão não altera gaps nem é contada como edição", () => {
  const report = buildEditionArchiveImportReport(
    [
      { key: "acervo/edicoes/IR 248.pdf", size: 1 },
      { key: "acervo/edicoes/leia-me.txt", size: 1 },
    ],
    [],
  );
  assert.equal(report.rows.find((r) => r.key.endsWith(".txt"))?.status, "unrecognized_key");
  assert.equal(report.gaps.length, 0);
});

test("CSV de saída inclui cabeçalho, linhas ordenadas por edição e as lacunas detectadas", () => {
  const report = buildEditionArchiveImportReport(
    [
      { key: "acervo/edicoes/IR 250.pdf", size: 1 },
      { key: "acervo/edicoes/IR 248.pdf", size: 1 },
    ],
    [],
  );
  const csv = editionArchiveImportReportToCsv(report);
  const lines = csv.split("\n");
  assert.equal(lines[0], "edition_number,key,size_bytes,status,note");
  assert.match(lines[1] ?? "", /^248,/);
  assert.match(lines[2] ?? "", /^250,/);
  assert.match(csv, /gap_missing_object/);
});
