import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export interface ContractTemplatePdfInput {
  title: string;
  content: string;
  contractReference: string;
  templateTitle: string;
  templateVersion: number;
  generatedAt: string;
}

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 56;
const HEADER_HEIGHT = 46;
const FOOTER_HEIGHT = 32;
const BODY_TOP = PAGE_HEIGHT - MARGIN - HEADER_HEIGHT;
const BODY_BOTTOM = MARGIN + FOOTER_HEIGHT;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BODY_SIZE = 11;
const LINE_HEIGHT = 15;
const TITLE_SIZE = 14;

/** Preservação de acentuação: StandardFonts (WinAnsi/CP1252) cobre todos os diacríticos do português — nunca normaliza/remove acento no corpo do contrato. */
function wrapParagraph(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = words[0];
  for (let i = 1; i < words.length; i += 1) {
    const candidate = `${current} ${words[i]}`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

function drawHeader(page: PDFPage, font: PDFFont, bold: PDFFont, title: string, reference: string): void {
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 6, width: PAGE_WIDTH, height: 6, color: rgb(0.1, 0.35, 0.56) });
  page.drawText(title.slice(0, 90), { x: MARGIN, y: PAGE_HEIGHT - MARGIN + 4, size: TITLE_SIZE, font: bold, color: rgb(0.12, 0.19, 0.29) });
  page.drawText(`Referência: ${reference}`, { x: MARGIN, y: PAGE_HEIGHT - MARGIN - 14, size: 9, font, color: rgb(0.35, 0.4, 0.46) });
  page.drawLine({
    start: { x: MARGIN, y: PAGE_HEIGHT - MARGIN - 22 }, end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - MARGIN - 22 },
    thickness: 0.5, color: rgb(0.82, 0.85, 0.88),
  });
}

/**
 * Gera o PDF do contrato a partir do conteúdo já resolvido (placeholders
 * substituídos — ver contract-template-merge.ts). Layout profissional
 * simples via pdf-lib (única biblioteca de PDF já usada no projeto —
 * nenhuma dependência nova): paginação automática, margens, cabeçalho/
 * rodapé em toda página, numeração "Página X de Y". Nunca interpreta o
 * conteúdo como HTML/script — só desenha o texto literal, linha a linha.
 */
export async function buildContractTemplatePdf(input: ContractTemplatePdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const paragraphs = input.content.split(/\n{2,}/).map((p) => p.trim());
  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = BODY_TOP;

  function newPage(): void {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = BODY_TOP;
  }

  for (const paragraph of paragraphs) {
    const rawLines = paragraph.split("\n");
    for (const rawLine of rawLines) {
      const wrapped = rawLine.trim() ? wrapParagraph(rawLine, font, BODY_SIZE, CONTENT_WIDTH) : [""];
      for (const line of wrapped) {
        if (y < BODY_BOTTOM) newPage();
        page.drawText(line, { x: MARGIN, y, size: BODY_SIZE, font, color: rgb(0.12, 0.12, 0.14) });
        y -= LINE_HEIGHT;
      }
    }
    y -= LINE_HEIGHT * 0.6; // espaço entre parágrafos
    if (y < BODY_BOTTOM) newPage();
  }

  // Cabeçalho/rodapé desenhados DEPOIS de montar todas as páginas — só
  // assim "Página X de Y" sabe o total real sem um pré-cálculo separado.
  const pages = pdf.getPages();
  const generatedLabel = new Date(input.generatedAt).toLocaleString("pt-BR");
  pages.forEach((p, index) => {
    drawHeader(p, font, bold, input.title, input.contractReference);
    p.drawText(`Gerado em ${generatedLabel} — modelo "${input.templateTitle}" v${input.templateVersion}`, {
      x: MARGIN, y: MARGIN - 8, size: 8, font, color: rgb(0.45, 0.48, 0.52),
    });
    const pageLabel = `Página ${index + 1} de ${pages.length}`;
    const pageLabelWidth = font.widthOfTextAtSize(pageLabel, 8);
    p.drawText(pageLabel, { x: PAGE_WIDTH - MARGIN - pageLabelWidth, y: MARGIN - 8, size: 8, font, color: rgb(0.45, 0.48, 0.52) });
  });

  pdf.setTitle(input.title.slice(0, 180));
  pdf.setSubject(`Gerado automaticamente a partir do modelo "${input.templateTitle}" v${input.templateVersion}`);
  return pdf.save({ useObjectStreams: false });
}
