import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { loadPdfDocument, extractPageTextItems } from "@ir/pdf-extraction";
import { DANFSE_GEOMETRY, buildDanfsePdf, formatDanfseDate, formatDanfseDateTime, formatFederalInscription, wrapDanfseText, selectDanfseTaxDescription, formatDanfseTotalIbsCbs, danfseFederalValues, danfseIssqnTypeLabel, danfseRegimeEspecialLabel, danfseIssqnRetentionLabel, danfseSimplesNacionalLabel, danfseApuracaoSimplesLabel, danfseMunicipalBenefitLabel, buildDanfseComplementary } from "../src/lib/nfse/danfsePdf";
import { DANFSE_PREVIEW_FIXTURE } from "../src/lib/nfse/danfsePreviewFixture";
import { NFSE_OFFICIAL_LOGO_PNG_BASE64 } from "../src/lib/nfse/nfseNationalLogo";
import { loadLicensedDanfseFonts, verifyDanfseFontFile } from "../src/lib/nfse/danfseFontAssets";
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
  assert.match(code, /"Destinatário da Operação", data\.destinatario, cursor\.y/);
  assert.match(code, /"Intermediário da Operação", data\.intermediario, cursor\.y/);
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

test("NT008: primeira linha de cada bloco segue o esquema titulo + 3 colunas do Anexo I", async () => {
  const source = src("lib/nfse/danfsePdf.ts");
  for (const section of [
    "Serviço Prestado", "Tributação Municipal (ISSQN)", "Tributação Federal (Exceto CBS)",
    "Tributação IBS / CBS", "Valor Total da NFS-e",
  ]) {
    assert.ok(source.includes(`drawSectionCell(page, bold, "${section}"`), `primeira coluna: ${section}`);
  }
  for (const section of [
    "Prestador / Fornecedor", "Tomador / Adquirente", "Destinatário da Operação", "Intermediário da Operação",
  ]) assert.ok(source.includes(`drawParticipantSection(page, bold, regular, "${section}"`));
  assert.ok(!source.includes('drawBlockTitle(page, bold, "Prestador / Fornecedor"'));
  const bytes = await buildDanfsePdf(DANFSE_PREVIEW_FIXTURE);
  const pdf = await loadPdfDocument(bytes);
  assert.equal(pdf.numPages, 1);
  const text = (await extractPageTextItems(await pdf.getPage(1))).map(i => i.text).join(" ");
  for (const term of ["PRESTADOR / FORNECEDOR", "SERVIÇO PRESTADO", "TRIBUTAÇÃO IBS / CBS", "VALOR TOTAL DA NFS-E"]) {
    assert.ok(text.includes(term), `texto nao encontrado: ${term}`);
  }
});

test("NT008: cels de identificacao sem reticencias em titulos longos", () => {
  const source = src("lib/nfse/danfsePdf.ts");
  assert.match(source, /const labelLines = wrapDanfseText\(printedLabel, bold, labelSize, width - 4\)/);
  assert.match(source, /if \(labelLines\.length > 2\)/);
  assert.match(source, /const titleLines = wrapDanfseText\(title\.toUpperCase\(\), bold, 7, first - 5\)/);
  assert.match(source, /if \(titleLines\.length > 2\)/);
});

test("NT008: dados opcionais inexistentes nao sao preenchidos com estimativas fiscais", async () => {
  const bytes = await buildDanfsePdf({
    ...DANFSE_PREVIEW_FIXTURE,
    prestador: { ...DANFSE_PREVIEW_FIXTURE.prestador, municipality: undefined },
    ibsCbsValueState: undefined, ibsCbsValueCity: undefined, ibsCbsValueFederal: undefined,
    federalIrrf: undefined, federalPis: undefined,
  });
  const pdf = await loadPdfDocument(bytes);
  assert.equal(pdf.numPages, 1);
  const text = (await extractPageTextItems(await pdf.getPage(1))).map(i => i.text).join(" ");
  assert.ok(text.includes("CÓDIGO IBGE / CEP") || text.includes("Código IBGE / CEP"));
  assert.ok(text.includes("Valor Total Apurado - CBS"));
});

test("DANFSe total do IBS/CBS soma montantes presentes em centavos, sem assumir tributo ausente igual a zero", () => {
  assert.ok(formatDanfseTotalIbsCbs({ ibsCbsTotal: "10.20", ibsCbsValueFederal: "3.33" }).endsWith("13,53"));
  assert.ok(formatDanfseTotalIbsCbs({ ibsCbsTotal: "0.00", ibsCbsValueFederal: "0.00" }).endsWith("0,00"));
  assert.equal(formatDanfseTotalIbsCbs({ ibsCbsTotal: "10.20" }), "-");
  assert.equal(formatDanfseTotalIbsCbs({ ibsCbsValueFederal: "3.33" }), "-");
  assert.equal(formatDanfseTotalIbsCbs({ ibsCbsTotal: "NaN", ibsCbsValueFederal: "3.33" }), "-");
});

