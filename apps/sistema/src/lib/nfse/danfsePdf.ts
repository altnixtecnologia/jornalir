import "server-only";
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import { NFSE_OFFICIAL_LOGO_PNG_BASE64 } from "./nfseNationalLogo";
import type { DanfseData, DanfsePessoaData } from "@ir/core/src/nfse/danfse-data";
import { assertDanfseLayoutApproved } from "./danfseReleaseGate";

/**
 * Renderizador PROVISÓRIO de DANFSe para inspeção em homologação visual.
 *
 * NT oficial: 008/2026 v1.02 (14/07/2026), Anexo I, Portal Nacional NFS-e.
 * Não está conforme para uso oficial: faltam tributação federal/IBS/CBS,
 * informações complementares, campos obrigatórios do Simples Nacional,
 * layout geométrico completo e fontes oficiais. A logomarca NFS-e ja esta
 * incorporada no cabecalho do prototipo. Alguns valores atualmente
 * são estáticos e precisam derivar do XML oficial. Sem liberar emissão,
 * download ou arquivamento de DANFSe de produção até sanar os pontos.
 *
 * O gerador pode continuar produzindo PDF de teste com aviso
 * "NFS-e SEM VALIDADE JURÍDICA" em ambiente de homologação. A trava
 * assertDanfseLayoutApproved() NÃO é configurável por env.
 */

const PAGE_WIDTH = 595; // A4 em pontos PDF (210 mm)
const PAGE_HEIGHT = 842; // A4 em pontos PDF (297 mm)
const CM_TO_PT = 72 / 2.54;
/**
 * NT 008/2026 v1.02, §2.2.2: borda do documento a 0,15–0,20 cm
 * de CADA extremidade da folha. O protótipo anterior usava margem
 * externa de 16 pt (0,56 cm), fora do intervalo regulamentar.
 *
 * Os 4 pt adicionais são o recuo INTERNO entre borda e conteúdo;
 * não compõem a margem entre a borda impressa e a folha.
 */
export const DANFSE_GEOMETRY = {
  outerBorderMarginCm: 0.18,
  innerPaddingPt: 4,
  qrXcm: 17.48,
  qrYcm: 1.67, // referência do canto SUPERIOR esquerdo do papel
} as const;
const MARGIN = DANFSE_GEOMETRY.outerBorderMarginCm * CM_TO_PT + DANFSE_GEOMETRY.innerPaddingPt;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const GRAY_SHADING = rgb(0.95, 0.95, 0.95);
const BLACK = rgb(0, 0, 0);
const RED = rgb(0.8, 0, 0);
const DARK_GRAY = rgb(0.3, 0.3, 0.3);

const QR_BASE_URL = "https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=";
const QR_CAPTION = "A autenticidade desta NFS-e pode ser verificada pela leitura deste código QR ou pela consulta da chave de acesso no portal nacional da NFS-e";

/** Mantém a competência como dia civil, sem conversão UTC -> fuso do servidor. */
export function formatDanfseDate(iso: string | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "-";
  const date = new Date(iso + "T00:00:00.000Z");
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) return "-";
  return iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4);
}

