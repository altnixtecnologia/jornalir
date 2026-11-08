import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { winAnsiSafe } from "../contracts/contractTemplatePdf";
import {
  autoLayout,
  initialsOf,
  manualLayout,
  type LayoutResult,
  type PlacedField,
  type SignerSlot,
} from "./signaturePlacement";

/**
 * PDF de assinatura da EMPRESA (Etapa 3A). Duas operações:
 *
 *  1. `prepareSignaturePdf` — gera o PDF PREPARADO: modelo interno (automático)
 *     = páginas originais + "Folha de assinaturas" com as caixas dos signatários;
 *     PDF externo/modelo especial (manual) = o próprio original, sem página
 *     acrescentada, com os campos salvos para a versão do modelo.
 *     NADA é assinado nem carimbado aqui (nenhuma rubrica antes da confirmação).
 *  2. `stampCompanySignature` — SOMENTE após o signatário confirmar: aplica a
 *     rubrica nas páginas, a assinatura (PNG = representação visual), o nome e
 *     a data/hora nos campos dele. Cumulativo: parte do PDF anterior da rodada.
 *
 * Isto NÃO é assinatura digital qualificada (ICP-Brasil/PAdES): é registro
 * gráfico de uma confirmação eletrônica, cuja prova é o conjunto hash +
 * autoria + data/hora + auditoria gravados no banco.
 */

export interface PreparedSignaturePdf {
  bytes: Uint8Array;
  layout: LayoutResult;
  contentPageCount: number;
  mode: "automatic" | "manual";
}

const INK = rgb(0.12, 0.19, 0.29);
const GRAY = rgb(0.4, 0.45, 0.5);
const LIGHT = rgb(0.82, 0.85, 0.88);
const WHITE = rgb(1, 1, 1);

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  supported: Set<number>;
}

async function loadFonts(pdf: PDFDocument): Promise<Fonts> {
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  return { regular, bold, supported: new Set<number>(regular.getCharacterSet()) };
}

function toRect(page: PDFPage, field: PlacedField): { x: number; y: number; width: number; height: number } {
  const { width, height } = page.getSize();
  return {
    x: field.x * width,
    y: height - (field.y + field.height) * height,
    width: field.width * width,
    height: field.height * height,
  };
}

function assertUsable(pdf: PDFDocument): void {
  if (pdf.isEncrypted) throw new Error("PDF protegido por senha não pode receber assinatura.");
  if (pdf.getPageCount() < 1) throw new Error("PDF sem páginas.");
}

export async function prepareSignaturePdf(input: {
  originalBytes: Uint8Array;
  signers: SignerSlot[];
  documentTitle: string;
  /** Campos salvos para a versão do modelo (PDF externo/modelo especial). Sem isto, layout automático. */
  manualFields?: PlacedField[];
}): Promise<PreparedSignaturePdf> {
  const pdf = await PDFDocument.load(input.originalBytes, { updateMetadata: false });
  assertUsable(pdf);
  const contentPageCount = pdf.getPageCount();

  if (input.manualFields && input.manualFields.length > 0) {
    const layout = manualLayout(contentPageCount, input.signers, input.manualFields);
    return { bytes: await pdf.save({ useObjectStreams: false }), layout, contentPageCount, mode: "manual" };
  }

  const layout = autoLayout(contentPageCount, input.signers);
  const fonts = await loadFonts(pdf);
  const safe = (text: string) => winAnsiSafe(text, fonts.supported);
  const first = pdf.getPage(0).getSize();
  const page = pdf.addPage([first.width, first.height]);

  page.drawRectangle({ x: 0, y: first.height - 6, width: first.width, height: 6, color: rgb(0.1, 0.35, 0.56) });
  page.drawText("FOLHA DE ASSINATURAS", { x: 0.06 * first.width, y: first.height - 0.075 * first.height, size: 15, font: fonts.bold, color: INK });
  page.drawText(safe(`Documento: ${input.documentTitle}`).slice(0, 100), { x: 0.06 * first.width, y: first.height - 0.105 * first.height, size: 9, font: fonts.regular, color: GRAY });
  page.drawText(safe("As assinaturas e rubricas abaixo só aparecem após a confirmação eletrônica de cada signatário."), {
    x: 0.06 * first.width, y: first.height - 0.12 * first.height, size: 8, font: fonts.regular, color: GRAY,
  });

  for (const signer of input.signers) {
    const box = layout.fields.find((field) => field.kind === "signature" && field.signerKey === signer.key);
    if (!box) continue;
    const rect = toRect(page, box);
    page.drawRectangle({ x: rect.x, y: rect.y, width: rect.width, height: rect.height, borderWidth: 0.8, borderColor: LIGHT, color: WHITE });
    page.drawText(safe(signer.label).slice(0, 60), { x: rect.x + 6, y: rect.y + rect.height - 14, size: 9, font: fonts.bold, color: INK });
    page.drawText(safe("Assinatura pendente"), { x: rect.x + 6, y: rect.y + 6, size: 8, font: fonts.regular, color: LIGHT });
    const stamp = layout.fields.find((field) => field.kind === "datetime" && field.signerKey === signer.key);
    if (stamp) {
      const stampRect = toRect(page, stamp);
      page.drawLine({ start: { x: stampRect.x, y: stampRect.y }, end: { x: stampRect.x + stampRect.width, y: stampRect.y }, thickness: 0.5, color: LIGHT });
    }
  }

  return { bytes: await pdf.save({ useObjectStreams: false }), layout, contentPageCount, mode: "automatic" };
}

