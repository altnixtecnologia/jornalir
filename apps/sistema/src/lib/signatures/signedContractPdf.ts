import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface SignedPdfInput {
  originalBytes: Uint8Array;
  signatureJpeg: Uint8Array;
  documentName: string;
  signerName: string;
  signerEmail: string;
  signedAt: string;
  originalSha256: string;
  invitationId: string;
}

function safeText(s: string): string {
  // Helvetica WinAnsi cannot encode exotic Unicode. Do not discard pages;
  // normalize only the displayed signature evidence sheet.
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, " ").slice(0, 110);
}

/**
 * Preserva TODAS as páginas do PDF original e acrescenta uma folha
 * de evidência gráfica de assinatura. Este arquivo NÃO é uma assinatura
 * digital ICP-Brasil: não há transformação criptográfica PAdES.
 * Um comprovante autônomo também é salvo para auditoria.
 */
export async function buildSignedContractPdf(input: SignedPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(input.originalBytes, { updateMetadata: false });
  if (!pdf.getPageCount()) throw new Error("PDF original sem páginas.");
  if (pdf.isEncrypted) throw new Error("PDF protegido não pode receber folha de aceite.");
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.12, 0.19, 0.29);
  const gray = rgb(0.35, 0.4, 0.46);
  const line = (value: string, y: number, size = 11, emphasized = false) =>
    page.drawText(safeText(value), { x: 48, y, size, font: emphasized ? bold : font, color: emphasized ? ink : gray });

  page.drawRectangle({ x: 40, y: 798, width: 515, height: 5, color: rgb(0.1, 0.35, 0.56) });
  line("REGISTRO DE ACEITE E ASSINATURA ELETRONICA", 765, 15, true);
  line("Esta folha foi anexada ao final das paginas do documento conferido.", 733, 10);
  line("Documento: " + input.documentName, 699);
  line("Signatario: " + input.signerName, 672);
  line("Email confirmado: " + input.signerEmail, 645);
  const time = new Date(input.signedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  line("Data de aceite: " + time + " (Brasilia)", 618);
  line("Versao do consentimento: contract-v1", 591);
  line("Representacao grafica da assinatura:", 549, 12, true);
  page.drawRectangle({ x: 47, y: 332, width: 501, height: 187, borderWidth: 1, borderColor: rgb(0.82,0.85,0.88) });
  const img = await pdf.embedJpg(input.signatureJpeg);
  const scale = Math.min(470 / img.width, 155 / img.height);
  page.drawImage(img, { x: 60 + (470 - img.width * scale) / 2,
    y: 350 + (155 - img.height * scale) / 2,
    width: img.width * scale, height: img.height * scale });
  line("SHA-256 do arquivo original:", 288, 10, true);
  line(input.originalSha256, 270, 9);
  line("Convite: " + input.invitationId, 236, 9);
  line("A imagem e o hash demonstram o registro de aceite; nao equivalem,", 193, 10);
  line("isoladamente, a uma assinatura digital qualificada ICP-Brasil.", 176, 10);
  line("O PDF original permanece imutavel e esta folha foi acrescentada.", 150, 10);
  pdf.setTitle(safeText("Versão para conferência assinada - " + input.documentName));
  pdf.setSubject("Registro eletrônico de aceite; nao ICP-Brasil");
  return pdf.save({ useObjectStreams: false });
}
