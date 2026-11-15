import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { loadPdfDocument, extractPageTextItems } from "@ir/pdf-extraction";
import { DANFSE_GEOMETRY, buildDanfsePdf, formatDanfseDate, formatDanfseDateTime, formatFederalInscription, wrapDanfseText, selectDanfseTaxDescription } from "../src/lib/nfse/danfsePdf";
import { DANFSE_PREVIEW_FIXTURE } from "../src/lib/nfse/danfsePreviewFixture";
import { NFSE_OFFICIAL_LOGO_PNG_BASE64 } from "../src/lib/nfse/nfseNationalLogo";
import {
  DANFSE_OFFICIAL_LAYOUT_APPROVED,
  assertDanfseLayoutApproved,
  DanfseOfficialLayoutNotApprovedError,
} from "../src/lib/nfse/danfseReleaseGate";

const src = (path: string) =>
  readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

test("DANFSe de producao nao pode ser liberado com env nem por engano", () => {
  assert.equal(DANFSE_OFFICIAL_LAYOUT_APPROVED, false);
  for (const envValue of [undefined, "true", "false"]) {
    const prev = process.env.DANFSE_OFFICIAL_LAYOUT_APPROVED;
    if (envValue === undefined) delete process.env.DANFSE_OFFICIAL_LAYOUT_APPROVED;
    else process.env.DANFSE_OFFICIAL_LAYOUT_APPROVED = envValue;
    try {
      assert.throws(
        () => assertDanfseLayoutApproved(false),
        DanfseOfficialLayoutNotApprovedError,
      );
    } finally {
      if (prev === undefined) delete process.env.DANFSE_OFFICIAL_LAYOUT_APPROVED;
      else process.env.DANFSE_OFFICIAL_LAYOUT_APPROVED = prev;
    }
  }
});

test("prototipo de teste permanece disponivel apenas para homologacao visual", () => {
  assert.doesNotThrow(() => assertDanfseLayoutApproved(true));
});

test("gerador bloqueia antes de criar o PDF e rota verifica inclusive PDF arquivado", () => {
  const pdf = src("lib/nfse/danfsePdf.ts");
  const route = src("app/sistema/nfse/notas/[id]/danfse/route.ts");
  assert.match(pdf, /assertDanfseLayoutApproved\(data\.isHomologation\)/);
  assert.ok(
    pdf.indexOf("assertDanfseLayoutApproved(data.isHomologation)") <
      pdf.indexOf("PDFDocument.create()"),
    "nao criar PDF antes da verificacao de conformidade",
  );
  assert.match(route, /assertDanfseLayoutApproved\(note\.environment === "homologation"\)/);
  assert.match(route, /DanfseOfficialLayoutNotApprovedError/);
  assert.ok(
    route.indexOf("assertDanfseLayoutApproved(note.environment") <
      route.indexOf("readNfseDocument(original.r2_key"),
    "a rota nao pode servir PDF arquivado antes do gate",
  );
});

test("DANFSe: competencia nao pode mudar de dia por timezone do servidor", () => {
  assert.equal(formatDanfseDate("2026-10-01"), "01/10/2026");
  assert.equal(formatDanfseDate("2026-02-30"), "-");
  assert.equal(formatDanfseDate("2026-02-29"), "-");
  assert.equal(formatDanfseDate("2024-02-29"), "29/02/2024");
  assert.equal(formatDanfseDate(""), "-");
});

test("DANFSe: emissão segue horario de SC, inclusive Vercel UTC", () => {
  assert.equal(formatDanfseDateTime("2026-10-25T15:30:45Z"), "25/10/2026 12:30:45");
  assert.equal(formatDanfseDateTime("2026-10-25T12:30:45-03:00"), "25/10/2026 12:30:45");
  assert.equal(formatDanfseDateTime("2026-10-26T01:30:45Z"), "25/10/2026 22:30:45");
  assert.equal(formatDanfseDateTime("not-a-date"), "-");
});

test("DANFSe de homologacao inclui blocos fiscais nacionais sem liberar documento oficial", () => {
  const pdf = src("lib/nfse/danfsePdf.ts");
  const xml = readFileSync(new URL("../../../packages/core/src/nfse/danfse-data.ts", import.meta.url), "utf8");
  for (const section of ["Tributação Federal (Exceto CBS)", "Tributação IBS / CBS", "Informações Complementares"]) {
    assert.ok(pdf.includes(section), section);
  }
  for (const field of ["federalIrrf", "federalSocialSecurityRetained", "federalSocialContribRetained", "ibsCbsBase", "ibsCbsTotal", "grossTotalWithIbsCbs", "complementaryInformation", "discountConditional"]) {
    assert.ok(pdf.includes("data." + field), "PDF não lê " + field);
    assert.ok(xml.includes(field + ":"), "campo " + field + " não é extraído do XML");
  }
  assert.match(pdf, /DANFSe de homologação excede a área útil A4/);
  assert.match(pdf, /assertDanfseLayoutApproved\(data\.isHomologation\)/);
  assert.equal(DANFSE_OFFICIAL_LAYOUT_APPROVED, false);
});

