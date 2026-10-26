import "server-only";
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import type { DanfseData } from "@ir/core/src/nfse/danfse-data";

/**
 * Gerador do DANFSe v2.0 (Bloco 2, 26/10/2026) — PDF A4 retrato, uma
 * única página, a partir da Nota Técnica Nº 008/2026 v1.02 (14/07/2026,
 * SE/CGNFS-e), seção 2 (Anexo I). Usa `pdf-lib` (única biblioteca de
 * PDF já usada no projeto, mesmo padrão de
 * `apps/sistema/src/lib/contracts/contractTemplatePdf.ts`) + `qrcode`
 * (única dependência nova — nenhuma biblioteca existente gera QR Code).
 *
 * LIMITAÇÃO HONESTA, documentada pra não inventar precisão que não
 * tenho: a NT 008/2026 v1.02 (seção 2.4.5) descreve o tamanho/posição
 * EXATO (em centímetros) de cada campo através de uma tabela e de
 * "modelos" visuais (imagens) dentro do PDF oficial — a extração de
 * texto desta sessão conseguiu o conteúdo textual completo (todos os
 * blocos/campos/textos obrigatórios, confirmados abaixo), mas não as
 * imagens/tabela de coordenadas pixel a pixel. Este layout organiza
 * TODOS os blocos e campos exigidos pela seção 2.1, na ordem da seção
 * 2.1, com os textos/regras obrigatórios confirmados literalmente
 * (seções 2.3/2.4.3/2.5) — mas a disposição geométrica exata (medidas
 * em cm da seção 2.4.5) é uma aproximação razoável, não uma cópia
 * byte-a-byte do Anexo I. Revisar visualmente contra o Anexo I antes
 * de qualquer uso oficial.
 *
 * Regras confirmadas e implementadas (texto literal da NT 008/2026 v1.02):
 * - "DANFSe v2.0" / "Documento Auxiliar da NFS-e" (seção 2.4.3);
 * - QR Code apontando pra "https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave="
 *   + chave de acesso (seção 2.4.3);
 * - legenda do QR Code: "A autenticidade desta NFS-e pode ser verificada
 *   pela leitura deste código QR ou pela consulta da chave de acesso no
 *   portal nacional da NFS-e" (seção 2.4.3);
 * - "NFS-e SEM VALIDADE JURÍDICA" em vermelho quando tpAmb=2/homologação
 *   (seção 2.4.3, observação);
 * - marca d'água diagonal "CANCELADA" quando a nota foi cancelada
 *   (seção 2.5.1);
 * - supressão de blocos vazios com os textos oficiais exatos (seção 2.3);
 * - campos sem informação no XML impressos como "-" (seção 2.4.5, nota 12).
 */

const PAGE_WIDTH = 595; // A4 @ 72dpi
const PAGE_HEIGHT = 842;
const MARGIN = 20; // ~0,7cm — dentro do mínimo exigido (0,15-0,20cm + folga de segurança de impressão)
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const GRAY_SHADING = rgb(0.95, 0.95, 0.95);
const BLACK = rgb(0, 0, 0);
const RED = rgb(0.8, 0, 0);
const DARK_GRAY = rgb(0.3, 0.3, 0.3);

const QR_BASE_URL = "https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=";
const QR_CAPTION = "A autenticidade desta NFS-e pode ser verificada pela leitura deste código QR ou pela consulta da chave de acesso no portal nacional da NFS-e";