test("NT008: ISSQN admite tributação tributável, imune, exportação e não incidência sem inventar cálculo", async () => {
  assert.equal(danfseIssqnTypeLabel("1"), "Operação Tributável");
  assert.equal(danfseIssqnTypeLabel("2"), "Imunidade");
  assert.equal(danfseIssqnTypeLabel("3"), "Exportação de Serviço");
  assert.equal(danfseIssqnTypeLabel("4"), "Não Incidência");
  assert.equal(danfseRegimeEspecialLabel("2"), "Estimativa");
  assert.equal(danfseIssqnRetentionLabel("1"), "Não Retido");
  const pdfBytes = await buildDanfsePdf({ ...DANFSE_PREVIEW_FIXTURE,
    issqnTaxationType: "4", issqnTaxBase: undefined, issqnRateApplied: undefined,
    issqnAmount: undefined, issqnSpecialTaxRegime: undefined,
  });
  const pdf = await loadPdfDocument(pdfBytes);
  assert.equal(pdf.numPages, 1);
  const text = (await extractPageTextItems(await pdf.getPage(1))).map(item => item.text).join(" ");
  assert.ok(text.includes("OPERAÇÃO NÃO SUJEITA AO ISSQN"));
});

test("NT008 v1.02: tpRetPisCofins=1 redistribui campos federais sem dupla contagem", () => {
  const retained = danfseFederalValues({
    federalPisCofinsRetention: "1", federalSocialContribRetained: "1.20",
    federalPis: "2.35", federalCofins: "3.45",
  });
  assert.ok(retained.social.endsWith("7,00"));
  assert.ok(retained.pis.endsWith("0,00"));
  assert.ok(retained.cofins.endsWith("0,00"));
  const own = danfseFederalValues({
    federalPisCofinsRetention: "0", federalSocialContribRetained: "1.20",
    federalPis: "2.35", federalCofins: "3.45",
  });
  assert.ok(own.social.endsWith("1,20"));
  assert.ok(own.pis.endsWith("2,35"));
  assert.ok(own.cofins.endsWith("3,45"));
  assert.equal(danfseFederalValues({ federalPisCofinsRetention: "1" }).social, "-");
});

test("NT008: linha opcional PIS/COFINS nao aparece para competencia 2027", async () => {
  const pdfBytes = await buildDanfsePdf({ ...DANFSE_PREVIEW_FIXTURE,
    competencyDate: "2027-02-01",
    federalPisCofinsRetention: "0", federalPis: "2.00", federalCofins: "3.00",
  });
  const pdf = await loadPdfDocument(pdfBytes);
  const text = (await extractPageTextItems(await pdf.getPage(1))).map(item => item.text).join(" ");
  assert.ok(!text.includes("PIS - Débito Apuração Própria"));
  assert.ok(!text.includes("COFINS - Débito Apuração Própria"));
  assert.ok(text.includes("TRIBUTAÇÃO FEDERAL (EXCETO CBS)"));
});

test("NT008: tributos aproximados apenas se fornecidos no XML; compra em complemento", async () => {
  const pdfBytes = await buildDanfsePdf({ ...DANFSE_PREVIEW_FIXTURE,
    complementaryInformation: "INFORMAÇÃO FISCAL FICTÍCIA",
    purchaseOrderNumber: "PEDIDO-FICTICIO-123",
    taxApproxTotals: "Federais: 1%; Estaduais: 0%; Municipais: 2%",
  });
  const pdf = await loadPdfDocument(pdfBytes);
  const text = (await extractPageTextItems(await pdf.getPage(1))).map(item => item.text).join(" ");
  assert.ok(text.includes("Totais Aproximados dos Tributos"));
  assert.ok(text.includes("PEDIDO-FICTICIO-123"));
  assert.ok(text.includes("INFORMAÇÃO FISCAL FICTÍCIA"));
});

test("NT008: SN e beneficio municipal usam descricao textual da tabela nacional", () => {
  assert.equal(danfseSimplesNacionalLabel("1"), "Não Optante");
  assert.ok(danfseSimplesNacionalLabel("3").includes("Microempresa"));
  assert.ok(danfseApuracaoSimplesLabel("1").includes("Simples Nacional"));
  assert.ok(danfseApuracaoSimplesLabel("2").includes("ISSQN pela NFS-e"));
  assert.equal(danfseMunicipalBenefitLabel("1"), "Isenção");
  assert.equal(danfseMunicipalBenefitLabel("4"), "Alíquota Diferenciada");
  assert.equal(danfseMunicipalBenefitLabel(undefined), "-");
});