test("DANFSe não perde descrição longa nem completa com reticências", async () => {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const full = "Veiculação de anúncio publicitário com descrição extensa para conservar integralmente as condições do serviço contratado e impedir que o texto seja cortado no documento fiscal.";
  const lines = wrapDanfseText(full, regular, 7, 550);
  assert.ok(lines.length > 1, "a descrição precisa ocupar mais de uma linha");
  assert.equal(lines.join(" "), full);
  for (const line of lines) {
    assert.ok(regular.widthOfTextAtSize(line, 7) <= 550);
  }
});

test("DANFSe quebra palavras muito longas sem apagar caracteres", async () => {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const token = "IDENTIFICACAO".repeat(55);
  const lines = wrapDanfseText(token, regular, 7, 160);
  assert.ok(lines.length > 1);
  assert.equal(lines.join(""), token);
  for (const line of lines) assert.ok(regular.widthOfTextAtSize(line, 7) <= 160);
});

test("campos fiscais relevantes usam quebra de linha e ajuste vertical, nunca o fit com reticências", () => {
  const source = src("lib/nfse/danfsePdf.ts");
  for (const field of ["Descrição do Serviço", "Dados complementares da NFS-e", "Nome / Nome Empresarial"]) {
    assert.ok(source.includes("drawWrappedField(page, bold, regular, \"" + field + "\""));
  }
  assert.match(source, /DANFSe de homologação excede a área útil A4/);
});

test("DANFSe: borda externa em todas as laterais deve ficar entre 0,15 e 0,20cm (NT 008 §2.2.2)", () => {
  const { outerBorderMarginCm, innerPaddingPt, qrXcm, qrYcm } = DANFSE_GEOMETRY;
  assert.ok(outerBorderMarginCm >= 0.15 && outerBorderMarginCm <= 0.20);
  const ptPerCm = 72 / 2.54;
  const contentInsetPt = outerBorderMarginCm * ptPerCm + innerPaddingPt;
  assert.ok(contentInsetPt > outerBorderMarginCm * ptPerCm);
  assert.equal(qrXcm, 17.48);
  assert.equal(qrYcm, 1.67);
  assert.ok(qrXcm + 70 / ptPerCm < 21 - outerBorderMarginCm, "QR deve ficar dentro da borda A4");
  const source = src("lib/nfse/danfsePdf.ts");
  assert.match(source, /const qrY = PAGE_HEIGHT - DANFSE_GEOMETRY\.qrYcm \* CM_TO_PT - qrSize/);
  assert.match(source, /x: MARGIN - 4, y: MARGIN - 4/);
});

test("DANFSe: CNPJ alfanumérico nunca vira CPF pela remoção de letras", () => {
  const alphanumeric = "A123456789B0C1"; // 14 caracteres, dos quais 11 dígitos
  assert.equal(alphanumeric.length, 14);
  assert.equal(alphanumeric.replace(/\D/g, "").length, 11);
  assert.equal(formatFederalInscription(alphanumeric), alphanumeric);
  assert.equal(formatFederalInscription("23970969000190"), "23.970.969/0001-90");
  assert.equal(formatFederalInscription("11144477735"), "111.444.777-35");
  assert.equal(formatFederalInscription("AB12CD34567890"), "AB12CD34567890");
});

test("DANFSe: rótulos seguem 6pt em caixa de título e identificação 7pt em maiúsculas", () => {
  const code = src("lib/nfse/danfsePdf.ts");
  assert.match(code, /const labelSize = identification \? 7 : 6/);
  assert.match(code, /const printedLabel = identification \? label\.toUpperCase\(\) : label/);
  assert.match(code, /"Número da NFS-e".*false, true\)/);
  assert.match(code, /"Emitente da NFS-e".*true, true\)/);
  assert.match(code, /"Valor Líquido da NFS-e \+ IBS\/CBS"/);
  assert.ok(!code.includes('"Valor Líquido da NFS-e", formatMoney(data.netValue), MARGIN + third * 2, cursor.y, third, true)'));
});

