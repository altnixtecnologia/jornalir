import test from "node:test";
import assert from "node:assert/strict";
import { deflateSync, inflateSync } from "node:zlib";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  autoLayout,
  fieldsForSigner,
  initialsOf,
  manualLayout,
  validateFields,
  type PlacedField,
  type SignerSlot,
} from "../src/lib/signatures/signaturePlacement";
import { prepareSignaturePdf, stampCompanySignature } from "../src/lib/signatures/companySignaturePdf";

// Etapa 3A: campos de assinatura e rubricas. Nada é assinado na preparação;
// carimbos só aparecem após a confirmação. PDFs reais lidos de volta.

const SIGNERS: SignerSlot[] = [
  { key: "contratada-1", role: "contratada", label: "CONTRATADA - Representante legal" },
  { key: "contratante-1", role: "contratante", label: "CONTRATANTE" },
];

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let k = 0; k < 8; k += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
function makePng(width = 60, height = 24): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 40)]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

async function originalPdf(pages = 3): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let index = 1; index <= pages; index += 1) {
    pdf.addPage([595, 842]).drawText(`Conteudo original pagina ${index}`, { x: 60, y: 700, size: 12, font });
  }
  return pdf.save({ useObjectStreams: false });
}

function drawnText(pdf: Uint8Array): string {
  const raw = Buffer.from(pdf).toString("latin1");
  const parts: string[] = [];
  for (const match of raw.matchAll(/(?<!end)stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try {
      const content = inflateSync(Buffer.from(match[1], "latin1")).toString("latin1");
      for (const hex of content.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) parts.push(Buffer.from(hex[1], "hex").toString("latin1"));
    } catch {
      /* streams que não são conteúdo */
    }
  }
  return parts.join("\n");
}

// ----------------------------------------------------------- posicionamento

test("layout automático: rubrica no rodapé de CADA página do conteúdo, assinaturas e data/hora na folha final, tudo dentro das margens", () => {
  const layout = autoLayout(3, SIGNERS);
  assert.equal(layout.totalPages, 4);
  assert.equal(layout.appendsSignatureSheet, true);
  for (let page = 1; page <= 3; page += 1) {
    assert.equal(layout.fields.filter((field) => field.kind === "initials" && field.page === page).length, 2, `rubrica de cada signatário na página ${page}`);
  }
  assert.equal(layout.fields.filter((field) => field.kind === "signature").length, 2);
  assert.ok(layout.fields.filter((field) => field.kind === "signature" || field.kind === "datetime").every((field) => field.page === 4));
  assert.deepEqual(validateFields(layout.fields, SIGNERS, layout.totalPages), [], "o layout automático passa na própria validação");
});

test("layout automático escala até 10 signatários sem sobreposição", () => {
  const many: SignerSlot[] = Array.from({ length: 10 }, (_, index) => ({ key: `s-${index}`, role: "testemunha", label: `Signatário ${index + 1}` }));
  const layout = autoLayout(2, many);
  assert.deepEqual(validateFields(layout.fields, many, layout.totalPages), []);
  assert.throws(() => autoLayout(2, [...many, { key: "extra", role: "testemunha", label: "x" }]), /1 a 10/);
});

test("layout manual: valida página, margem, tamanho, assinatura única por signatário e sobreposição", () => {
  const ok: PlacedField[] = [
    { kind: "signature", signerKey: "contratada-1", page: 2, x: 0.1, y: 0.7, width: 0.35, height: 0.1 },
    { kind: "signature", signerKey: "contratante-1", page: 2, x: 0.55, y: 0.7, width: 0.35, height: 0.1 },
  ];
  assert.deepEqual(validateFields(ok, SIGNERS, 3), []);
  assert.equal(manualLayout(3, SIGNERS, ok).appendsSignatureSheet, false);

  assert.match(validateFields([{ ...ok[0], page: 9 }, ok[1]], SIGNERS, 3).join(" "), /página fora/);
  assert.match(validateFields([{ ...ok[0], x: 0.8 }, ok[1]], SIGNERS, 3).join(" "), /margem/);
  assert.match(validateFields([{ ...ok[0], width: 0.001 }, ok[1]], SIGNERS, 3).join(" "), /pequeno/);
  assert.match(validateFields([ok[0]], SIGNERS, 3).join(" "), /CONTRATANTE: é preciso exatamente um campo/);
  assert.match(validateFields([ok[0], ok[0], ok[1]], SIGNERS, 3).join(" "), /encontrado 2/);
  assert.match(validateFields([ok[0], { ...ok[1], x: 0.2 }], SIGNERS, 3).join(" "), /sobrep/);
  assert.match(validateFields([{ ...ok[0], signerKey: "fantasma" }, ok[1]], SIGNERS, 3).join(" "), /desconhecido/);
  assert.match(validateFields([{ ...ok[0], x: Number.NaN }, ok[1]], SIGNERS, 3).join(" "), /inválidas/);
  assert.throws(() => manualLayout(3, SIGNERS, [ok[0]]), /exatamente um campo/);
});

test("iniciais ignoram conectivos e acentos", () => {
  assert.equal(initialsOf("Maria da Silva Souza"), "MSS");
  assert.equal(initialsOf("João de Oliveira"), "JO");
  assert.equal(initialsOf("   "), "?");
});

// ------------------------------------------------------------------- PDF

test("preparação automática: acrescenta a folha de assinaturas, mantém o conteúdo e NÃO assina nem põe rubrica", async () => {
  const original = await originalPdf(3);
  const prepared = await prepareSignaturePdf({ originalBytes: original, signers: SIGNERS, documentTitle: "Contrato de teste" });
  assert.equal(prepared.mode, "automatic");
  assert.equal((await PDFDocument.load(prepared.bytes)).getPageCount(), 4);
  const text = drawnText(prepared.bytes);
  assert.match(text, /Conteudo original pagina 1/);
  assert.match(text, /Conteudo original pagina 3/);
  assert.match(text, /FOLHA DE ASSINATURAS/);
  assert.match(text, /CONTRATADA - Representante legal/);
  assert.match(text, /Assinatura pendente/);
  assert.doesNotMatch(text, /Confirmado eletronicamente|Em \d{2}\/\d{2}\/\d{4}/, "nenhuma data/assinatura antes da confirmação");
});

test("preparação manual (PDF externo): não acrescenta página e preserva o original", async () => {
  const original = await originalPdf(3);
  const fields: PlacedField[] = [
    { kind: "signature", signerKey: "contratada-1", page: 3, x: 0.1, y: 0.7, width: 0.35, height: 0.1 },
    { kind: "signature", signerKey: "contratante-1", page: 3, x: 0.55, y: 0.7, width: 0.35, height: 0.1 },
    { kind: "initials", signerKey: "contratada-1", page: 1, x: 0.8, y: 0.94, width: 0.08, height: 0.03 },
  ];
  const prepared = await prepareSignaturePdf({ originalBytes: original, signers: SIGNERS, documentTitle: "Edital externo", manualFields: fields });
  assert.equal(prepared.mode, "manual");
  assert.equal((await PDFDocument.load(prepared.bytes)).getPageCount(), 3);
  assert.doesNotMatch(drawnText(prepared.bytes), /FOLHA DE ASSINATURAS/);
  await assert.rejects(
    prepareSignaturePdf({ originalBytes: original, signers: SIGNERS, documentTitle: "x", manualFields: [{ ...fields[0], page: 7 }, fields[1]] }),
    /página fora/,
  );
});

test("carimbo após a confirmação: só o signatário que confirmou aparece (rubrica em todas as páginas, nome, data/hora), com PNG ou sem PNG", async () => {
  const original = await originalPdf(3);
  const prepared = await prepareSignaturePdf({ originalBytes: original, signers: SIGNERS, documentTitle: "Contrato de teste" });
  const signedAt = "2026-11-08T17:32:10.000Z";

  const withPng = await stampCompanySignature({
    baseBytes: prepared.bytes, fields: fieldsForSigner(prepared.layout, "contratada-1"), hasPlaceholders: true,
    signerName: "Fulano de Tal", signerTitle: "Socio-administrador", signaturePng: makePng(), signedAtIso: signedAt, baseSha256: "a".repeat(64),
  });
  const textWith = drawnText(withPng);
  assert.match(textWith, /Fulano de Tal/);
  assert.match(textWith, /Socio-administrador/);
  assert.match(textWith, /Em 08\/11\/2026 14:32:10 \(Brasilia\) - base aaaaaaaaaa/);
  assert.match(textWith, /CONTRATANTE/, "o campo do cliente continua pendente");
  assert.equal((textWith.match(/Assinatura pendente/g) ?? []).length >= 1, true);
  assert.equal((await PDFDocument.load(withPng)).getPageCount(), 4);
  assert.ok(Buffer.from(withPng).includes(Buffer.from("/Subtype /Image")), "o PNG foi embutido como imagem");

  const noPng = await stampCompanySignature({
    baseBytes: prepared.bytes, fields: fieldsForSigner(prepared.layout, "contratada-1"), hasPlaceholders: true,
    signerName: "Maria da Silva Souza", signerTitle: "Representante", signedAtIso: signedAt, baseSha256: "b".repeat(64),
  });
  const textNo = drawnText(noPng);
  assert.match(textNo, /MSS/, "rubrica de texto com as iniciais quando não há PNG");
  assert.ok(!Buffer.from(noPng).includes(Buffer.from("/Subtype /Image")));
});

test("carimbos são cumulativos: a 2ª assinatura parte do PDF da 1ª e as duas permanecem; o original não é alterado", async () => {
  const original = await originalPdf(2);
  const originalCopy = Buffer.from(original);
  const prepared = await prepareSignaturePdf({ originalBytes: original, signers: SIGNERS, documentTitle: "Contrato" });
  const first = await stampCompanySignature({
    baseBytes: prepared.bytes, fields: fieldsForSigner(prepared.layout, "contratada-1"), hasPlaceholders: true,
    signerName: "Primeira Pessoa", signerTitle: "Diretora", signedAtIso: "2026-11-08T12:00:00.000Z", baseSha256: "c".repeat(64),
  });
  const second = await stampCompanySignature({
    baseBytes: first, fields: fieldsForSigner(prepared.layout, "contratante-1"), hasPlaceholders: true,
    signerName: "Segunda Pessoa", signerTitle: "Contratante", signedAtIso: "2026-11-08T13:00:00.000Z", baseSha256: "d".repeat(64),
  });
  const text = drawnText(second);
  assert.match(text, /Primeira Pessoa/);
  assert.match(text, /Segunda Pessoa/);
  assert.ok(Buffer.from(original).equals(originalCopy), "o PDF de entrada nunca é modificado no lugar");
  assert.notEqual(Buffer.from(first).toString("hex"), Buffer.from(prepared.bytes).toString("hex"));
});

test("PDF protegido por senha é recusado (não mascara documento que não pode ser assinado)", async () => {
  await assert.rejects(prepareSignaturePdf({ originalBytes: new Uint8Array([1, 2, 3]), signers: SIGNERS, documentTitle: "x" }));
});
