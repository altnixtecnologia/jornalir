import "server-only";
import { Buffer } from "node:buffer";

export interface ReceiptPdfInput {
  signerName: string;
  signerEmail: string;
  documentName: string;
  contractNumber: string;
  signedAt: string;
  originalSha256: string;
  invitationId: string;
  jpegBytes: Buffer;
  jpegWidth: number;
  jpegHeight: number;
}

function normalizePdfText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, " ").replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/**
 * PDF autônomo de evidência, distinto do PDF original.
 * A assinatura gráfica é embutida como imagem JPEG. O PDF NÃO afirma
 * possuir certificado ICP-Brasil; o original permanece imutável.
 */
export function buildSignatureReceiptPdf(input: ReceiptPdfInput): Buffer {
  const lines: Array<[number, number, number, string]> = [
    [45, 785, 18, "COMPROVANTE DE ASSINATURA ELETRONICA"],
    [45, 750, 11, "Documento original: " + input.documentName.slice(0, 80)],
    [45, 727, 11, "Contrato: " + input.contractNumber.slice(0, 80)],
    [45, 704, 11, "Signatario: " + input.signerName.slice(0, 90)],
    [45, 681, 11, "E-mail informado: " + input.signerEmail.slice(0, 90)],
    [45, 658, 11, "Aceite em: " + new Date(input.signedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) + " (Brasilia)"],
    [45, 634, 10, "Consentimento: visualizacao do documento e assinatura eletronica - versao contract-v1"],
    [45, 610, 10, "Identificador da solicitacao: " + input.invitationId],
    [45, 570, 11, "Representacao grafica da assinatura:"],
    [45, 313, 10, "SHA-256 do PDF original:"],
    [45, 294, 9, input.originalSha256],
    [45, 263, 10, "O PDF original foi preservado sem modificacoes e pode ser consultado no cadastro."],
    [45, 242, 10, "Este comprovante registra o aceite e a evidencia grafica em arquivo separado."],
    [45, 220, 10, "Nao constitui, por si so, uma assinatura digital qualificada ICP-Brasil."],
  ];
  const content = lines.map(([x, y, fontSize, text]) =>
    "BT /F1 " + fontSize + " Tf 1 0 0 1 " + x + " " + y + " Tm (" + normalizePdfText(text) + ") Tj ET",
  ).join("\n") + "\nq 430 0 0 155 60 380 cm /Sig Do Q\n";
  const contentBytes = Buffer.from(content, "ascii");
  const objects: Buffer[] = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    Buffer.from("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> /XObject << /Sig 6 0 R >> >> /Contents 5 0 R >>"),
    Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
    Buffer.concat([Buffer.from("<< /Length " + contentBytes.length + " >>\nstream\n"), contentBytes, Buffer.from("\nendstream")]),
    Buffer.concat([
      Buffer.from("<< /Type /XObject /Subtype /Image /Width " + input.jpegWidth +
        " /Height " + input.jpegHeight + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + input.jpegBytes.length + " >>\nstream\n"),
      input.jpegBytes, Buffer.from("\nendstream"),
    ]),
  ];
  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1")];
  const offsets = [0];
  let length = chunks[0].length;
  for (let i = 0; i < objects.length; i++) {
    offsets.push(length);
    const obj = Buffer.concat([Buffer.from((i + 1) + " 0 obj\n"), objects[i], Buffer.from("\nendobj\n")]);
    chunks.push(obj);
    length += obj.length;
  }
  const xrefOffset = length;
  const xref = ["xref\n0 " + (objects.length + 1) + "\n", "0000000000 65535 f \n"];
  for (const offset of offsets.slice(1)) xref.push(String(offset).padStart(10, "0") + " 00000 n \n");
  xref.push("trailer\n<< /Size " + (objects.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xrefOffset + "\n%%EOF\n");
  chunks.push(Buffer.from(xref.join(""), "ascii"));
  return Buffer.concat(chunks);
}
