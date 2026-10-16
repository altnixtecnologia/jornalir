"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ContractDocumentType, ContractDocumentExtractedData } from "@ir/types";
import type { ContractInput } from "@ir/core";
import { getContractService } from "../../../../composition/financeiro";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { parseAmount, validateContractPayload, type ContractFormPayload } from "../../../../features/financeiro/contractFormTypes";
import { extractContractDocumentData, type ContractDocumentExtractionResult } from "../../../../lib/financeiro/contractDocumentExtraction";

const LIST_PATH = "/sistema/financeiro/contratos";
const CONTRACT_BUCKET = "contract-documents";
const MAX_CONTRACT_PDF_BYTES = 4 * 1024 * 1024; // Vercel Function request cap: no files above 4 MiB through Server Actions.

function validateContractPdf(file: File): string | null {
  if (!file.name.toLowerCase().endsWith(".pdf")) return "Somente arquivos PDF são aceitos.";
  if (file.type && file.type !== "application/pdf") return "Tipo de arquivo inválido: envie um PDF.";
  if (file.size <= 0 || file.size > MAX_CONTRACT_PDF_BYTES) return "PDF deve ter até 4 MB neste envio.";
  return null;
}

async function uploadContractPdf(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  contractId: string,
  file: File,
): Promise<string> {
  const validationError = validateContractPdf(file);
  if (validationError) throw new Error(validationError);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") {
    throw new Error("Este arquivo não contém a assinatura de cabeçalho de um PDF válido.");
  }
  const fileReference = `contracts/${contractId}/${crypto.randomUUID()}.pdf`;
  const { error } = await supabase.storage.from(CONTRACT_BUCKET).upload(fileReference, bytes, {
    contentType: "application/pdf", cacheControl: "0", upsert: false,
  });
  if (error) throw new Error("Falha ao armazenar o PDF privado: " + error.message);
  return fileReference;
}


type ActionResult = { error: string } | void;

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
}

function toServiceInput(payload: ContractFormPayload): ContractInput {
  return {
    clientId: payload.clientId,
    contractNumber: payload.contractNumber,
    processNumber: payload.processNumber,
    modality: payload.modality,
    biddingReference: payload.biddingReference,
    object: payload.object,
    contractedAmount: parseAmount(payload.contractedAmount),
    startsAt: payload.startsAt || undefined,
    endsAt: payload.endsAt || undefined,
    status: payload.status,
    notes: payload.notes,
  };
}

/**
 * Analisa PDF com camada de texto, sem persistir bytes nem contrato. Só
 * roda a extração conservadora (ver lib/financeiro/contractDocumentExtraction)
 * e devolve o que encontrou pro usuário conferir no wizard. Usado pelo
 * Passo 1 (Documento) do fluxo "documento primeiro" de novo contrato.
 */
