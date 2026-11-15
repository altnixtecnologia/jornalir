import "server-only";
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import type { DanfseData } from "@ir/core/src/nfse/danfse-data";
import { assertDanfseLayoutApproved } from "./danfseReleaseGate";

/**
 * Renderizador PROVISÓRIO de DANFSe para inspeção em homologação visual.
 *
 * NT oficial: 008/2026 v1.02 (14/07/2026), Anexo I, Portal Nacional NFS-e.
 * Não está conforme para uso oficial: faltam tributação federal/IBS/CBS,
 * informações complementares, campos obrigatórios do Simples Nacional,
 * logomarca, layout geométrico e fontes oficiais. Alguns valores atualmente
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
function formatFederalInscription(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 14) return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
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

function drawField(page: PDFPage, bold: PDFFont, regular: PDFFont, label: string, value: string, x: number, y: number, width: number, shaded = false): void {
  if (shaded) page.drawRectangle({ x, y: y - 20, width, height: 20, color: GRAY_SHADING });
  page.drawText(fitTextToWidth(label.toUpperCase(), bold, 6, width - 4), { x: x + 2, y: y - 7, size: 6, font: bold, color: DARK_GRAY });
  const safeValue = fitTextToWidth(value, regular, 7, width - 4);
  page.drawText(safeValue, { x: x + 2, y: y - 17, size: 7, font: regular, color: BLACK });
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
  page.drawText(fitTextToWidth(label.toUpperCase(), bold, 6, width - 4), {
    x: x + 2, y: y - 7, size: 6, font: bold, color: DARK_GRAY,
  });
  lines.forEach((line, i) => page.drawText(line, {
    x: x + 2, y: y - 17 - i * 9, size: 7, font: regular, color: BLACK,
  }));
  return 20 + (lines.length - 1) * 9;
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

  const cursor: Cursor = { y: PAGE_HEIGHT - MARGIN - 4 };

  // CABEÇALHO (seção 2.4.3): logomarca (omitida — ver limitação honesta abaixo),
  // "DANFSe v2.0" / "Documento Auxiliar da NFS-e" ao centro, município/ambiente à direita.
  page.drawText("DANFSe v2.0", { x: PAGE_WIDTH / 2 - 35, y: cursor.y, size: 9, font: bold, color: BLACK });
  cursor.y -= 11;
  page.drawText("Documento Auxiliar da NFS-e", { x: PAGE_WIDTH / 2 - 60, y: cursor.y, size: 9, font: bold, color: BLACK });
  if (data.isHomologation) {
    cursor.y -= 12;
    const warning = "NFS-e SEM VALIDADE JURÍDICA";
    const warningWidth = bold.widthOfTextAtSize(warning, 9);
    page.drawText(warning, { x: PAGE_WIDTH / 2 - warningWidth / 2, y: cursor.y, size: 9, font: bold, color: RED });
  }
  page.drawText(dash(data.emitterMunicipality), { x: PAGE_WIDTH - MARGIN - 150, y: PAGE_HEIGHT - MARGIN - 4, size: 8, font: regular, color: BLACK });
  page.drawText(data.isHomologation ? "Ambiente: Produção Restrita (teste)" : "Ambiente: Produção", {
    x: PAGE_WIDTH - MARGIN - 150, y: PAGE_HEIGHT - MARGIN - 14, size: 6, font: regular, color: DARK_GRAY,
  });

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
  drawBlockTitle(page, bold, "Dados de Identificação da NFS-e", cursor.y);
  cursor.y -= 11;
  page.drawText(`Chave de Acesso: ${data.accessKey}`, { x: MARGIN + 2, y: cursor.y - 9, size: 7, font: regular, color: BLACK });
  cursor.y -= 20;
  const idFieldWidth = contentColumnWidth / 3;
  drawField(page, bold, regular, "Número da NFS-e", data.nfseNumber, MARGIN, cursor.y, idFieldWidth);
  drawField(page, bold, regular, "Competência da NFS-e", formatDanfseDate(data.competencyDate), MARGIN + idFieldWidth, cursor.y, idFieldWidth);
  drawField(page, bold, regular, "Data/Hora da Emissão da NFS-e", formatDanfseDateTime(data.nfseIssuedAt), MARGIN + idFieldWidth * 2, cursor.y, idFieldWidth);
  cursor.y -= 20;
  drawField(page, bold, regular, "Número da DPS", data.dpsNumber, MARGIN, cursor.y, idFieldWidth);
  drawField(page, bold, regular, "Série da DPS", data.dpsSeries, MARGIN + idFieldWidth, cursor.y, idFieldWidth);
  drawField(page, bold, regular, "Data/Hora da Emissão da DPS", formatDanfseDateTime(data.dpsIssuedAt), MARGIN + idFieldWidth * 2, cursor.y, idFieldWidth);
  cursor.y -= 20;
  drawField(page, bold, regular, "Emitente da NFS-e", data.issuerLabel, MARGIN, cursor.y, idFieldWidth * 2, true);
  drawField(page, bold, regular, "Situação da NFS-e", data.statusLabel, MARGIN + idFieldWidth * 2, cursor.y, idFieldWidth);
  cursor.y -= 20;
  drawField(page, bold, regular, "Finalidade", data.purposeLabel, MARGIN, cursor.y, contentColumnWidth);
  cursor.y -= 22;

  // BLOCO: PRESTADOR/FORNECEDOR (seção 2.1.3).
  drawBlockTitle(page, bold, "Prestador / Fornecedor", cursor.y);
  cursor.y -= 11;
  const half = CONTENT_WIDTH / 2;
  drawField(page, bold, regular, "CNPJ/CPF/NIF", formatFederalInscription(data.prestador.federalInscription), MARGIN, cursor.y, half);
  drawField(page, bold, regular, "Inscrição Municipal", dash(data.prestador.municipalRegistration), MARGIN + half, cursor.y, half);
  cursor.y -= 20;
  cursor.y -= drawWrappedField(page, bold, regular, "Nome / Nome Empresarial", data.prestador.name, MARGIN, cursor.y, CONTENT_WIDTH);
  const prestadorAddressHeight = drawWrappedField(page, bold, regular, "Endereço", dash(data.prestador.address), MARGIN, cursor.y, half);
  drawField(page, bold, regular, "Município / UF / CEP", `${dash(data.prestador.ibgeCode)} / ${dash(data.prestador.state)} / ${dash(data.prestador.zipCode)}`, MARGIN + half, cursor.y, half);
  cursor.y -= Math.max(20, prestadorAddressHeight);
  drawField(page, bold, regular, "Telefone", dash(data.prestador.phone), MARGIN, cursor.y, half);
  drawField(page, bold, regular, "Email", dash(data.prestador.email), MARGIN + half, cursor.y, half);
  cursor.y -= 20;
  drawField(page, bold, regular, "Simples Nacional na competência", dash(data.prestadorSimplesOption), MARGIN, cursor.y, half);
  drawField(page, bold, regular, "Regime de apuração pelo SN", dash(data.prestadorSnApuracao), MARGIN + half, cursor.y, half);
  cursor.y -= 22;

  // BLOCO: TOMADOR/ADQUIRENTE (seção 2.1.4) — suprimido com o texto oficial se ausente (seção 2.3.1).
  drawBlockTitle(page, bold, "Tomador / Adquirente da Operação", cursor.y);
  cursor.y -= 11;
  if (!data.tomador) {
    page.drawText("TOMADOR/ADQUIRENTE DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e", { x: MARGIN + 2, y: cursor.y - 9, size: 7, font: regular, color: BLACK });
    cursor.y -= 14;
  } else {
    drawField(page, bold, regular, "CNPJ/CPF/NIF", formatFederalInscription(data.tomador.federalInscription), MARGIN, cursor.y, half);
    const tomadorNameHeight = drawWrappedField(page, bold, regular, "Nome / Nome Empresarial", data.tomador.name, MARGIN + half, cursor.y, half);
    cursor.y -= Math.max(20, tomadorNameHeight);
    const tomadorAddressHeight = drawWrappedField(page, bold, regular, "Endereço", dash(data.tomador.address), MARGIN, cursor.y, half);
    drawField(page, bold, regular, "Município / UF / CEP", `${dash(data.tomador.ibgeCode)} / ${dash(data.tomador.state)} / ${dash(data.tomador.zipCode)}`, MARGIN + half, cursor.y, half);
    cursor.y -= Math.max(20, tomadorAddressHeight);
    drawField(page, bold, regular, "Telefone", dash(data.tomador.phone), MARGIN, cursor.y, half);
    drawField(page, bold, regular, "E-mail", dash(data.tomador.email), MARGIN + half, cursor.y, half);
    cursor.y -= 20;
  }
  cursor.y -= 8;

  // BLOCO: DESTINATÁRIO/INTERMEDIÁRIO — o cenário operacional atual do Jornal IR nunca tem
  // destinatário distinto do tomador, nem intermediário (ver dps-builder.ts, escopo deliberado).
  drawBlockTitle(page, bold, "Destinatário da Operação", cursor.y);
  cursor.y -= 11;
  page.drawText("O DESTINATÁRIO É O PRÓPRIO TOMADOR/ADQUIRENTE DA OPERAÇÃO", { x: MARGIN + 2, y: cursor.y - 9, size: 7, font: regular, color: BLACK });
  cursor.y -= 14;
  drawBlockTitle(page, bold, "Intermediário da Operação", cursor.y);
  cursor.y -= 11;
  page.drawText("INTERMEDIÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e", { x: MARGIN + 2, y: cursor.y - 9, size: 7, font: regular, color: BLACK });
  cursor.y -= 20;

  // BLOCO: SERVIÇO PRESTADO (seção 2.1.7).
  drawBlockTitle(page, bold, "Dados do Serviço Prestado", cursor.y);
  cursor.y -= 11;
  drawField(page, bold, regular, "Código de Tributação Nacional/Municipal", `${dash(data.nationalServiceCode)} / ${dash(data.municipalServiceCode)}`, MARGIN, cursor.y, half);
  drawField(page, bold, regular, "Local da Prestação (IBGE)", dash(data.serviceLocationIbgeCode), MARGIN + half, cursor.y, half);
  cursor.y -= 20;
  cursor.y -= drawWrappedField(page, bold, regular, "Descrição do Serviço", data.serviceDescription, MARGIN, cursor.y, CONTENT_WIDTH);
  const serviceThird = CONTENT_WIDTH / 3;
  drawField(page, bold, regular, "Código da NBS", dash(data.nbsCode), MARGIN, cursor.y, serviceThird);
  drawField(page, bold, regular, "Descrição da tributação nacional", dash(data.nationalServiceDescription), MARGIN + serviceThird, cursor.y, serviceThird);
  drawField(page, bold, regular, "Descrição da tributação municipal", dash(data.municipalServiceDescription), MARGIN + serviceThird * 2, cursor.y, serviceThird);
  cursor.y -= 22;

  // BLOCO: TRIBUTAÇÃO MUNICIPAL / ISSQN (seção 2.1.8).
  drawBlockTitle(page, bold, "Tributação Municipal (ISSQN)", cursor.y);
  cursor.y -= 11;
  const third = CONTENT_WIDTH / 3;
  drawField(page, bold, regular, "BC ISSQN", formatMoney(data.issqnTaxBase), MARGIN, cursor.y, third);
  drawField(page, bold, regular, "Alíquota Aplicada", data.issqnRateApplied !== undefined ? `${data.issqnRateApplied}%` : "-", MARGIN + third, cursor.y, third);
  drawField(page, bold, regular, "ISSQN Apurado", formatMoney(data.issqnAmount), MARGIN + third * 2, cursor.y, third);
  cursor.y -= 20;
  const quarter = CONTENT_WIDTH / 4;
  drawField(page, bold, regular, "Tributação ISSQN", dash(data.issqnTaxationType), MARGIN, cursor.y, quarter);
  drawField(page, bold, regular, "Local de incidência ISSQN", dash(data.issqnIncidenceLocation), MARGIN + quarter, cursor.y, quarter);
  drawField(page, bold, regular, "Retenção ISSQN", dash(data.issqnRetentionType), MARGIN + quarter * 2, cursor.y, quarter);
  drawField(page, bold, regular, "Regime especial ISSQN", dash(data.issqnSpecialTaxRegime), MARGIN + quarter * 3, cursor.y, quarter);
  cursor.y -= 22;

  // BLOCO: TRIBUTAÇÃO FEDERAL (EXCETO CBS).
  drawBlockTitle(page, bold, "Tributação Federal (Exceto CBS)", cursor.y);
  cursor.y -= 11;
  const fifth = CONTENT_WIDTH / 5;
  drawField(page, bold, regular, "IRRF Retido", formatMoney(data.federalIrrf), MARGIN, cursor.y, fifth);
  drawField(page, bold, regular, "Contrib. Previdenciária Retida", formatMoney(data.federalSocialSecurityRetained), MARGIN + fifth, cursor.y, fifth);
  drawField(page, bold, regular, "Contrib. Sociais Retidas", formatMoney(data.federalSocialContribRetained), MARGIN + fifth * 2, cursor.y, fifth);
  drawField(page, bold, regular, "PIS", formatMoney(data.federalPis), MARGIN + fifth * 3, cursor.y, fifth);
  drawField(page, bold, regular, "COFINS", formatMoney(data.federalCofins), MARGIN + fifth * 4, cursor.y, fifth);
  cursor.y -= 23;

  // BLOCO: TRIBUTAÇÃO IBS/CBS. O XML pode não conter o grupo;
  // campos opcionais aparecem como traço, nunca como zero presumido.
  drawBlockTitle(page, bold, "Tributação IBS / CBS", cursor.y);
  cursor.y -= 11;
  drawField(page, bold, regular, "CST / cClassTrib", [dash(data.ibsCbsCst), dash(data.ibsCbsTaxClass)].join(" / "), MARGIN, cursor.y, quarter);
  drawField(page, bold, regular, "Indicador operação", dash(data.ibsCbsOperationIndicator), MARGIN + quarter, cursor.y, quarter);
  drawField(page, bold, regular, "Município incidência", dash(data.ibsCbsLocation), MARGIN + quarter * 2, cursor.y, quarter);
  drawField(page, bold, regular, "Base de cálculo IBS/CBS", formatMoney(data.ibsCbsBase), MARGIN + quarter * 3, cursor.y, quarter);
  cursor.y -= 20;
  drawField(page, bold, regular, "Alíquota IBS UF", data.ibsCbsRateState === undefined ? "-" : `${data.ibsCbsRateState}%`, MARGIN, cursor.y, quarter);
  drawField(page, bold, regular, "Alíquota IBS Municipal", data.ibsCbsRateCity === undefined ? "-" : `${data.ibsCbsRateCity}%`, MARGIN + quarter, cursor.y, quarter);
  drawField(page, bold, regular, "Alíquota CBS", data.ibsCbsRateFederal === undefined ? "-" : `${data.ibsCbsRateFederal}%`, MARGIN + quarter * 2, cursor.y, quarter);
  drawField(page, bold, regular, "Valor IBS Total", formatMoney(data.ibsCbsTotal), MARGIN + quarter * 3, cursor.y, quarter);
  cursor.y -= 20;
  drawField(page, bold, regular, "Valor IBS UF", formatMoney(data.ibsCbsValueState), MARGIN, cursor.y, quarter);
  drawField(page, bold, regular, "Valor IBS Município", formatMoney(data.ibsCbsValueCity), MARGIN + quarter, cursor.y, quarter);
  drawField(page, bold, regular, "Valor CBS", formatMoney(data.ibsCbsValueFederal), MARGIN + quarter * 2, cursor.y, quarter);
  drawField(page, bold, regular, "Alíquotas efetivas UF/Mun/CBS", [dash(data.ibsCbsEffectiveRateState), dash(data.ibsCbsEffectiveRateCity), dash(data.ibsCbsEffectiveRateFederal)].join(" / "), MARGIN + quarter * 3, cursor.y, quarter);
  cursor.y -= 22;

  // BLOCO: VALOR TOTAL DA NFS-e (seção 2.1.11).
  drawBlockTitle(page, bold, "Valor Total da NFS-e", cursor.y);
  cursor.y -= 11;
  drawField(page, bold, regular, "Valor do Serviço", formatMoney(data.serviceValue), MARGIN, cursor.y, third);
  drawField(page, bold, regular, "Total das Retenções", formatMoney(data.totalRetained), MARGIN + third, cursor.y, third);
  drawField(page, bold, regular, "Valor Líquido da NFS-e", formatMoney(data.netValue), MARGIN + third * 2, cursor.y, third, true);
  cursor.y -= 20;
  drawField(page, bold, regular, "Desconto Incondicionado", formatMoney(data.discountUnconditional), MARGIN, cursor.y, quarter);
  drawField(page, bold, regular, "Desconto Condicionado", formatMoney(data.discountConditional), MARGIN + quarter, cursor.y, quarter);
  drawField(page, bold, regular, "Total IBS / CBS", [formatMoney(data.ibsCbsTotal), formatMoney(data.ibsCbsValueFederal)].join(" / "), MARGIN + quarter * 2, cursor.y, quarter);
  drawField(page, bold, regular, "Valor total com IBS/CBS", formatMoney(data.grossTotalWithIbsCbs), MARGIN + quarter * 3, cursor.y, quarter, true);
  cursor.y -= 22;

  // BLOCO: INFORMAÇÕES COMPLEMENTARES. O canhoto é opcional
  // (NT 008 § 2.3.3) e foi suprimido para manter uma página A4.
  drawBlockTitle(page, bold, "Informações Complementares", cursor.y);
  cursor.y -= 11;
  const complementary = [data.complementaryInformation, data.municipalAdditionalInformation].filter(Boolean).join(" | ");
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
