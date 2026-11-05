import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = readFileSync(resolve(__dirname, "../scripts/import-editions-archive-dry-run.ts"), "utf8");

test("o script de importação do acervo não grava nada no Supabase nem no R2 — nenhuma chamada de escrita presente no código-fonte", () => {
  assert.doesNotMatch(SCRIPT, /^import.*attachEditionR2Archive|^import.*attachEditionPdf|^import.*attachEditionExternalPdf/m);
  assert.doesNotMatch(SCRIPT, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  assert.doesNotMatch(SCRIPT, /PutObjectCommand|DeleteObjectCommand|uploadEditionPdfToR2|uploadEditionCoverToR2/);
});

test("o script só usa leitura: select em newspaper_editions e listagem de objetos R2", () => {
  assert.match(SCRIPT, /\.select\(/);
  assert.match(SCRIPT, /listEditionArchiveObjects/);
});

test("o script confere a configuração do R2 de edições e a chave de serviço antes de qualquer leitura, sem expor valores de credenciais", () => {
  assert.match(SCRIPT, /isEditionR2ReadConfigured\(\)/);
  assert.match(SCRIPT, /hasServiceRoleKey\(\)/);
  assert.doesNotMatch(SCRIPT, /console\.(log|error)\([^)]*process\.env\[/);
});

test("o relatório gerado é sempre o CSV da função pura, nunca dado inventado no próprio script", () => {
  assert.match(SCRIPT, /editionArchiveImportReportToCsv\(report\)/);
  assert.match(SCRIPT, /buildEditionArchiveImportReport\(/);
});