test("NT008: informações complementares respeitam a ordem do Anexo I, sem inventar tributos", () => {
  const data = {
    ...DANFSE_PREVIEW_FIXTURE,
    complementaryInformation: "CONTEXTO FICTICIO",
    replacedNoteAccessKey: "2".repeat(50),
    referencedDocument: "DOC-123",
    constructionCode: "OBRA-001",
    propertyRegistration: "IMOVEL-002",
    eventActivityCode: "EVENTO-003",
    technicalDocumentId: "DOC-TEC-004",
    purchaseOrderNumber: "PEDIDO-005",
    purchaseOrderItem: "ITEM-006",
    municipalAdditionalInformation: "INF-MUN-007",
    taxApproxTotals: "Federais: 1,00%; Estaduais: 2,00%; Municipais: 3,00%",
  };
  const content = buildDanfseComplementary(data);
  const labels = ["Inf. Cont.", "NFS-e Subst.", "Doc. Ref.", "Cod. Obra",
    "Insc. Imob.", "Cod. Evt.", "Doc. Tec.", "Núm. Ped.", "Item Ped.",
    "Inf. A. T. Mun.", "Totais Aproximados dos Tributos"];
  let previous = -1;
  for (const label of labels) {
    const index = content.indexOf(label);
    assert.ok(index > previous, `bloco ${label} ausente ou fora de ordem`);
    previous = index;
  }
  assert.ok(content.endsWith(data.taxApproxTotals));
  const absent = buildDanfseComplementary(DANFSE_PREVIEW_FIXTURE);
  assert.ok(absent.includes("Federais: -; Estaduais: -; Municipais: -"));
  assert.ok(!absent.includes("R$ 0,00"), "sem tributos no XML não deve ser inventado zero");
});

test("NT008: complemento extenso recebe reticências sem ocultar linha obrigatória de tributos", () => {
  const content = buildDanfseComplementary({
    ...DANFSE_PREVIEW_FIXTURE,
    complementaryInformation: "OBSERVACAO TESTE ".repeat(600),
    taxApproxTotals: "Federais: 3%; Estaduais: 0%; Municipais: 1%",
  });
  const [details, totals] = content.split(" | Totais Aproximados dos Tributos");
  assert.ok(details.length <= 1997);
  assert.ok(details.endsWith("..."));
  assert.ok(totals.includes("Federais: 3%"));
  assert.ok(totals.includes("Municipais: 1%"));
});

test("NT008: nota substituída e cancelada geram marcas d'água distintas e mutuamente exclusivas", async () => {
  // A NOVA nota com chSubstda é SUBSTITUTA, não SUBSTITUÍDA.
  const replacement = await buildDanfsePdf({
    ...DANFSE_PREVIEW_FIXTURE, replacedNoteAccessKey: "3".repeat(50),
  });
  const replacementPdf = await loadPdfDocument(replacement);
  assert.equal(replacementPdf.numPages, 1);
  const replacementText = (await extractPageTextItems(await replacementPdf.getPage(1)))
    .map(item => item.text).join(" ");
  assert.ok(!replacementText.includes("SUBSTITUÍDA"));
  assert.ok(replacementText.includes("NFS-e Subst."));
  // A ANTIGA nota somente recebe SUBSTITUÍDA após evento confirmado.
  const substituted = await buildDanfsePdf(DANFSE_PREVIEW_FIXTURE, { substituted: true });
  const subPdf = await loadPdfDocument(substituted);
  const substituteText = (await extractPageTextItems(await subPdf.getPage(1)))
    .map(item => item.text).join(" ");
  assert.ok(substituteText.includes("SUBSTITUÍDA"));
  const cancelled = await buildDanfsePdf(DANFSE_PREVIEW_FIXTURE, { cancelled: true });
  const canPdf = await loadPdfDocument(cancelled);
  const cancelText = (await extractPageTextItems(await canPdf.getPage(1)))
    .map(item => item.text).join(" ");
  assert.ok(cancelText.includes("CANCELADA"));
  await assert.rejects(
    () => buildDanfsePdf(DANFSE_PREVIEW_FIXTURE, { cancelled: true, substituted: true }),
    /situações de cancelamento e substituição simultâneas/,
  );
});