/** Emissor operacional em São João do Sul/SC: hora fiscal local explícita, nunca timezone do runner Vercel. */
export function formatDanfseDateTime(iso: string | undefined): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit",
    year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).format(date).replace(", ", " ");
}
function formatMoney(value: number | string | undefined): string {
  if (value === undefined) return "-";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function dash(value: string | undefined): string {
  return value && value.length > 0 ? value : "-";
}
export function formatFederalInscription(value: string): string {
  // CNPJ alfanumérico (XSD nacional desde 2026) pode conter 11 dígitos
  // e 3 letras. O código antigo removia as letras e o imprimia como CPF,
  // apagando parte da identificação fiscal do verdadeiro prestador.
  // Formatar como CPF/CNPJ APENAS quando a inscrição inteira é numérica;
  // para inscrição alfanumérica, preservar todos os caracteres originais.
  const normalized = value.replace(/[.\/\-\s]/g, "");
  if (/^\d{14}$/.test(normalized)) {
    return normalized.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  if (/^\d{11}$/.test(normalized)) {
    return normalized.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  return value;
}

interface Cursor {
  y: number;
}

function drawBlockTitle(page: PDFPage, bold: PDFFont, title: string, y: number): void {
  page.drawRectangle({ x: MARGIN, y: y - 11, width: CONTENT_WIDTH, height: 11, color: GRAY_SHADING });
  page.drawText(title.toUpperCase(), { x: MARGIN + 3, y: y - 8.5, size: 7, font: bold, color: BLACK });
}

/** Evita invadir a coluna vizinha; o protótipo não substitui o layout homologado. */
function fitTextToWidth(value: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(value, size) <= maxWidth) return value;
  const ellipsis = "...";
  if (font.widthOfTextAtSize(ellipsis, size) > maxWidth) return "";
  let low = 0;
  let high = value.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (font.widthOfTextAtSize(value.slice(0, mid) + ellipsis, size) <= maxWidth) low = mid;
    else high = mid - 1;
  }
  return value.slice(0, low) + ellipsis;
}

function drawField(page: PDFPage, bold: PDFFont, regular: PDFFont, label: string, value: string, x: number, y: number, width: number, shaded = false, identification = false): void {
  if (shaded) page.drawRectangle({ x, y: y - 20, width, height: 20, color: GRAY_SHADING });
  // NT 008, §2.4.2: labels de campos comuns 6pt e caixa de título;
  // identificação da NFS-e: 7pt em caixa alta. Todos em preto K100.
  const labelSize = identification ? 7 : 6;
  const printedLabel = identification ? label.toUpperCase() : label;
  // O Anexo I permite labels com mais de uma linha; NÃO cortar labels
  // obrigatórios por reticências. São reservadas duas linhas em cada célula.
  const labelLines = wrapDanfseText(printedLabel, bold, labelSize, width - 4);
  if (labelLines.length > 2) {
    throw new Error(`Rótulo fiscal excede as duas linhas permitidas no campo: ${label}`);
  }
  labelLines.forEach((line, i) => page.drawText(line, {
    x: x + 2, y: y - 6 - i * 6.3, size: labelSize, font: bold, color: BLACK,
  }));
  // Valores curtos da grade podem usar reticências como permite a NT.
  // Nomes, endereços, serviços e complementos usam drawWrappedField.
  const safeValue = fitTextToWidth(value, regular, 7, width - 4);
  page.drawText(safeValue, { x: x + 2, y: y - 18.5, size: 7, font: regular, color: BLACK });
}

/**
 * Quebra texto sem reticências: descrição, identificação do prestador,
 * tomador e observações são informações fiscais, nunca podem sumir do PDF.
 * Só normaliza espaçamentos em branco; todos os termos são preservados.
 */
export function wrapDanfseText(value: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (maxWidth <= 0) throw new Error("Largura de texto inválida no DANFSe.");
  const words = value.trim().split(/\s+/u).filter(Boolean);
  if (!words.length) return ["-"];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (font.widthOfTextAtSize(word, size) > maxWidth) {
      if (line) { lines.push(line); line = ""; }
      let remaining = word;
      while (remaining.length > 0) {
        let low = 0;
        let high = remaining.length;
        while (low < high) {
          const middle = Math.ceil((low + high) / 2);
          if (font.widthOfTextAtSize(remaining.slice(0, middle), size) <= maxWidth) low = middle;
          else high = middle - 1;
        }
        if (low === 0) throw new Error("Campo fiscal contém caractere que não cabe no DANFSe.");
        const chunk = remaining.slice(0, low);
        remaining = remaining.slice(low);
        if (remaining) lines.push(chunk);
        else line = chunk;
      }
      continue;
    }
    const candidate = line ? line + " " + word : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

/** Retorna a altura real ocupada para o layout deslocar os blocos seguintes. */
function drawWrappedField(
  page: PDFPage, bold: PDFFont, regular: PDFFont,
  label: string, value: string, x: number, y: number, width: number,
): number {
  const lines = wrapDanfseText(value, regular, 7, width - 4);
  page.drawText(fitTextToWidth(label, bold, 6, width - 4), {
    x: x + 2, y: y - 7, size: 6, font: bold, color: BLACK,
  });
  lines.forEach((line, i) => page.drawText(line, {
    x: x + 2, y: y - 17 - i * 9, size: 7, font: regular, color: BLACK,
  }));
  return 20 + (lines.length - 1) * 9;
}

/**
 * NT 008/2026 v1.02, Anexo I: a linha da descrição do código de
 * tributação não tem rótulo e usa a descrição municipal QUANDO presente;
 * do contrário, usa a nacional. Nunca mostrar ambas, nem derivar do
 * código ou inventar texto.
 */
export function selectDanfseTaxDescription(data: Pick<DanfseData, "nationalServiceDescription" | "municipalServiceDescription">): string {
  return data.municipalServiceDescription?.trim() || data.nationalServiceDescription?.trim() || "-";
}

/** Linha livre do leiaute: sem label e sem reticências, altura dinâmica. */
function drawWrappedPlainText(page: PDFPage, regular: PDFFont, value: string, x: number, y: number, width: number): number {
  const lines = wrapDanfseText(value, regular, 7, width - 4);
  lines.forEach((line, index) => page.drawText(line, {
    x: x + 2, y: y - 7 - index * 9, size: 7, font: regular, color: BLACK,
  }));
  return lines.length * 9;
}


/** Anexo I: o título da seção ocupa a PRIMEIRA coluna na mesma linha de
 * identificação; não cria faixa de título extra de largura total. */
function drawSectionCell(page: PDFPage, bold: PDFFont, title: string, y: number): void {
  const first = CONTENT_WIDTH / 4;
  page.drawLine({
    start: { x: MARGIN, y: y + 1 }, end: { x: MARGIN + CONTENT_WIDTH, y: y + 1 },
    thickness: 0.5, color: BLACK,
  });
  page.drawRectangle({ x: MARGIN, y: y - 19, width: first, height: 20, color: GRAY_SHADING });
  const titleLines = wrapDanfseText(title.toUpperCase(), bold, 7, first - 5);
  if (titleLines.length > 2) throw new Error(`Título de bloco fiscal ultrapassa a coluna: ${title}`);
  titleLines.forEach((line, i) => page.drawText(line, {
    x: MARGIN + 3, y: y - 8 - i * 8, size: 7, font: bold, color: BLACK,
  }));
}

/** Linha inicial mais linhas dinâmicas de pessoa, no mesmo arranjo do Anexo I.
 * Os dados vêm exclusivamente de pessoa extraída do XML/fixture fictícia.
 * Nomes, endereços e e-mails extensos aumentam a altura, sem transbordar. */
function drawParticipantSection(
  page: PDFPage, bold: PDFFont, regular: PDFFont,
  title: string, person: DanfsePessoaData | undefined, top: number,
  absentText: string, simples?: { option?: string; regime?: string },
): number {
  const quarter = CONTENT_WIDTH / 4;
  const half = CONTENT_WIDTH / 2;
  drawSectionCell(page, bold, title, top);
  if (!person) {
    const lines = wrapDanfseText(absentText, regular, 7, CONTENT_WIDTH - quarter - 6);
    lines.forEach((line, i) => page.drawText(line, {
      x: MARGIN + quarter + 3, y: top - 12 - i * 9, size: 7, font: regular, color: BLACK,
    }));
    return top - Math.max(22, lines.length * 9 + 5);
  }
  drawField(page, bold, regular, "CNPJ / CPF / NIF", formatFederalInscription(person.federalInscription), MARGIN + quarter, top, quarter);
  drawField(page, bold, regular, "Indicador Municipal (Inscrição)", dash(person.municipalRegistration), MARGIN + quarter * 2, top, quarter);
  drawField(page, bold, regular, "Telefone", dash(person.phone), MARGIN + quarter * 3, top, quarter);
  let y = top - 20;
  const nameHeight = drawWrappedField(page, bold, regular, "Nome / Nome Empresarial", person.name, MARGIN, y, half);
  drawField(page, bold, regular, "Município / Sigla UF", `${dash(person.municipality)} / ${dash(person.state)}`, MARGIN + half, y, quarter);
  drawField(page, bold, regular, "Código IBGE / CEP", `${dash(person.ibgeCode)} / ${dash(person.zipCode)}`, MARGIN + half + quarter, y, quarter);
  y -= Math.max(20, nameHeight);
  const addressHeight = drawWrappedField(page, bold, regular, "Endereço", dash(person.address), MARGIN, y, half);
  const emailHeight = drawWrappedField(page, bold, regular, "E-mail", dash(person.email), MARGIN + half, y, half);
  y -= Math.max(20, addressHeight, emailHeight) + 2;
  if (simples) {
    drawField(page, bold, regular, "Simples Nacional na Data de Competência", dash(simples.option), MARGIN, y, half);
    drawField(page, bold, regular, "Regime de Apuração Tributária pelo SN", dash(simples.regime), MARGIN + half, y, half);
    y -= 22;
  }
  return y;
}

function drawBorder(page: PDFPage): void {
  page.drawRectangle({ x: MARGIN - 4, y: MARGIN - 4, width: PAGE_WIDTH - (MARGIN - 4) * 2, height: PAGE_HEIGHT - (MARGIN - 4) * 2, borderColor: BLACK, borderWidth: 1 });
}

export async function buildDanfsePdf(data: DanfseData, options: { cancelled?: boolean } = {}): Promise<Uint8Array> {
  assertDanfseLayoutApproved(data.isHomologation);
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawBorder(page);

  // CABEÇALHO da NT 008/2026 v1.02, Anexo I, dimensões em centímetros
  // medidas da origem superior esquerda do formulário. Não usar marca
  // municipal ou do Jornal IR no DANFSe; a identidade do Jornal permanece
  // apenas na interface administrativa externa ao documento.
  const headerBottom = PAGE_HEIGHT - 1.46 * CM_TO_PT;
  const headerTop = PAGE_HEIGHT - 0.30 * CM_TO_PT;
  page.drawRectangle({
    x: MARGIN - 4, y: headerBottom, width: PAGE_WIDTH - (MARGIN - 4) * 2,
    height: headerTop - headerBottom, color: GRAY_SHADING,
  });
  const officialLogo = await pdf.embedPng(Buffer.from(NFSE_OFFICIAL_LOGO_PNG_BASE64, "base64"));
  const officialLogoWidth = 4.00 * CM_TO_PT;
  const officialLogoHeight = 0.85 * CM_TO_PT;
  page.drawImage(officialLogo, {
    x: 0.49 * CM_TO_PT,
    y: PAGE_HEIGHT - 0.44 * CM_TO_PT - officialLogoHeight,
    width: officialLogoWidth, height: officialLogoHeight,
  });
  const drawCenteredHeader = (value: string, y: number, fontSize: number, color = BLACK): void => {
    const textWidth = bold.widthOfTextAtSize(value, fontSize);
    page.drawText(value, { x: (PAGE_WIDTH - textWidth) / 2, y, size: fontSize, font: bold, color });
  };
  drawCenteredHeader("DANFSe v2.0", PAGE_HEIGHT - 0.54 * CM_TO_PT, 9);
  drawCenteredHeader("Documento Auxiliar da NFS-e", PAGE_HEIGHT - 0.87 * CM_TO_PT, 9);
  if (data.isHomologation) {
    drawCenteredHeader("NFS-e SEM VALIDADE JURÍDICA", PAGE_HEIGHT - 1.20 * CM_TO_PT, 9, RED);
  }
  const rightColumnX = 15.62 * CM_TO_PT;
  const rightColumnWidth = 5.09 * CM_TO_PT;
  const emitterCity = data.emitterMunicipality
    ? `Município: ${data.emitterMunicipality}${data.prestador.state ? " / " + data.prestador.state : ""}`
    : "Município: -";
  page.drawText(fitTextToWidth(emitterCity, regular, 8, rightColumnWidth), {
    x: rightColumnX, y: PAGE_HEIGHT - 0.54 * CM_TO_PT, font: regular, size: 8, color: BLACK,
  });
  page.drawText(fitTextToWidth(`Ambiente Gerador: ${dash(data.environmentGenerator)}`, regular, 6, rightColumnWidth), {
    x: rightColumnX, y: PAGE_HEIGHT - 0.88 * CM_TO_PT, size: 6, font: regular, color: BLACK,
  });
  page.drawText(`Tipo de Ambiente: ${data.isHomologation ? "2" : "1"}`, {
    x: rightColumnX, y: PAGE_HEIGHT - 1.16 * CM_TO_PT, size: 6, font: regular, color: BLACK,
  });

  const cursor: Cursor = { y: headerBottom - 8 };

  // QR CODE (seção 2.4.3) — à direita dos campos de identificação.
  const qrPngDataUrl = await QRCode.toDataURL(`${QR_BASE_URL}${data.accessKey}`, { margin: 0, width: 256 });
  const qrPngBase64 = qrPngDataUrl.split(",")[1] ?? "";
  const qrImage = await pdf.embedPng(Buffer.from(qrPngBase64, "base64"));
  const qrSize = 70; // 2,47 cm > mínimo de 1,52 cm
  const qrX = DANFSE_GEOMETRY.qrXcm * CM_TO_PT;
  cursor.y -= 20;
  const qrY = PAGE_HEIGHT - DANFSE_GEOMETRY.qrYcm * CM_TO_PT - qrSize;
  page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });
  // NT 008/2026 § 2.4.3: legenda completa em TRÊS linhas, sem invadir margem
  // ou a terceira coluna de identificação. A posição do QR é independente.
  const captionWidth = 133;
  const captionX = PAGE_WIDTH - MARGIN - captionWidth;
  const captionLines = [
    "A autenticidade desta NFS-e pode ser verificada",
    "pela leitura deste código QR ou pela consulta da",
    "chave de acesso no portal nacional da NFS-e",
  ];
  captionLines.forEach((line, i) => {
    if (regular.widthOfTextAtSize(line, 6) > captionWidth) {
      throw new Error("Legenda do QR Code excede a largura máxima prevista.");
    }
    page.drawText(line, { x: captionX, y: qrY - 10 - i * 8, size: 6, font: regular, color: DARK_GRAY });
  });

  // Reserva a faixa direita inteira para QR + legenda; antes os campos
  // avançavam até x=485pt, colidindo com o texto da legenda (x=442pt).
  const contentColumnWidth = CONTENT_WIDTH - 145;

  // BLOCO: DADOS DE IDENTIFICAÇÃO DA NFS-e (seção 2.1.1/2.1.2).
  // Anexo I: o bloco de identificação começa com a chave, sem faixa
  // horizontal por trás do QR Code. A faixa antiga atravessava a imagem,
  // tornando parte do código ilegível na prévia sintética.
  page.drawText("CHAVE DE ACESSO DA NFS-e", {
    x: MARGIN + 2, y: cursor.y - 7, size: 7, font: bold, color: BLACK,
  });
  page.drawText(data.accessKey, {
    x: MARGIN + 2, y: cursor.y - 17, size: 7, font: regular, color: BLACK,
  });
  cursor.y -= 22;
  const idFieldWidth = contentColumnWidth / 3;
  drawField(page, bold, regular, "Número da NFS-e", data.nfseNumber, MARGIN, cursor.y, idFieldWidth, false, true);
  drawField(page, bold, regular, "Competência da NFS-e", formatDanfseDate(data.competencyDate), MARGIN + idFieldWidth, cursor.y, idFieldWidth, false, true);
  drawField(page, bold, regular, "Data/Hora da Emissão da NFS-e", formatDanfseDateTime(data.nfseIssuedAt), MARGIN + idFieldWidth * 2, cursor.y, idFieldWidth, false, true);
  cursor.y -= 20;
  drawField(page, bold, regular, "Número da DPS", data.dpsNumber, MARGIN, cursor.y, idFieldWidth, false, true);
  drawField(page, bold, regular, "Série da DPS", data.dpsSeries, MARGIN + idFieldWidth, cursor.y, idFieldWidth, false, true);
  drawField(page, bold, regular, "Data/Hora da Emissão da DPS", formatDanfseDateTime(data.dpsIssuedAt), MARGIN + idFieldWidth * 2, cursor.y, idFieldWidth, false, true);
  cursor.y -= 20;
  drawField(page, bold, regular, "Emitente da NFS-e", data.issuerLabel, MARGIN, cursor.y, idFieldWidth * 2, true, true);
  drawField(page, bold, regular, "Situação da NFS-e", data.statusLabel, MARGIN + idFieldWidth * 2, cursor.y, idFieldWidth, false, true);
  cursor.y -= 20;
  drawField(page, bold, regular, "Finalidade", data.purposeLabel, MARGIN, cursor.y, contentColumnWidth, false, true);
  cursor.y -= 22;


  // Blocos 2.1.3-2.1.6: títulos na primeira coluna, dados nas demais,
  // observando as supressões autorizadas pela NT008 §§2.3.1-2.3.2.
  cursor.y = drawParticipantSection(page, bold, regular, "Prestador / Fornecedor", data.prestador, cursor.y,
    "PRESTADOR/FORNECEDOR NÃO IDENTIFICADO NA NFS-e", {
      option: data.prestadorSimplesOption, regime: data.prestadorSnApuracao,
    });
  cursor.y = drawParticipantSection(page, bold, regular, "Tomador / Adquirente", data.tomador, cursor.y,
    "TOMADOR/ADQUIRENTE DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e");
  cursor.y = drawParticipantSection(page, bold, regular, "Destinatário da Operação", data.destinatario, cursor.y,
    data.destinatarioEhTomador
      ? "O DESTINATÁRIO É O PRÓPRIO TOMADOR/ADQUIRENTE DA OPERAÇÃO"
      : "DESTINATÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e");
  cursor.y = drawParticipantSection(page, bold, regular, "Intermediário da Operação", data.intermediario, cursor.y,
    "INTERMEDIÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e");


  // 2.1.7 — Serviço prestado, primeira linha com título na coluna inicial.
  const quarter = CONTENT_WIDTH / 4;
  const half = CONTENT_WIDTH / 2;
  drawSectionCell(page, bold, "Serviço Prestado", cursor.y);
  drawField(page, bold, regular, "Código de Tributação Nacional/Municipal",
    `${dash(data.nationalServiceCode)} / ${dash(data.municipalServiceCode)}`,
    MARGIN + quarter, cursor.y, quarter);
  drawField(page, bold, regular, "Código da NBS", dash(data.nbsCode), MARGIN + 2 * quarter, cursor.y, quarter);
  drawField(page, bold, regular, "Local da Prestação / Sigla UF / País",
    `${dash(data.serviceLocationIbgeCode)} / ${dash(data.prestador.state)} / -`,
    MARGIN + 3 * quarter, cursor.y, quarter);
  cursor.y -= 22;
  // Quando existe xTribMun, a linha de texto da classificação municipal
  // substitui a descrição nacional; a descrição do serviço vem abaixo.
  cursor.y -= drawWrappedPlainText(page, regular, selectDanfseTaxDescription(data), MARGIN, cursor.y, CONTENT_WIDTH) + 2;
  cursor.y -= drawWrappedField(page, bold, regular, "Descrição do Serviço", data.serviceDescription, MARGIN, cursor.y, CONTENT_WIDTH) + 4;

  // 2.1.8 — ISSQN: a tributação abre a seção e compartilha a primeira linha.
  drawSectionCell(page, bold, "Tributação Municipal (ISSQN)", cursor.y);
  drawField(page, bold, regular, "Tipo de Tributação do ISSQN", dash(data.issqnTaxationType), MARGIN + quarter, cursor.y, quarter);
  drawField(page, bold, regular, "Município / Sigla UF / País de Incidência do ISSQN",
    dash(data.issqnIncidenceLocation), MARGIN + 2 * quarter, cursor.y, half);
  cursor.y -= 20;
  drawField(page, bold, regular, "Regime Especial de Tributação", dash(data.issqnSpecialTaxRegime), MARGIN, cursor.y, quarter);
  drawField(page, bold, regular, "Retenção do ISSQN", dash(data.issqnRetentionType), MARGIN + quarter, cursor.y, quarter);
  drawField(page, bold, regular, "Desconto Incondicionado", formatMoney(data.issqnDiscountUnconditional), MARGIN + 2 * quarter, cursor.y, quarter);
  drawField(page, bold, regular, "Base de Cálculo ISSQN", formatMoney(data.issqnTaxBase), MARGIN + 3 * quarter, cursor.y, quarter);
  cursor.y -= 20;
  drawField(page, bold, regular, "Alíquota Aplicada", data.issqnRateApplied !== undefined ? `${data.issqnRateApplied}%` : "-", MARGIN, cursor.y, quarter);
  drawField(page, bold, regular, "ISSQN Apurado", formatMoney(data.issqnAmount), MARGIN + quarter, cursor.y, quarter);
  cursor.y -= 22;

  // 2.1.9 — Tributos federais, sem confundir IRRF com PIS/COFINS.
  drawSectionCell(page, bold, "Tributação Federal (Exceto CBS)", cursor.y);
  drawField(page, bold, regular, "IRRF", formatMoney(data.federalIrrf), MARGIN + quarter, cursor.y, quarter);
  drawField(page, bold, regular, "Contribuição Previdenciária - Retida", formatMoney(data.federalSocialSecurityRetained), MARGIN + 2 * quarter, cursor.y, quarter);
  drawField(page, bold, regular, "Contribuições Sociais - Retidas", formatMoney(data.federalSocialContribRetained), MARGIN + 3 * quarter, cursor.y, quarter);
  cursor.y -= 20;
  drawField(page, bold, regular, "PIS - Débito Apuração Própria", formatMoney(data.federalPis), MARGIN, cursor.y, quarter);
  drawField(page, bold, regular, "COFINS - Débito Apuração Própria", formatMoney(data.federalCofins), MARGIN + quarter, cursor.y, quarter);
  drawField(page, bold, regular, "Retenção PIS/COFINS (Código)", dash(data.federalPisCofinsRetention), MARGIN + 2 * quarter, cursor.y, half);
  cursor.y -= 22;

  // 2.1.10 — IBS/CBS, colunas no arranjo do Anexo I. Não se fabricam
  // bases ou descontos: campos opcionais ausentes são exibidos como traço.
  drawSectionCell(page, bold, "Tributação IBS / CBS", cursor.y);
  drawField(page, bold, regular, "CST / cClassTrib",
    `${dash(data.ibsCbsCst)} / ${dash(data.ibsCbsTaxClass)}`, MARGIN + quarter, cursor.y, quarter);
  drawField(page, bold, regular, "Indicador Operação / Código IBGE / Município Incidência / Sigla UF",
    `${dash(data.ibsCbsOperationIndicator)} / ${dash(data.ibsCbsLocation)}`,
    MARGIN + 2 * quarter, cursor.y, half);
  cursor.y -= 20;
  drawField(page, bold, regular, "Exclusões e Reduções da Base de Cálculo", "-", MARGIN, cursor.y, quarter);
  drawField(page, bold, regular, "Base de Cálculo Após Exclusões e Reduções", formatMoney(data.ibsCbsBase), MARGIN + quarter, cursor.y, quarter);
  drawField(page, bold, regular, "Redução Alíquota IBS / Redução Alíquota CBS", "-", MARGIN + 2 * quarter, cursor.y, quarter);
  drawField(page, bold, regular, "Alíquota - IBS UF / IBS Mun",
    `${dash(data.ibsCbsRateState)} / ${dash(data.ibsCbsRateCity)}`, MARGIN + 3 * quarter, cursor.y, quarter);
  cursor.y -= 20;
  drawField(page, bold, regular, "Alíquota Efetiva Municipal - IBS", dash(data.ibsCbsEffectiveRateCity), MARGIN, cursor.y, quarter);
  drawField(page, bold, regular, "Valor Apurado Municipal - IBS", formatMoney(data.ibsCbsValueCity), MARGIN + quarter, cursor.y, quarter);
  drawField(page, bold, regular, "Alíquota Efetiva Estadual - IBS", dash(data.ibsCbsEffectiveRateState), MARGIN + 2 * quarter, cursor.y, quarter);
  drawField(page, bold, regular, "Valor Apurado Estadual - IBS", formatMoney(data.ibsCbsValueState), MARGIN + 3 * quarter, cursor.y, quarter);
  cursor.y -= 20;
  drawField(page, bold, regular, "Valor Total Apurado - IBS", formatMoney(data.ibsCbsTotal), MARGIN, cursor.y, quarter);
  drawField(page, bold, regular, "Alíquota - CBS", dash(data.ibsCbsRateFederal), MARGIN + quarter, cursor.y, quarter);
  drawField(page, bold, regular, "Alíquota Efetiva - CBS", dash(data.ibsCbsEffectiveRateFederal), MARGIN + 2 * quarter, cursor.y, quarter);
  drawField(page, bold, regular, "Valor Total Apurado - CBS", formatMoney(data.ibsCbsValueFederal), MARGIN + 3 * quarter, cursor.y, quarter);
  cursor.y -= 22;

  // 2.1.11 — Valores: linha do título + 3 valores, segunda linha com 4.
  drawSectionCell(page, bold, "Valor Total da NFS-e", cursor.y);
  drawField(page, bold, regular, "Valor da Operação / Serviço", formatMoney(data.serviceValue), MARGIN + quarter, cursor.y, quarter);
  drawField(page, bold, regular, "Desconto Incondicionado", formatMoney(data.discountUnconditional), MARGIN + 2 * quarter, cursor.y, quarter);
  drawField(page, bold, regular, "Desconto Condicionado", formatMoney(data.discountConditional), MARGIN + 3 * quarter, cursor.y, quarter);
  cursor.y -= 20;
  drawField(page, bold, regular, "Total das Retenções (ISSQN / Federais)", formatMoney(data.totalRetained), MARGIN, cursor.y, quarter);
  drawField(page, bold, regular, "Valor Líquido da NFS-e", formatMoney(data.netValue), MARGIN + quarter, cursor.y, quarter);
  drawField(page, bold, regular, "Total do IBS/CBS", formatMoney(data.ibsCbsTotal), MARGIN + 2 * quarter, cursor.y, quarter);
  drawField(page, bold, regular, "Valor Líquido da NFS-e + IBS/CBS", formatMoney(data.grossTotalWithIbsCbs), MARGIN + 3 * quarter, cursor.y, quarter, true);
  cursor.y -= 22;

  // BLOCO: INFORMAÇÕES COMPLEMENTARES. O canhoto é opcional
  // (NT 008 § 2.3.3) e foi suprimido para manter uma página A4.
  drawBlockTitle(page, bold, "Informações Complementares", cursor.y);
  cursor.y -= 11;
  const complementary = [
    data.purchaseOrderNumber ? `Pedido / ordem de compra: ${data.purchaseOrderNumber}` : undefined,
    data.complementaryInformation,
    data.municipalAdditionalInformation,
  ].filter(Boolean).join(" | ");
  cursor.y -= drawWrappedField(page, bold, regular, "Dados complementares da NFS-e", complementary || "-", MARGIN, cursor.y, CONTENT_WIDTH);
  if (cursor.y < MARGIN + 14) {
    throw new Error("DANFSe de homologação excede a área útil A4 — layout bloqueado, sem gerar arquivo cortado.");
  }

  // MARCA D'ÁGUA "CANCELADA" (seção 2.5.1) — diagonal, cinza, Arial/Helvetica, nunca abaixo de 50pt.
  if (options.cancelled) {
    page.drawText("CANCELADA", {
      x: PAGE_WIDTH / 2 - 180, y: PAGE_HEIGHT / 2, size: 60, font: bold,
      color: rgb(0.65, 0.65, 0.65), rotate: degrees(35),
    });
  }

  pdf.setTitle(`DANFSe ${data.nfseNumber}`);
  pdf.setSubject(`Documento Auxiliar da NFS-e ${data.accessKey}`);
  return pdf.save({ useObjectStreams: false });
}
