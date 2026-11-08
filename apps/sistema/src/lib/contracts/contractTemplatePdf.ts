import "server-only";
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";

/** Bloco de identificação das partes, desenhado no início da 1ª página (Etapa 2 de Contratos, 08/11/2026). */
export interface ContractPartiesBlock {
  contractor: string[];
  contractee: string[];
}

export interface ContractTemplatePdfInput {
  title: string;
  content: string;
  contractReference: string;
  templateTitle: string;
  templateVersion: number;
  generatedAt: string;
  /** Cabeçalho CONTRATADA / CONTRATANTE (opcional; documentos antigos não passam). */
  parties?: ContractPartiesBlock;
  /**
   * Marca VISÍVEL em TODAS as páginas (tarja diagonal + faixa no topo e no
   * rodapé), ex.: "MINUTA DE TESTE — SEM EFEITO CONTRATUAL". Opcional;
   * quando ausente o PDF sai exatamente como antes.
   */
  watermark?: string;
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

const CHAR_REPLACEMENTS: Record<string, string> = {
  "→": "->", "←": "<-", "↔": "<->", "≥": ">=", "≤": "<=", "≠": "!=", "✓": "v", "✔": "v", "✗": "x", "★": "*",
  "\u00a0": " ", "\u2009": " ", "\u202f": " ", "\u200b": "", "\ufeff": "",
};

/**
 * As fontes padrão do PDF (WinAnsi) não codificam qualquer caractere Unicode
 * (ex.: "→"): desenhar um deles LANÇA erro e derrubaria a geração do
 * documento. Troca por equivalente seguro ("->") ou "?" — nunca falha e
 * nunca altera os acentos do português, que a fonte codifica.
 */
export function winAnsiSafe(text: string, supported: Set<number>): string {
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0) as number;
    if (cp === 10 || cp === 13) { out += ch; continue; }
    if (cp === 9) { out += "    "; continue; }
    if (cp < 32) continue;
    if (supported.has(cp)) { out += ch; continue; }
    out += CHAR_REPLACEMENTS[ch] ?? "?";
  }
  return out;
}

const WATERMARK_COLOR = rgb(0.78, 0.1, 0.1);

/** Faixa no topo/rodapé e tarja diagonal em cada página — nunca some por margem ou conteúdo. Só texto literal. */
function drawWatermark(page: PDFPage, bold: PDFFont, text: string): void {
  const label = text.slice(0, 80);
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 6, width: PAGE_WIDTH, height: 6, color: WATERMARK_COLOR });
  const bannerSize = 9;
  const bannerWidth = bold.widthOfTextAtSize(label, bannerSize);
  page.drawText(label, {
    x: Math.max(MARGIN, (PAGE_WIDTH - bannerWidth) / 2), y: PAGE_HEIGHT - 20, size: bannerSize, font: bold, color: WATERMARK_COLOR,
  });
  page.drawText(label, {
    x: Math.max(MARGIN, (PAGE_WIDTH - bannerWidth) / 2), y: 14, size: bannerSize, font: bold, color: WATERMARK_COLOR,
  });
  // Tarja diagonal (fonte menor se o texto for longo, para caber na página).
  let size = 44;
  while (size > 18 && bold.widthOfTextAtSize(label, size) > 640) size -= 2;
  const width = bold.widthOfTextAtSize(label, size);
  const angle = 45;
  const rad = (angle * Math.PI) / 180;
  page.drawText(label, {
    x: PAGE_WIDTH / 2 - (width / 2) * Math.cos(rad),
    y: PAGE_HEIGHT / 2 - (width / 2) * Math.sin(rad),
    size,
    font: bold,
    color: rgb(0.85, 0.2, 0.2),
    opacity: 0.18,
    rotate: degrees(angle),
  });
}

/** Cabeçalho CONTRATADA/CONTRATANTE em duas colunas; devolve o novo `y`. */
function drawPartiesBlock(page: PDFPage, font: PDFFont, bold: PDFFont, parties: ContractPartiesBlock, startY: number): number {
  const gap = 14;
  const columnWidth = (CONTENT_WIDTH - gap) / 2;
  const size = 9;
  const lineHeight = 12;

  const layout = (lines: string[]): string[] => lines.flatMap((line) => wrapParagraph(line, font, size, columnWidth - 12));
  const left = layout(parties.contractor);
  const right = layout(parties.contractee);
  const rows = Math.max(left.length, right.length, 1);
  const boxHeight = 22 + rows * lineHeight + 8;
  const top = startY;

  for (const [index, lines, title] of [
    [0, left, "CONTRATADA"],
    [1, right, "CONTRATANTE"],
  ] as const) {
    const x = MARGIN + index * (columnWidth + gap);
    page.drawRectangle({
      x, y: top - boxHeight, width: columnWidth, height: boxHeight,
      borderColor: rgb(0.72, 0.76, 0.8), borderWidth: 0.6, color: rgb(0.97, 0.98, 0.99),
    });
    page.drawText(title, { x: x + 6, y: top - 14, size: 9, font: bold, color: rgb(0.12, 0.19, 0.29) });
    lines.forEach((line, lineIndex) => {
      page.drawText(line, { x: x + 6, y: top - 28 - lineIndex * lineHeight, size, font, color: rgb(0.12, 0.12, 0.14) });
    });
  }
  return top - boxHeight - LINE_HEIGHT;
}

/**
 * Gera o PDF do contrato a partir do conteúdo já resolvido (placeholders
 * substituídos — ver contract-template-merge.ts). Layout profissional
 * simples via pdf-lib (única biblioteca de PDF já usada no projeto —
 * nenhuma dependência nova): paginação automática, margens, cabeçalho/
 * rodapé em toda página, numeração "Página X de Y". Nunca interpreta o
 * conteúdo como HTML/script — só desenha o texto literal, linha a linha.
 */
export async function buildContractTemplatePdf(rawInput: ContractTemplatePdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const supported = new Set<number>(font.getCharacterSet());
  const safe = (text: string): string => winAnsiSafe(text, supported);
  const input: ContractTemplatePdfInput = {
    ...rawInput,
    title: safe(rawInput.title),
    content: safe(rawInput.content),
    contractReference: safe(rawInput.contractReference),
    templateTitle: safe(rawInput.templateTitle),
    parties: rawInput.parties
      ? { contractor: rawInput.parties.contractor.map(safe), contractee: rawInput.parties.contractee.map(safe) }
      : undefined,
    watermark: rawInput.watermark ? safe(rawInput.watermark) : undefined,
  };

  const paragraphs = input.content.split(/\n{2,}/).map((p) => p.trim());
  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = BODY_TOP;

  if (input.parties) {
    y = drawPartiesBlock(page, font, bold, input.parties, y);
  }

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

  if (input.watermark) {
    pages.forEach((p) => drawWatermark(p, bold, input.watermark!));
  }

  pdf.setTitle(input.title.slice(0, 180));
  pdf.setSubject(`Gerado automaticamente a partir do modelo "${input.templateTitle}" v${input.templateVersion}`);
  return pdf.save({ useObjectStreams: false });
}
