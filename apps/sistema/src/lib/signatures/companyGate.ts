import "server-only";
import { createSupabaseAdminClient } from "../supabase/admin";
import { assertCompanySigned } from "./companySigning";

/**
 * Portão do convite ao CLIENTE (Etapa 3A): só passa depois que a empresa
 * concluiu a assinatura do documento. É a camada de servidor; o banco repete a
 * regra por trigger nas duas tabelas de convites.
 */

/** Institucional: o documento do convite precisa ser a "versão assinada pela empresa" de uma rodada concluída do contrato. */
export async function institutionalCompanyGate(contractId: string, documentId: string): Promise<string | null> {
  const { data, error } = await createSupabaseAdminClient()
    .from("contract_company_signature_rounds")
    .select("status")
    .eq("contract_id", contractId)
    .eq("final_document_id", documentId)
    .eq("status", "completed")
    .limit(1);
  if (error) return "Não foi possível conferir a assinatura da empresa neste documento.";
  const completed = (data ?? [])[0] as { status: "completed" } | undefined;
  if (completed) return null;
  return "O documento precisa estar assinado pela empresa antes do convite ao cliente. Selecione a \"Versão assinada pela empresa\" (prepare e assine pela empresa primeiro).";
}

/** Comercial: o PDF emitido precisa ter rodada da empresa concluída. */
export async function commercialCompanyGate(documentId: string): Promise<string | null> {
  const { data, error } = await createSupabaseAdminClient()
    .from("contract_company_signature_rounds")
    .select("status")
    .eq("commercial_document_id", documentId)
    .neq("status", "cancelled")
    .limit(1);
  if (error) return "Não foi possível conferir a assinatura da empresa neste documento.";
  const round = (data ?? [])[0] as { status: "preparing" | "signing" | "completed" | "cancelled" } | undefined;
  return assertCompanySigned(round ?? null);
}
