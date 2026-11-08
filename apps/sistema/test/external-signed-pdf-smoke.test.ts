import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

import { prepareSignaturePdf, stampCompanySignature } from "../src/lib/signatures/companySignaturePdf";
import { buildSignedContractPdf } from "../src/lib/signatures/signedContractPdf";
import { clientFieldsForBase } from "../src/lib/signatures/externalSignaturePlacement";
import type { SignerSlot } from "../src/lib/signatures/signaturePlacement";

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const ISO = "2026-11-08T20:15:00.000Z";
const actors: SignerSlot[] = [
  { key: "contratada-1", role: "contratada", label: "Jornal Informativo Regional" },
  { key: "contratante-1", role: "contratante", label: "Contratante" },
];

test("PDF real: empresa primeiro, cliente depois, rubricas e QR; versões anteriores intactas", async () => {
  const source = await PDFDocument.create();
  source.addPage([595, 842]);
  source.addPage([595, 842]);
  const originalBytes = await source.save({ useObjectStreams: false });
  const originalHash = sha256(originalBytes);

  const prepared = await prepareSignaturePdf({
    originalBytes, signers: actors, documentTitle: "Contrato de teste sem efeito real",
  });
  assert.equal(prepared.mode, "automatic");
  assert.equal((await PDFDocument.load(prepared.bytes)).getPageCount(), 3);

  const companyVersion = await stampCompanySignature({
    baseBytes: prepared.bytes,
    fields: prepared.layout.fields.filter((field) => field.signerKey === "contratada-1"),
    hasPlaceholders: true,
    signerName: "Representante do Jornal IR",
    signerTitle: "Representante autorizado",
    signedAtIso: ISO,
    baseSha256: sha256(prepared.bytes),
  });
  const companyHash = sha256(companyVersion);
  assert.notEqual(companyHash, sha256(prepared.bytes));

  const appearance = clientFieldsForBase({
    final_sha256: companyHash,
    layout_mode: "automatic",
    layout_fields: prepared.layout.fields,
  }, companyHash);
  assert.ok(appearance);

  const jpg = await sharp({
    create: { width: 220, height: 80, channels: 3,
      background: { r: 245, g: 245, b: 245 } },
  }).jpeg({ quality: 90 }).toBuffer();

  const signed = await buildSignedContractPdf({
    originalBytes: companyVersion,
    signatureJpeg: jpg,
    documentName: "Contrato de teste",
    signerName: "Cliente de Teste",
    signerEmail: "teste@exemplo.com.br",
    signedAt: ISO,
    originalSha256: companyHash,
    invitationId: "1d63e217-18f8-49ee-a92d-9c27e489b113",
    consentVersion: "commercial-v1",
    sourceIsCumulative: true,
    externalAppearance: appearance,
    verificationUrl: "https://verificacao.example/verificar-contrato/codigo-de-teste",
    googleEvidence: {
      provider: "google",
      email: "teste@exemplo.com.br",
      subjectSha256: "a".repeat(64),
      verifiedAt: ISO,
    },
  });

  const final = await PDFDocument.load(signed);
  assert.equal(final.getPageCount(), 4, "2 páginas de conteúdo + folha de assinaturas + folha de aceite");
  assert.notEqual(sha256(signed), companyHash);
  assert.equal(sha256(companyVersion), companyHash, "PDF assinado pela empresa permanece imutável");
  assert.equal(sha256(originalBytes), originalHash, "PDF original permanece imutável");

  const finalBuffer = Buffer.from(signed);
  assert.ok(finalBuffer.subarray(0, 5).equals(Buffer.from("%PDF-")));
  assert.match(finalBuffer.toString("latin1"), /\/Subtype\s*\/Image/, "PDF deve ter JPEG de assinatura e PNG do QR");
});

test("PDF do cliente recusa URL de QR não HTTPS", async () => {
  const original = await PDFDocument.create();
  original.addPage([595, 842]);
  const bytes = await original.save();
  const jpg = await sharp({
    create: { width: 30, height: 20, channels: 3, background: { r: 255, g: 255, b: 255 } },
  }).jpeg().toBuffer();
  await assert.rejects(buildSignedContractPdf({
    originalBytes: bytes,
    signatureJpeg: jpg,
    documentName: "Teste",
    signerName: "Pessoa Teste",
    signerEmail: "teste@exemplo.com",
    signedAt: ISO,
    originalSha256: sha256(bytes),
    invitationId: "1d63e217-18f8-49ee-a92d-9c27e489b113",
    verificationUrl: "http://inseguro.invalid/contrato",
  }), /Endereço de verificação inválido/);
});
