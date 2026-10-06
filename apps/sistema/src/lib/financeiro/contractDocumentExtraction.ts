import "server-only";
import { extractPageTextItems, hasTextLayer, loadPdfDocument } from "@ir/pdf-extraction";
import { isValidCnpj } from "@ir/core";
import type { ContractDocumentExtractedData } from "@ir/types";

/**
 * Extração conservadora de PDF com camada de texto (Parte 3A, ajuste
 * final) — sem OCR, sem serviço externo pago. Reaproveita só a camada
 * de texto bruta do pacote de extração de PDF já existente
 * (`loadPdfDocument`/`extractPageTextItems`/`hasTextLayer`), nunca a
 * lógica de colunas/grupos de artigo (essa é específica de layout de
 * jornal e não serve para um contrato). REGRA ABSOLUTA: um campo só
 * entra no resultado quando o padrão é razoavelmente inequívoco (nunca
 * "primeiro número que aparece") — na dúvida, fica de fora.
 */

export type ExtractionFieldKey = keyof ContractDocumentExtractedData;

export interface ContractDocumentExtractionResult {
  /** false quando o PDF não tem camada de texto real (provável escaneado/imagem) — precisará de OCR numa fase futura, não implementado aqui. */
  hasTextLayer: boolean;
  fields: ContractDocumentExtractedData;
  /** Indicação simples de confiança — só "high" (padrão validado, ex.: CNPJ com dígito verificador correto) é usado nesta fase; ausência de entrada = extraído por padrão textual comum, sem validação extra. Guardado para evolução futura, sem complicar a UI agora. */
  fieldConfidence: Partial<Record<ExtractionFieldKey, "high">>;
}

const EMPTY_RESULT: ContractDocumentExtractionResult = { hasTextLayer: false, fields: {}, fieldConfidence: {} };

/** Reconstrói linhas a partir dos itens de texto brutos — só agrupamento por `hasEOL`, sem nenhuma interpretação de layout (colunas etc., que não fazem sentido para um contrato). */
async function extractPlainText(bytes: Uint8Array): Promise<{ text: string; hasRealText: boolean }> {
  const doc = await loadPdfDocument(bytes);
  const lines: string[] = [];
  let anyRealText = false;

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const items = await extractPageTextItems(page);
    if (hasTextLayer(items)) anyRealText = true;

    let currentLine = "";
    for (const item of items) {
      currentLine += item.text;
      if (item.hasEOL) {
        lines.push(currentLine);
        currentLine = "";
      }
    }
    if (currentLine.trim()) lines.push(currentLine);
  }

  return { text: lines.join("\n"), hasRealText: anyRealText };
}

function parseBrazilianAmount(raw: string): number | undefined {
  const normalized = raw.replace(/\./g, "").replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : undefined;
}

function parseBrazilianDate(raw: string): string | undefined {
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return undefined;
  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) {
    return undefined; // data inválida (ex.: 31/02) — nunca "corrige" sozinho
  }
  return date.toISOString().slice(0, 10);
}

/** Único match, nunca o primeiro de vários conflitantes — múltiplos matches de grupos diferentes ficam de fora por segurança. */
function singleMatch(text: string, pattern: RegExp): string | undefined {
  const matches = [...text.matchAll(pattern)];
  if (matches.length !== 1) return undefined;
  return matches[0][1]?.trim() || undefined;
}

const MODALITY_KEYWORDS = ["pregão eletrônico", "pregão presencial", "pregão", "tomada de preços", "concorrência", "dispensa de licitação", "dispensa", "inexigibilidade", "convite", "concurso"];