export interface StampInput {
  /** PDF anterior da rodada (preparado ou já com assinaturas de outros signatários). */
  baseBytes: Uint8Array;
  fields: PlacedField[];
  /** Modo automático: a caixa tem texto "pendente" que precisa ser coberto. */
  hasPlaceholders: boolean;
  signerName: string;
  /** Linha sob o nome (cargo/qualificação). */
  signerTitle: string;
  /** PNG cadastrado (representação visual). Opcional: sem ele, usa o nome em texto. */
  signaturePng?: Uint8Array;
  signedAtIso: string;
  baseSha256: string;
}

function formatBrasilia(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }).replace(", ", " ");
}

function fitText(font: PDFFont, text: string, size: number, maxWidth: number): string {
  let current = text;
  while (current.length > 1 && font.widthOfTextAtSize(current, size) > maxWidth) current = current.slice(0, -1);
  return current;
}

export async function stampCompanySignature(input: StampInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(input.baseBytes, { updateMetadata: false });
  assertUsable(pdf);
  const fonts = await loadFonts(pdf);
  const safe = (text: string) => winAnsiSafe(text, fonts.supported);
  const png = input.signaturePng ? await pdf.embedPng(input.signaturePng) : undefined;
  const name = safe(input.signerName);
  const when = formatBrasilia(input.signedAtIso);

  const drawImageFit = (page: PDFPage, rect: { x: number; y: number; width: number; height: number }) => {
    if (!png) return false;
    const scale = Math.min(rect.width / png.width, rect.height / png.height);
    page.drawImage(png, {
      x: rect.x + (rect.width - png.width * scale) / 2,
      y: rect.y + (rect.height - png.height * scale) / 2,
      width: png.width * scale,
      height: png.height * scale,
    });
    return true;
  };

  const hasDatetimeField = input.fields.some((field) => field.kind === "datetime");

  for (const field of input.fields) {
    const page = pdf.getPage(field.page - 1);
    const rect = toRect(page, field);

    if (field.kind === "initials") {
      page.drawRectangle({ x: rect.x, y: rect.y, width: rect.width, height: rect.height, borderWidth: 0.4, borderColor: LIGHT, color: WHITE });
      const inner = { x: rect.x + 2, y: rect.y + 2, width: rect.width - 4, height: rect.height - 4 };
      if (!drawImageFit(page, inner)) {
        const text = initialsOf(input.signerName);
        const size = Math.min(10, inner.height * 0.7);
        page.drawText(text, { x: inner.x + (inner.width - fonts.bold.widthOfTextAtSize(text, size)) / 2, y: inner.y + (inner.height - size) / 2 + 1, size, font: fonts.bold, color: INK });
      }
    } else if (field.kind === "signature") {
      if (input.hasPlaceholders) page.drawRectangle({ x: rect.x + 1, y: rect.y + 1, width: rect.width - 2, height: rect.height - 2, color: WHITE });
      page.drawRectangle({ x: rect.x, y: rect.y, width: rect.width, height: rect.height, borderWidth: 0.8, borderColor: INK });
      const textLines = hasDatetimeField ? 2 : 3;
      const reserved = textLines * 10 + 6;
      const imageArea = { x: rect.x + 6, y: rect.y + reserved, width: rect.width - 12, height: Math.max(rect.height - reserved - 4, 8) };
      if (!drawImageFit(page, imageArea)) {
        page.drawText(fitText(fonts.bold, name, 13, imageArea.width), { x: imageArea.x, y: imageArea.y + imageArea.height / 2 - 4, size: 13, font: fonts.bold, color: INK });
      }
      const maxWidth = rect.width - 12;
      page.drawText(fitText(fonts.bold, name, 8.5, maxWidth), { x: rect.x + 6, y: rect.y + reserved - 10, size: 8.5, font: fonts.bold, color: INK });
      page.drawText(fitText(fonts.regular, safe(input.signerTitle), 7.5, maxWidth), { x: rect.x + 6, y: rect.y + reserved - 20, size: 7.5, font: fonts.regular, color: GRAY });
      if (!hasDatetimeField) {
        page.drawText(fitText(fonts.regular, `Confirmado eletronicamente em ${when} (Brasilia)`, 7, maxWidth), { x: rect.x + 6, y: rect.y + 4, size: 7, font: fonts.regular, color: GRAY });
      }
    } else {
      page.drawRectangle({ x: rect.x, y: rect.y - 1, width: rect.width, height: rect.height + 2, color: WHITE });
      const label = `Em ${when} (Brasilia) - base ${input.baseSha256.slice(0, 10)}`;
      page.drawText(fitText(fonts.regular, label, 7.5, rect.width), { x: rect.x, y: rect.y + 2, size: 7.5, font: fonts.regular, color: GRAY });
      page.drawLine({ start: { x: rect.x, y: rect.y }, end: { x: rect.x + rect.width, y: rect.y }, thickness: 0.5, color: LIGHT });
    }
  }

  return pdf.save({ useObjectStreams: false });
}