test("NT008: parser de tributos aproximados segue XML oficial (vTotTrib / pTotTrib)", () => {
  const source = readFileSync(new URL("../../../packages/core/src/nfse/danfse-data.ts", import.meta.url), "utf8");
  assert.match(source, /directChild\(approximateTaxes, "vTotTrib"\)/);
  assert.match(source, /directChild\(approximateTaxes, "pTotTrib"\)/);
  assert.match(source, /select\("vTotTribMu", "pTotTribMu"\)/);
  assert.ok(!source.includes('directText(approximateTaxes, "pTotTribFed")'));
  assert.match(source, /replacedNoteAccessKey: directText\(replacementGroup, "chSubstda"\)/);
  assert.match(source, /technicalDocumentId: directText\(infoCompl, "idDocTec"\)/);
  assert.equal(DANFSE_OFFICIAL_LAYOUT_APPROVED, false);
});

test("NT008: fontes fiscais só podem vir de provedor privado, nunca do git ou da web", async () => {
  const source = src("lib/nfse/danfsePdf.ts");
  const loader = src("lib/nfse/danfseFontAssets.ts");
  assert.match(source, /pdf\.registerFontkit\(fontkit\)/);
  assert.match(source, /pdf\.embedFont\(fonts\.arialBold, \{ subset: true \}\)/);
  assert.match(source, /pdf\.embedFont\(fonts\.microsoftSansSerif, \{ subset: true \}\)/);
  assert.match(loader, /DANFSE_FONT_SERVER_LICENSE_CONFIRMED/);
  assert.ok(loader.includes("nfse/private-fonts/"));
  assert.match(loader, /createHash\("sha256"\)/);
  const beforeArial = process.env.DANFSE_ARIAL_BOLD_R2_KEY;
  const beforeSans = process.env.DANFSE_MICROSOFT_SANS_SERIF_R2_KEY;
  try {
    delete process.env.DANFSE_ARIAL_BOLD_R2_KEY;
    delete process.env.DANFSE_MICROSOFT_SANS_SERIF_R2_KEY;
    assert.equal(await loadLicensedDanfseFonts(), undefined);
  } finally {
    if (beforeArial === undefined) delete process.env.DANFSE_ARIAL_BOLD_R2_KEY;
    else process.env.DANFSE_ARIAL_BOLD_R2_KEY = beforeArial;
    if (beforeSans === undefined) delete process.env.DANFSE_MICROSOFT_SANS_SERIF_R2_KEY;
    else process.env.DANFSE_MICROSOFT_SANS_SERIF_R2_KEY = beforeSans;
  }
});

test("fontes fiscais são autenticadas por SHA, família e direitos de embedding", () => {
  const invalid = new Uint8Array(200);
  assert.throws(() => verifyDanfseFontFile(invalid, "0".repeat(64), "arial-bold"),
    /TTF\/OTF não reconhecido/);
  const candidate = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
  ].find(existsSync);
  if (!candidate) return; // Sistemas sem fontes externas ainda validam ausência de arquivos.
  const bytes = readFileSync(candidate);
  const hash = createHash("sha256").update(bytes).digest("hex");
  assert.throws(() => verifyDanfseFontFile(bytes, "0".repeat(64), "arial-bold"),
    /SHA-256/);
  assert.throws(() => verifyDanfseFontFile(bytes, hash, "arial-bold"),
    /Arial Bold original/);
});

test("DANFSe fictício incorpora fontkit e calcula quebras com fontes TTF reais no CI", async (t) => {
  // Liberation Sans tem métricas próximas de Arial/Helvetica. DejaVu Sans
  // é mais larga e não cabe na legenda de QR a 6pt/3 linhas — usar essa
  // família seria um teste inválido da geometria especificada para Microsoft.
  const regularPath = [
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/croscore/Arimo-Regular.ttf",
  ].find(existsSync);
  const boldPath = [
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/croscore/Arimo-Bold.ttf",
  ].find(existsSync);
  if (!regularPath || !boldPath) { t.skip("Runner não contém TTF livre para smoke test"); return; }
  // Fonte livre do runner serve SOMENTE para exercitar fontkit. Não
  // se confunde com Arial/Microsoft Sans Serif e não é enviada ao usuário.
  const bytes = await buildDanfsePdf(DANFSE_PREVIEW_FIXTURE, {
    fonts: {
      arialBold: readFileSync(boldPath),
      microsoftSansSerif: readFileSync(regularPath),
    },
  });
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  assert.ok(Buffer.from(bytes).toString("latin1").includes("/FontFile2"),
    "PDF de teste precisa conter fonte TTF embutida");
  assert.equal(DANFSE_OFFICIAL_LAYOUT_APPROVED, false);
});