function extractFields(text: string): { fields: ContractDocumentExtractedData; fieldConfidence: Partial<Record<ExtractionFieldKey, "high">> } {
  const fields: ContractDocumentExtractedData = {};
  const fieldConfidence: Partial<Record<ExtractionFieldKey, "high">> = {};
  const normalized = text.replace(/\r/g, "");

  // CNPJ — só aceito com dígito verificador válido (nunca um número "parecido").
  const cnpjMatches = [...normalized.matchAll(/\b(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/g)]
    .map((match) => match[1].replace(/\D/g, ""))
    .filter((digits) => isValidCnpj(digits));
  const uniqueCnpjs = [...new Set(cnpjMatches)];
  if (uniqueCnpjs.length === 1) {
    fields.organizationCnpj = uniqueCnpjs[0];
    fieldConfidence.organizationCnpj = "high";
  }

  const contractNumber = singleMatch(normalized, /contrato\s*(?:administrativo)?\s*n[ºo°]?\s*[:\-]?\s*([0-9][0-9./\-]{2,})/i);
  if (contractNumber) fields.contractNumber = contractNumber;

  const processNumber = singleMatch(normalized, /processo\s*(?:administrativo|licitatório)?\s*n[ºo°]?\s*[:\-]?\s*([0-9][0-9./\-]{2,})/i);
  if (processNumber) fields.processNumber = processNumber;

  const biddingReference = singleMatch(
    normalized,
    /(?:pregão|licitação|tomada de preços|concorrência|dispensa|inexigibilidade)\s*(?:eletrônico|presencial)?\s*n[ºo°]?\s*[:\-]?\s*([0-9][0-9./\-]{2,})/i,
  );
  if (biddingReference) fields.biddingReference = biddingReference;

  const lowerText = normalized.toLowerCase();
  const foundModalities = MODALITY_KEYWORDS.filter((keyword) => lowerText.includes(keyword));
  // Prioriza o termo mais específico (ex.: "pregão eletrônico" em vez de só "pregão").
  if (foundModalities.length > 0) {
    const mostSpecific = foundModalities.sort((a, b) => b.length - a.length)[0];
    fields.modality = mostSpecific.replace(/^(.)/, (letter) => letter.toUpperCase());
  }

  const commitmentOrder = singleMatch(normalized, /empenho\s*n[ºo°]?\s*[:\-]?\s*([0-9][0-9./\-]{2,})/i);
  if (commitmentOrder) fields.commitmentOrder = commitmentOrder;

  const amountMatch = singleMatch(normalized, /valor\s+(?:global|total|contratado|do\s+contrato)[^\d]{0,30}r?\$?\s*([\d.,]{4,})/i);
  if (amountMatch) {
    const parsed = parseBrazilianAmount(amountMatch);
    if (parsed !== undefined) fields.contractedAmount = parsed;
  }

  // Vigência: só aceito quando exatamente duas datas aparecem perto da
  // palavra "vigência" — nunca "primeira e última data do documento".
  const vigenciaIndex = lowerText.indexOf("vigência");
  if (vigenciaIndex >= 0) {
    const windowText = normalized.slice(Math.max(0, vigenciaIndex - 20), vigenciaIndex + 200);
    const dates = [...windowText.matchAll(/\d{2}\/\d{2}\/\d{4}/g)].map((match) => match[0]);
    if (dates.length === 2) {
      const [first, second] = dates.map(parseBrazilianDate);
      if (first && second) {
        fields.startsAt = first <= second ? first : second;
        fields.endsAt = first <= second ? second : first;
      }
    }
  }

  const organizationName = singleMatch(normalized, /contratante\s*:\s*([^\n]{3,120})/i);
  if (organizationName) fields.organizationName = organizationName;

  const objectMatch = singleMatch(normalized, /objeto\s*:\s*([^\n]{10,400})/i);
  if (objectMatch) fields.object = objectMatch;

  return { fields, fieldConfidence };
}

/**
 * Ponto de entrada único — detecta se o arquivo é PDF com camada de
 * texto real; quando não é (imagem, PDF escaneado, outro formato),
 * retorna hasTextLayer=false sem tentar nada (nunca inventa dado de
 * um documento que não tem texto extraível).
 */
export async function extractContractDocumentData(file: { name: string; type: string; bytes: Uint8Array }): Promise<ContractDocumentExtractionResult> {
  const looksLikePdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!looksLikePdf) return EMPTY_RESULT;

  let plainText: { text: string; hasRealText: boolean };
  try {
    plainText = await extractPlainText(file.bytes);
  } catch {
    // PDF corrompido/não suportado pelo parser — nunca falha a tela por
    // isso, só informa que não há texto extraível.
    return EMPTY_RESULT;
  }

  if (!plainText.hasRealText) {
    // PDF sem camada de texto real = provável escaneado/imagem — precisará
    // de OCR numa fase futura (ver estratégia já prevista na importação dos
    // PDFs do jornal); não implementado aqui.
    return { hasTextLayer: false, fields: {}, fieldConfidence: {} };
  }

  const { fields, fieldConfidence } = extractFields(plainText.text);
  return { hasTextLayer: true, fields, fieldConfidence };
}
