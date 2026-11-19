import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const editor = readFileSync(new URL("../src/features/editorial/EdicoesManager.tsx", import.meta.url), "utf8");
const actions = readFileSync(new URL("../src/app/sistema/editorial/edicoes/actions.ts", import.meta.url), "utf8");
const repo = readFileSync(new URL("../src/providers/supabase/newspaperEditionRepository.supabase.ts", import.meta.url), "utf8");
const backfill = readFileSync(new URL("../scripts/backfill-editions-archive-metadata.ts", import.meta.url), "utf8");

test("upload atual já calcula SHA-256 dos bytes reais, páginas e capa", () => {
  assert.match(editor, /crypto\.subtle\.digest\("SHA-256", bytes\)/);
  assert.match(editor, /getDocument\(\{ data: new Uint8Array\(bytes\) \}\)/);
  assert.match(editor, /return \{ sha256, pageCount: pdf\.numPages, cover \}/);
  assert.match(editor, /sha256: prepared\.sha256/);
  assert.match(editor, /pageCount: prepared\.pageCount/);
});

test("servidor valida metadados e persiste no mesmo registro, sem segundo upload", () => {
  assert.match(actions, /validateEditionPdfObject\(input\.pdfKey, input\.fileSize\)/);
  assert.match(actions, /validateEditionCoverObject\(input\.coverKey\)/);
  assert.match(actions, /sha256: input\.sha256\.toLowerCase\(\)/);
  assert.match(actions, /pageCount: input\.pageCount/);
  assert.match(repo, /pdf_sha256: archive\.sha256/);
  assert.match(repo, /page_count: archive\.pageCount \?\? null/);
});

test("backfill aprovado só lê edições de 2025 e 2026 e só preenche campos vazios", () => {
  assert.match(backfill, /const START_DATE = "2025-01-01"/);
  assert.match(backfill, /const END_DATE_EXCLUSIVE = "2027-01-01"/);
  assert.match(backfill, /\.gte\("publication_date", START_DATE\)/);
  assert.match(backfill, /\.lt\("publication_date", END_DATE_EXCLUSIVE\)/);
  assert.match(backfill, /\.or\("pdf_sha256\.is\.null,page_count\.is\.null"\)/);
  assert.match(backfill, /const apply = process\.argv\.includes\("--apply"\)/);
  assert.match(backfill, /const MAX_PER_RUN = 25/);
  assert.match(backfill, /\.eq\("pdf_r2_key", row\.pdf_r2_key as string\)/);
  assert.match(backfill, /q = q\.is\("pdf_sha256", null\)/);
  assert.match(backfill, /q = q\.is\("page_count", null\)/);
});