export async function analyzeContractDocumentAction(
  formData: FormData,
): Promise<{ error: string } | ({ ok: true } & ContractDocumentExtractionResult)> {
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Selecione um arquivo." };
  const pdfError = validateContractPdf(file);
  if (pdfError) return { error: pdfError };
  const client = createSupabaseServerClient();
  const { data: permission, error: permissionError } = await client.rpc("staff_can_see_module", { p_module: "financeiro" });
  if (permissionError || permission !== true) return { error: "Sem permissão para analisar documentos contratuais." };
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await extractContractDocumentData({ name: file.name, type: file.type, bytes });
    return { ok: true, ...result };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export interface PendingDocumentInput {
  documentType: ContractDocumentType;
  name: string;
  fileReference: string;
  documentDate: string;
  notes: string;
  extractedData?: ContractDocumentExtractedData;
}

/**
 * Passo 4 (Revisão/salvamento) do wizard — cria o contrato e, se houver
 * um documento pendente do Passo 1, persiste o documento vinculado
 * IMEDIATAMENTE depois, na mesma ação. Salva bytes no bucket privado;
 * falha do upload preserva o cadastro e avisa que deve anexar novamente.
 */
export async function createContractWithDocument(
  payload: ContractFormPayload,
  pendingDocument?: PendingDocumentInput,
  documentFormData?: FormData,
): Promise<ActionResult> {
  const validationError = validateContractPayload(payload);
  if (validationError) return { error: validationError };

  if (pendingDocument && !documentFormData?.get("file")) {
    return { error: "Selecione o PDF que será salvo com o contrato." };
  }
  const pdf = documentFormData?.get("file");
  if (pdf instanceof File) {
    const pdfError = validateContractPdf(pdf);
    if (pdfError) return { error: pdfError };
    // O cadastro só deve ser criado depois de confirmar o cabeçalho do PDF.
    const header = new Uint8Array((await pdf.slice(0, 5).arrayBuffer()));
    if (new TextDecoder().decode(header) !== "%PDF-") {
      return { error: "Arquivo inválido: selecione um PDF válido antes de salvar o contrato." };
    }
  }

  const client = createSupabaseServerClient();
  const contractService = getContractService(client);

  let contractId: string;
  try {
    const contract = await contractService.register(toServiceInput(payload));
    contractId = contract.id;
  } catch (error) {
    return { error: toErrorMessage(error) };
  }

  if (pendingDocument && pendingDocument.name.trim()) {
    try {
      const storedFile = pdf instanceof File ? await uploadContractPdf(client, contractId, pdf) : "";
      if (!storedFile) throw new Error("PDF obrigatório para concluir o anexo.");
      await contractService.addDocument(contractId, {
        documentType: pendingDocument.documentType,
        name: pendingDocument.name,
        fileReference: storedFile,
        documentDate: pendingDocument.documentDate || undefined,
        notes: pendingDocument.notes,
        extractedData: pendingDocument.extractedData,
      });
    } catch (error) {
      // O contrato já existe — nunca perder o cadastro por falha no
      // documento. Redireciona normalmente; o usuário anexa de novo na
      // página de detalhe (mesma área usada pra documentos posteriores).
      revalidatePath(LIST_PATH);
      redirect(`${LIST_PATH}/${contractId}?aviso=documento-nao-anexado`);
    }
  }

  revalidatePath(LIST_PATH);
  redirect(`${LIST_PATH}/${contractId}`);
}

export async function createContract(payload: ContractFormPayload): Promise<ActionResult> {
  const validationError = validateContractPayload(payload);
  if (validationError) return { error: validationError };

  let contractId: string;
  try {
    const contract = await getContractService(createSupabaseServerClient()).register(toServiceInput(payload));
    contractId = contract.id;
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(LIST_PATH);
  redirect(`${LIST_PATH}/${contractId}`);
}

export async function updateContract(id: string, payload: ContractFormPayload): Promise<ActionResult> {
  const validationError = validateContractPayload(payload);
  if (validationError) return { error: validationError };

  try {
    await getContractService(createSupabaseServerClient()).update(id, toServiceInput(payload));
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${id}`);
  redirect(`${LIST_PATH}/${id}`);
}

export interface ContractDocumentFormInput {
  documentType: ContractDocumentType;
  name: string;
  fileReference: string;
  documentDate: string;
  notes: string;
  extractedData?: ContractDocumentExtractedData;
}

/**
 * Anexa um documento ao contrato — nunca aplica extractedData aos
 * campos reais do contrato (regra absoluta da Parte 3A, item 11); isso
 * só acontece se o usuário revisar e chamar updateContract explicitamente.
 */
export async function addContractDocumentAction(contractId: string, input: ContractDocumentFormInput): Promise<ActionResult> {
  try {
    await getContractService(createSupabaseServerClient()).addDocument(contractId, {
      documentType: input.documentType,
      name: input.name,
      fileReference: input.fileReference,
      documentDate: input.documentDate || undefined,
      notes: input.notes,
      extractedData: input.extractedData,
    });
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(`${LIST_PATH}/${contractId}`);
}


/** Anexa PDF real, imutável e privado a contrato já existente. */
export async function uploadContractDocumentAction(contractId: string, formData: FormData): Promise<ActionResult> {
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Escolha um PDF antes de salvar." };
  const validationError = validateContractPdf(file);
  if (validationError) return { error: validationError };
  const name = String(formData.get("name") ?? "").trim().slice(0, 180);
  const type = String(formData.get("documentType") ?? "");
  const date = String(formData.get("documentDate") ?? "");
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 1500);
  const allowedTypes = ["contract","amendment","commitment_order","invoice","authorization","other"];
  if (!name) return { error: "Informe o nome/descrição do documento." };
  if (!allowedTypes.includes(type)) return { error: "Tipo do documento inválido." };
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)))) {
    return { error: "Data do documento inválida." };
  }
  const supabase = createSupabaseServerClient();
  try {
    // Acesso real ao contrato antes de gravar bytes privados.
    await getContractService(supabase).getById(contractId);
    const fileReference = await uploadContractPdf(supabase, contractId, file);
    await getContractService(supabase).addDocument(contractId, {
      documentType: type as ContractDocumentType,
      name,
      fileReference,
      documentDate: date || undefined,
      notes,
    });
    revalidatePath(`${LIST_PATH}/${contractId}`);
    return;
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export interface ContractAmendmentFormInput {
  amount: string;
  newEndsAt: string;
  amendmentNumber: string;
  effectiveDate: string;
  documentId: string;
  reason: string;
  notes: string;
}

/**
 * Registra um aditivo (Parte 3B, item 9 + Bloco 2, item 3) — NUNCA
 * altera contracted_amount/ends_at do contrato; o valor/vigência
 * vigentes continuam calculados (computeEffectiveContractAmount/
 * computeEffectiveContractEndsAt) a partir do original + todos os
 * aditivos registrados. `amount` pode ser negativo (redução).
 */
export async function addContractAmendmentAction(contractId: string, input: ContractAmendmentFormInput): Promise<ActionResult> {
  const amount = parseAmount(input.amount);
  if (amount === undefined || amount === 0) return { error: "Informe um valor de aditivo válido (diferente de zero)." };
  try {
    await getContractService(createSupabaseServerClient()).addAmendment(contractId, {
      amount,
      newEndsAt: input.newEndsAt || undefined,
      amendmentNumber: input.amendmentNumber,
      effectiveDate: input.effectiveDate || undefined,
      documentId: input.documentId || undefined,
      reason: input.reason,
      notes: input.notes,
    });
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(`${LIST_PATH}/${contractId}`);
}

export interface CommitmentOrderFormInput {
  number: string;
  issueDate: string;
  amount: string;
  competencyDate: string;
  description: string;
  documentId: string;
  notes: string;
}

/**
 * Registra um empenho (Bloco 2, item 4) — entidade própria, nunca
 * presume que todo título exige um.
 */
export async function addCommitmentOrderAction(contractId: string, input: CommitmentOrderFormInput): Promise<ActionResult> {
  try {
    await getContractService(createSupabaseServerClient()).addCommitmentOrder(contractId, {
      number: input.number,
      issueDate: input.issueDate,
      amount: parseAmount(input.amount),
      competencyDate: input.competencyDate || undefined,
      description: input.description,
      documentId: input.documentId || undefined,
      notes: input.notes,
    });
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
  revalidatePath(`${LIST_PATH}/${contractId}`);
}