test("DANFSe: não afirma igualdade destinatário/tomador sem indDest do XML", () => {
  const code = src("lib/nfse/danfsePdf.ts");
  assert.match(code, /data\.destinatarioEhTomador\s*\?/);
  assert.match(code, /"DESTINATÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e"/);
  assert.match(code, /if \(data\.destinatario\)/);
  assert.match(code, /if \(data\.intermediario\)/);
});

test("prévia sintética é um PDF A4 de página única e nunca uma nota autorizada", async () => {
  assert.equal(DANFSE_PREVIEW_FIXTURE.isHomologation, true);
  assert.equal(DANFSE_PREVIEW_FIXTURE.accessKey, "1".repeat(50));
  assert.match(DANFSE_PREVIEW_FIXTURE.prestador.name, /FICTÍCIO/i);
  const pdf = await PDFDocument.load(await buildDanfsePdf(DANFSE_PREVIEW_FIXTURE));
  assert.equal(pdf.getPageCount(), 1);
  const { width, height } = pdf.getPage(0).getSize();
  assert.equal(width, 595);
  assert.equal(height, 842);
});

test("rota da prévia é administrativa, não usa nota/banco/SEFIN nem afrouxa bloqueios oficiais", () => {
  const route = src("app/sistema/nfse/previa-danfse/route.ts");
  const overview = src("app/sistema/nfse/page.tsx");
  assert.match(route, /checkModuleAction\("nfse", "configuracoes_gerenciar"\)/);
  assert.match(route, /buildDanfsePdf\(DANFSE_PREVIEW_FIXTURE\)/);
  assert.match(route, /\.select\("active,role"\)/);
  assert.match(route, /!profile\?\.active/);
  assert.match(route, /profile\.role !== "owner" && profile\.role !== "admin"/);
  assert.match(route, /"Cache-Control": "private, no-store/);
  for (const prohibited of ["createSupabaseAdminClient", "createIssuedNoteRepositorySupabase", "getTransmissionService", "getCertificateService", "readNfseDocument", "sendEmail", "transmitDps"]) {
    assert.ok(!route.includes(prohibited), "prévia não pode acessar: " + prohibited);
  }
  assert.match(overview, /href="\/sistema\/nfse\/previa-danfse"/);
  assert.equal(DANFSE_OFFICIAL_LAYOUT_APPROVED, false);
});


test("NT008 Anexo I: descrição de tributação municipal prevalece sobre a nacional e é impressa sem rótulo", async () => {
  assert.equal(selectDanfseTaxDescription({
    municipalServiceDescription: "  Descrição municipal  ",
    nationalServiceDescription: "Descrição nacional",
  }), "Descrição municipal");
  assert.equal(selectDanfseTaxDescription({ nationalServiceDescription: "Descrição nacional" }), "Descrição nacional");
  assert.equal(selectDanfseTaxDescription({ nationalServiceDescription: " ", municipalServiceDescription: " " }), "-");

  const pdfBytes = await buildDanfsePdf({
    ...DANFSE_PREVIEW_FIXTURE,
    municipalServiceDescription: "Descrição municipal exata da lista local",
    nationalServiceDescription: "Descrição nacional que não deve ser impressa",
  });
  const pdf = await loadPdfDocument(pdfBytes);
  assert.equal(pdf.numPages, 1, "DANFSe deve continuar A4 em página única");
  const items = await extractPageTextItems(await pdf.getPage(1));
  const textContent = items.map((item) => item.text).join(" ");
  assert.ok(textContent.includes("Descrição municipal exata da lista local"));
  assert.ok(!textContent.includes("Descrição nacional que não deve ser impressa"));
  assert.ok(!textContent.includes("Descrição da tributação municipal"));
  assert.ok(!textContent.includes("Descrição da tributação nacional"));
  assert.ok(textContent.includes("Código da NBS"));
  assert.ok(textContent.includes("Descrição do Serviço"));
});

test("NT008 Anexo I: sem xTribMun a descrição nacional aparece no bloco de serviço", async () => {
  const pdfBytes = await buildDanfsePdf({
    ...DANFSE_PREVIEW_FIXTURE,
    municipalServiceDescription: undefined,
    nationalServiceDescription: "Descrição nacional usada como alternativa",
  });
  const pdf = await loadPdfDocument(pdfBytes);
  const items = await extractPageTextItems(await pdf.getPage(1));
  assert.ok(items.map((item) => item.text).join(" ").includes("Descrição nacional usada como alternativa"));
});


test("NT008: logomarca nacional PNG esta embutida no DANFSe de teste sem dependencia externa", async () => {
  const logo = Buffer.from(NFSE_OFFICIAL_LOGO_PNG_BASE64, "base64");
  assert.equal(logo.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(logo.readUInt32BE(16), 540);
  assert.equal(logo.readUInt32BE(20), 107);
  const source = src("lib/nfse/danfsePdf.ts");
  assert.match(source, /pdf\.embedPng\(Buffer\.from\(NFSE_OFFICIAL_LOGO_PNG_BASE64, "base64"\)\)/);
  assert.match(source, /officialLogoWidth = 4\.00 \* CM_TO_PT/);
  assert.ok(!source.includes('drawBlockTitle(page, bold, "Dados de Identificação da NFS-e"'), "faixa nao pode ocultar QR");
  assert.match(source, /"CHAVE DE ACESSO DA NFS-e"/);
  assert.match(source, /officialLogoHeight = 0\.85 \* CM_TO_PT/);
  assert.match(source, /x: 0\.49 \* CM_TO_PT/);
  assert.match(source, /PAGE_HEIGHT - 0\.44 \* CM_TO_PT - officialLogoHeight/);
  assert.ok(!source.includes("logo do jornal"), "o DANFSe nao deve conter marca de prestador no cabecalho");
  const pdf = await PDFDocument.load(await buildDanfsePdf(DANFSE_PREVIEW_FIXTURE));
  assert.equal(pdf.getPageCount(), 1);
  const bytes = await pdf.save();
  assert.ok(bytes.length > logo.length, "PDF deve incorporar a imagem alem dos campos fiscais");
  assert.equal(DANFSE_OFFICIAL_LAYOUT_APPROVED, false);
});

test("NT008: ambiente gerador vem do XML, sem constante inventada", () => {
  const source = readFileSync(new URL("../../../packages/core/src/nfse/danfse-data.ts", import.meta.url), "utf8");
  assert.match(source, /environmentGenerator: directText\(infNFSe, "ambGer"\)/);
  assert.match(src("lib/nfse/danfsePdf.ts"), /dash\(data\.environmentGenerator\)/);
  assert.equal(DANFSE_PREVIEW_FIXTURE.environmentGenerator, undefined);
});

test("DANFSe ficticio suporta nomes, enderecos, descricao e complemento extensos sem cortar conteudo", async () => {
  const fixture = {
    ...DANFSE_PREVIEW_FIXTURE,
    prestador: {
      ...DANFSE_PREVIEW_FIXTURE.prestador,
      name: "PRESTADOR FICTICIO COM RAZAO SOCIAL ESTENDIDA PARA TESTAR A QUEBRA AUTOMATICA",
      address: "Rua de Teste com Nome Comprido, numero 100, sala 205, complemento administrativo, bairro de testes, SC",
    },
    tomador: {
      ...DANFSE_PREVIEW_FIXTURE.tomador!,
      name: "TOMADOR FICTICIO COM NOME EXTENSO E CAMPOS DE IDENTIFICACAO PARA INSPECAO",
      address: "Avenida Ficticia de Teste, numero 123, bloco 04, sala 102, complemento e bairro extenso",
    },
    serviceDescription: "Veiculacao de campanha institucional ficticia em jornal impresso com especificacoes de formato, periodo de veiculacao, referencia contratual e outras condicoes. ".repeat(3) + "FIM_DESCRICAO_VISIVEL",
    complementaryInformation: "PEDIDO FICTICIO 001, REFERENCIA ADMINISTRATIVA E OBSERVACOES DE PAGAMENTO. ".repeat(2) + "FIM_COMPLEMENTO_VISIVEL",
  };
  const bytes = await buildDanfsePdf(fixture);
  const pdf = await loadPdfDocument(bytes);
  assert.equal(pdf.numPages, 1);
  const items = await extractPageTextItems(await pdf.getPage(1));
  const visible = items.map((item) => item.text).join(" ");
  assert.ok(visible.includes("FIM_DESCRICAO_VISIVEL"), "nao pode apagar o final da descricao");
  assert.ok(visible.includes("FIM_COMPLEMENTO_VISIVEL"), "nao pode apagar o final das observacoes");
});

test("DANFSe ficticio falha fechado caso o conteudo nao caiba em uma pagina A4", async () => {
  const fixture = {
    ...DANFSE_PREVIEW_FIXTURE,
    serviceDescription: "SERVICO_FICTICIO_COM_LONGA_DESCRICAO ".repeat(1800),
  };
  await assert.rejects(() => buildDanfsePdf(fixture), /excede a area util A4|excede a área útil A4/);
});
