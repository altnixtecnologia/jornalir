/**
 * Offline smoke test: no real user, invoice, email, or Supabase access.
 * Compile the server-only PDF generators to a tiny CommonJS module in
 * memory and assert that a signed PDF retains original pages + adds
 * a graphical signature page; check standalone receipt validity too.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const { PDFDocument } = require("pdf-lib");
const sharp = require("sharp");

function loadTypeScriptModule(fileName) {
  const filePath = path.resolve(__dirname, "../src/lib/signatures", fileName);
  const source = fs.readFileSync(filePath, "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filePath,
  }).outputText;
  const exports = {};
  const safeRequire = (name) => name === "server-only" ? {} : require(name);
  // The source is our local repository test fixture, not user content.
  new Function("require", "exports", js)(safeRequire, exports);
  return exports;
}

async function main() {
  const { buildSignedContractPdf } = loadTypeScriptModule("signedContractPdf.ts");
  const { buildSignatureReceiptPdf } = loadTypeScriptModule("signatureReceiptPdf.ts");

  const original = await PDFDocument.create();
  original.addPage([500, 720]);
  original.addPage([500, 720]);
  const originalBytes = Buffer.from(await original.save());
  const jpeg = await sharp({
    create: { width: 500, height: 200, channels: 3, background: "#ffffff" },
  }).jpeg().toBuffer();
  const base = {
    signerName: "Pessoa Exemplo", signerEmail: "assinatura@example.invalid",
    documentName: "Contrato de teste", contractNumber: "TESTE-001",
    signedAt: "2026-10-16T15:00:00.000Z", invitationId: "00000000-0000-4000-8000-000000000000",
    originalSha256: "b".repeat(64),
  };
  const signedBytes = await buildSignedContractPdf({
    ...base, originalBytes, signatureJpeg: jpeg,
  });
  const signedPdf = await PDFDocument.load(signedBytes);
  assert.equal(signedPdf.getPageCount(), 3, "2 original pages + 1 evidence sheet");
  assert.deepEqual([signedPdf.getPages()[0].getWidth(), signedPdf.getPages()[0].getHeight()], [500,720]);

  const receiptBytes = buildSignatureReceiptPdf({
    ...base, jpegBytes: jpeg, jpegWidth: 500, jpegHeight: 200,
  });
  const receipt = await PDFDocument.load(receiptBytes);
  assert.equal(receipt.getPageCount(), 1, "standalone signature receipt");
  const sourceAfter = await PDFDocument.load(originalBytes);
  assert.equal(sourceAfter.getPageCount(), 2, "original pages unchanged");

  // Item 5, Lote 2, Tarefa 1: múltiplos signatários — a segunda assinatura
  // da mesma rodada parte do PDF JÁ assinado do primeiro signatário (não
  // do original de novo, ver claimSignatureTurn em contractSignatures.ts),
  // então a evidência de ambos precisa coexistir no resultado final.
  const secondSignedBytes = await buildSignedContractPdf({
    ...base, originalBytes: signedBytes, signatureJpeg: jpeg,
    signerName: "Segunda Pessoa", signerEmail: "segunda@example.invalid",
    invitationId: "00000000-0000-4000-8000-000000000001",
  });
  const secondSignedPdf = await PDFDocument.load(secondSignedBytes);
  assert.equal(secondSignedPdf.getPageCount(), 4, "2 original + evidencia do 1o + evidencia do 2o signatario");
  const firstSignedUnchanged = await PDFDocument.load(signedBytes);
  assert.equal(firstSignedUnchanged.getPageCount(), 3, "PDF do primeiro signatario nao e alterado pelo segundo");

  console.log("PDF smoke OK: original 2 pages, consolidated 3 pages, receipt 1 page, 2-signer chain 4 pages");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
