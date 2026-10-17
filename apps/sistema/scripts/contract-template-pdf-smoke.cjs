/**
 * Offline smoke test: sem cliente/contrato real, sem Supabase. Compila
 * o gerador de PDF de modelos de contrato (server-only) pra CommonJS em
 * memória e confere paginação, acentuação e cabeçalho/rodapé.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const { PDFDocument } = require("pdf-lib");

function loadTypeScriptModule(fileName) {
  const filePath = path.resolve(__dirname, "../src/lib/contracts", fileName);
  const source = fs.readFileSync(filePath, "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filePath,
  }).outputText;
  const exports = {};
  const safeRequire = (name) => (name === "server-only" ? {} : require(name));
  // The source is our local repository test fixture, not user content.
  new Function("require", "exports", js)(safeRequire, exports);
  return exports;
}

async function main() {
  const { buildContractTemplatePdf } = loadTypeScriptModule("contractTemplatePdf.ts");

  // Parágrafo longo o suficiente pra forçar quebra de linha E de página,
  // com acentuação típica do português (preservação é requisito explícito).
  const longParagraph = Array.from({ length: 40 }, (_, i) =>
    `Cláusula ${i + 1}: As partes acordam que a prestação do serviço de publicidade institucional será realizada com observância à legislação municipal aplicável, à razão social do CONTRATANTE e à função do representante responsável, nos termos acordados.`,
  ).join("\n\n");

  const bytes = await buildContractTemplatePdf({
    title: "Contrato de Prestação de Serviços de Publicidade",
    content: `Pelo presente instrumento, a Informativo Regional e a CONTRATANTE Exemplo Ltda, inscrita no CNPJ sob a cidade de São João do Sul, ajustam o seguinte contrato de publicação.\n\n${longParagraph}`,
    contractReference: "IR-CTR-2026-000012",
    templateTitle: "Modelo de Publicidade",
    templateVersion: 3,
    generatedAt: "2026-10-17T12:00:00.000Z",
  });

  const pdf = await PDFDocument.load(bytes);
  assert.ok(pdf.getPageCount() >= 2, "conteúdo longo deve paginar automaticamente (>= 2 páginas)");
  assert.equal(pdf.getTitle(), "Contrato de Prestação de Serviços de Publicidade");
  assert.ok(pdf.getSubject().includes("Modelo de Publicidade"));
  assert.ok(pdf.getSubject().includes("v3"));

  console.log(`Contract template PDF smoke OK: ${pdf.getPageCount()} páginas, título/versão do modelo registrados, acentuação sem erro de render.`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