function formatDate(iso: string | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("pt-BR");
}
function formatDateTime(iso: string | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("pt-BR");
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

function drawField(page: PDFPage, bold: PDFFont, regular: PDFFont, label: string, value: string, x: number, y: number, width: number, shaded = false): void {
  if (shaded) page.drawRectangle({ x, y: y - 20, width, height: 20, color: GRAY_SHADING });
  page.drawText(label.toUpperCase(), { x: x + 2, y: y - 7, size: 6, font: bold, color: DARK_GRAY });
  const safeValue = value.length > 90 ? `${value.slice(0, 87)}...` : value;
  page.drawText(safeValue, { x: x + 2, y: y - 17, size: 7, font: regular, color: BLACK });
}

function drawBorder(page: PDFPage): void {
  page.drawRectangle({ x: MARGIN - 4, y: MARGIN - 4, width: PAGE_WIDTH - (MARGIN - 4) * 2, height: PAGE_HEIGHT - (MARGIN - 4) * 2, borderColor: BLACK, borderWidth: 1 });
}

export async function buildDanfsePdf(data: DanfseData, options: { cancelled?: boolean } = {}): Promise<Uint8Array> {
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
  const qrSize = 70;
  const qrX = PAGE_WIDTH - MARGIN - qrSize - 4;
  cursor.y -= 20;
  const qrY = cursor.y - qrSize;
  page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });
  const captionLines = [
    "A autenticidade desta NFS-e pode ser",
    "verificada pela leitura deste código QR ou",
    "pela consulta da chave de acesso no portal",
    "nacional da NFS-e",
  ];
  captionLines.forEach((line, i) => {
    page.drawText(line, { x: qrX - 4, y: qrY - 10 - i * 8, size: 6, font: regular, color: DARK_GRAY });
  });

  const contentColumnWidth = CONTENT_WIDTH - qrSize - 20;

  // BLOCO: DADOS DE IDENTIFICAÇÃO DA NFS-e (seção 2.1.1/2.1.2).
  drawBlockTitle(page, bold, "Dados de Identificação da NFS-e", cursor.y);
  cursor.y -= 11;
  page.drawText(`Chave de Acesso: ${data.accessKey}`, { x: MARGIN + 2, y: cursor.y - 9, size: 7, font: regular, color: BLACK });
  cursor.y -= 20;
  const idFieldWidth = contentColumnWidth / 3;
  drawField(page, bold, regular, "Número da NFS-e", data.nfseNumber, MARGIN, cursor.y, idFieldWidth);
  drawField(page, bold, regular, "Competência da NFS-e", formatDate(data.competencyDate), MARGIN + idFieldWidth, cursor.y, idFieldWidth);
  drawField(page, bold, regular, "Data/Hora da Emissão da NFS-e", formatDateTime(data.nfseIssuedAt), MARGIN + idFieldWidth * 2, cursor.y, idFieldWidth);
  cursor.y -= 20;
  drawField(page, bold, regular, "Número da DPS", data.dpsNumber, MARGIN, cursor.y, idFieldWidth);
  drawField(page, bold, regular, "Série da DPS", data.dpsSeries, MARGIN + idFieldWidth, cursor.y, idFieldWidth);
  drawField(page, bold, regular, "Data/Hora da Emissão da DPS", formatDateTime(data.dpsIssuedAt), MARGIN + idFieldWidth * 2, cursor.y, idFieldWidth);
  cursor.y -= 20;
  drawField(page, bold, regular, "Emitente da NFS-e", data.prestador.name, MARGIN, cursor.y, idFieldWidth * 2, true);
  drawField(page, bold, regular, "Situação da NFS-e", data.statusLabel, MARGIN + idFieldWidth * 2, cursor.y, idFieldWidth);
  cursor.y -= 20;
  drawField(page, bold, regular, "Finalidade", "NFS-e Normal", MARGIN, cursor.y, contentColumnWidth);
  cursor.y -= 22;

  // BLOCO: PRESTADOR/FORNECEDOR (seção 2.1.3).
  drawBlockTitle(page, bold, "Prestador / Fornecedor", cursor.y);
  cursor.y -= 11;
  const half = CONTENT_WIDTH / 2;
  drawField(page, bold, regular, "CNPJ/CPF/NIF", formatFederalInscription(data.prestador.federalInscription), MARGIN, cursor.y, half);
  drawField(page, bold, regular, "Inscrição Municipal", dash(data.prestador.municipalRegistration), MARGIN + half, cursor.y, half);
  cursor.y -= 20;
  drawField(page, bold, regular, "Nome / Nome Empresarial", data.prestador.name, MARGIN, cursor.y, CONTENT_WIDTH);
  cursor.y -= 20;
  drawField(page, bold, regular, "Endereço", dash(data.prestador.address), MARGIN, cursor.y, half);
  drawField(page, bold, regular, "Município / UF / CEP", `${dash(data.prestador.ibgeCode)} / ${dash(data.prestador.state)} / ${dash(data.prestador.zipCode)}`, MARGIN + half, cursor.y, half);
  cursor.y -= 20;
  drawField(page, bold, regular, "Telefone", dash(data.prestador.phone), MARGIN, cursor.y, half);
  drawField(page, bold, regular, "Email", dash(data.prestador.email), MARGIN + half, cursor.y, half);
  cursor.y -= 22;

  // BLOCO: TOMADOR/ADQUIRENTE (seção 2.1.4) — suprimido com o texto oficial se ausente (seção 2.3.1).
  drawBlockTitle(page, bold, "Tomador / Adquirente da Operação", cursor.y);
  cursor.y -= 11;
  if (!data.tomador) {
    page.drawText("TOMADOR/ADQUIRENTE DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e", { x: MARGIN + 2, y: cursor.y - 9, size: 7, font: regular, color: BLACK });
    cursor.y -= 14;
  } else {
    drawField(page, bold, regular, "CNPJ/CPF/NIF", formatFederalInscription(data.tomador.federalInscription), MARGIN, cursor.y, half);
    drawField(page, bold, regular, "Nome / Nome Empresarial", data.tomador.name, MARGIN + half, cursor.y, half);
    cursor.y -= 20;
    drawField(page, bold, regular, "Endereço", dash(data.tomador.address), MARGIN, cursor.y, half);
    drawField(page, bold, regular, "Município / UF / CEP", `${dash(data.tomador.ibgeCode)} / ${dash(data.tomador.state)} / ${dash(data.tomador.zipCode)}`, MARGIN + half, cursor.y, half);
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
  drawField(page, bold, regular, "Descrição do Serviço", data.serviceDescription, MARGIN, cursor.y, CONTENT_WIDTH);
  cursor.y -= 22;

  // BLOCO: TRIBUTAÇÃO MUNICIPAL / ISSQN (seção 2.1.8).
  drawBlockTitle(page, bold, "Tributação Municipal (ISSQN)", cursor.y);
  cursor.y -= 11;
  const third = CONTENT_WIDTH / 3;
  drawField(page, bold, regular, "BC ISSQN", formatMoney(data.issqnTaxBase), MARGIN, cursor.y, third);
  drawField(page, bold, regular, "Alíquota Aplicada", data.issqnRateApplied ? `${data.issqnRateApplied}%` : "-", MARGIN + third, cursor.y, third);
  drawField(page, bold, regular, "ISSQN Apurado", formatMoney(data.issqnAmount), MARGIN + third * 2, cursor.y, third);
  cursor.y -= 22;

  // BLOCO: VALOR TOTAL DA NFS-e (seção 2.1.11).
  drawBlockTitle(page, bold, "Valor Total da NFS-e", cursor.y);
  cursor.y -= 11;
  drawField(page, bold, regular, "Valor do Serviço", formatMoney(data.serviceValue), MARGIN, cursor.y, third);
  drawField(page, bold, regular, "Total das Retenções", formatMoney(data.totalRetained), MARGIN + third, cursor.y, third);
  drawField(page, bold, regular, "Valor Líquido da NFS-e", formatMoney(data.netValue ?? data.serviceValue), MARGIN + third * 2, cursor.y, third, true);
  cursor.y -= 22;

  // CANHOTO (seção 2.1.13, opcional) — incluído pra completude.
  drawBlockTitle(page, bold, "Canhoto", cursor.y);
  cursor.y -= 11;
  page.drawText(`Nº da NFS-e / Chave: ${data.nfseNumber} / ${data.accessKey}`, { x: MARGIN + 2, y: cursor.y - 9, size: 7, font: regular, color: BLACK });
  cursor.y -= 16;
  page.drawLine({ start: { x: MARGIN + 2, y: cursor.y }, end: { x: MARGIN + 180, y: cursor.y }, thickness: 0.5, color: DARK_GRAY });
  page.drawText("Data de Ciência / Identificação e Assinatura", { x: MARGIN + 2, y: cursor.y - 9, size: 6, font: regular, color: DARK_GRAY });

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
