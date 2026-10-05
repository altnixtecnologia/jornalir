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
 * Analisa um documento (PDF com camada de texto) SEM persistir nada —
 * nem o arquivo (Storage indisponível nesta fase), nem o contrato. Só
 * roda a extração conservadora (ver lib/financeiro/contractDocumentExtraction)
 * e devolve o que encontrou pro usuário conferir no wizard. Usado pelo
 * Passo 1 (Documento) do fluxo "documento primeiro" de novo contrato.
 */
export async function analyzeContractDocumentAction(
  formData: FormData,
): Promise<{ error: string } | ({ ok: true } & ContractDocumentExtractionResult)> {
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Selecione um arquivo." };
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
 * IMEDIATAMENTE depois, na mesma ação (nunca deixa o usuário com um
 * contrato "vazio" esperando o documento ser anexado à parte). Quando o
 * Storage (R2) estiver disponível, o upload real entra bem aqui, entre
 * criar o contrato e chamar addDocument — sem mudar a experiência do
 * usuário no wizard.
 */
export async function createContractWithDocument(
  payload: ContractFormPayload,
  pendingDocument?: PendingDocumentInput,
): Promise<ActionResult> {
  const validationError = validateContractPayload(payload);
  if (validationError) return { error: validationError };

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
      await contractService.addDocument(contractId, {
        documentType: pendingDocument.documentType,
        name: pendingDocument.name,
        fileReference: pendingDocument.fileReference,
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
