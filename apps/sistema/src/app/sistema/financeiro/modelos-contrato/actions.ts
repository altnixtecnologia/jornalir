"use server";

import { revalidatePath } from "next/cache";
import type { ContractTemplate, ContractTemplateDocumentMode, ContractTemplateModality, ContractTemplateVariable } from "@ir/types";
import { ContractTemplateNotFoundError, ContractTemplateValidationError } from "@ir/core";
import { getContractTemplateService } from "../../../../composition/financeiro";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { checkFinanceAction } from "../../../../lib/permissions/checkFinanceAction";
import { requireAdminOrOwner } from "../../../../lib/auth/requireAdminOrOwner";
import { inspectTemplatePdf, MAX_TEMPLATE_DOCUMENT_BYTES } from "../../../../lib/contracts/templateDocument";
import { createTemplateDocumentSignedUrl, uploadTemplateDocument } from "../../../../lib/contracts/templateDocumentStorage";

const LIST_PATH = "/sistema/financeiro/modelos-contrato";
const SETTINGS_LIST_PATH = "/sistema/configuracoes/modelos-contratos";

function revalidateLists(): void {
  revalidatePath(LIST_PATH);
  revalidatePath(SETTINGS_LIST_PATH);
}
type Result<T = never> = { error: string } | ({ ok: true } & T);

/** Mesmo primitivo usado por signature-actions.ts (staff_can_see_module) — nenhum guard compartilhado existe hoje entre os arquivos de Contratos, mesmo padrão local repetido. */
async function requireFinanceAccess(): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) throw new Error("Sessão expirada.");
  const { data: allowed, error } = await supabase.rpc("staff_can_see_module", { p_module: "financeiro" });
  if (error || allowed !== true) throw new Error("Sem permissão para gerenciar modelos de contrato.");
}

function toErrorMessage(error: unknown): string {
  if (error instanceof ContractTemplateValidationError || error instanceof ContractTemplateNotFoundError) return error.message;
  return error instanceof Error ? error.message : "Não foi possível processar o modelo de contrato.";
}

export async function listContractTemplatesAction(): Promise<Result<{ templates: ContractTemplate[] }>> {
  try {
    await requireFinanceAccess();
    const templates = await getContractTemplateService(createSupabaseServerClient()).listCurrentVersions();
    return { ok: true, templates };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export async function listContractTemplateVersionsAction(groupId: string): Promise<Result<{ versions: ContractTemplate[] }>> {
  try {
    await requireFinanceAccess();
    const versions = await getContractTemplateService(createSupabaseServerClient()).listVersionHistory(groupId);
    return { ok: true, versions };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export interface ContractTemplateFormInput {
  title: string;
  description?: string;
  category?: string;
  content: string;
  variables: ContractTemplateVariable[];
  modality?: ContractTemplateModality;
  specificFor?: string;
  documentMode?: ContractTemplateDocumentMode;
  /** Resultado de uploadContractTemplateDocumentAction (documento fixo). O serviço revalida caminho x hash. */
  attachment?: { path: string; sha256: string; bytes: number; note?: string };
}

export async function createContractTemplateAction(input: ContractTemplateFormInput): Promise<Result<{ template: ContractTemplate }>> {
  const permissionError = await checkFinanceAction("contratos_editar");
  if (permissionError) return { error: permissionError };
  try {
    await requireFinanceAccess();
    const template = await getContractTemplateService(createSupabaseServerClient()).create(input);
    revalidateLists();
    return { ok: true, template };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

/** "Editar" — nunca sobrescreve a versão atual; sempre cria a próxima versão do mesmo grupo. */
export async function createContractTemplateVersionAction(
  groupId: string, input: ContractTemplateFormInput,
): Promise<Result<{ template: ContractTemplate }>> {
  const permissionError = await checkFinanceAction("contratos_editar");
  if (permissionError) return { error: permissionError };
  try {
    await requireFinanceAccess();
    const template = await getContractTemplateService(createSupabaseServerClient()).createNewVersion(groupId, input);
    revalidateLists();
    return { ok: true, template };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

/** "Duplicar" — cria um modelo (grupo) independente, nunca uma versão do original. */
export async function duplicateContractTemplateAction(sourceId: string, titleOverride?: string): Promise<Result<{ template: ContractTemplate }>> {
  const permissionError = await checkFinanceAction("contratos_editar");
  if (permissionError) return { error: permissionError };
  try {
    await requireFinanceAccess();
    const template = await getContractTemplateService(createSupabaseServerClient()).duplicate(sourceId, titleOverride);
    revalidateLists();
    return { ok: true, template };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

/**
 * Ativar/desativar em PRODUÇÃO. Ativar exige administrador/proprietário e
 * aprovação jurídica registrada para a versão (o banco repete as duas
 * regras e audita); desativar também é permitido a quem edita contratos.
 */
export async function setContractTemplateActiveAction(id: string, active: boolean): Promise<Result<{ template: ContractTemplate }>> {
  const permissionError = await checkFinanceAction("contratos_editar");
  if (permissionError) return { error: permissionError };
  try {
    await requireFinanceAccess();
    if (active) {
      const admin = await requireAdminOrOwner(createSupabaseServerClient());
      if (!admin.ok) return { error: "Somente administrador ou proprietário ativa um modelo para produção." };
    }
    const template = await getContractTemplateService(createSupabaseServerClient()).setActive(id, active);
    revalidateLists();
    return { ok: true, template };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

/** Habilita/desabilita a minuta para TESTE ("MINUTA DE TESTE — SEM EFEITO CONTRATUAL"). Nunca equivale a produção. */
export async function setContractTemplateTestModeAction(id: string, enabled: boolean): Promise<Result<{ template: ContractTemplate }>> {
  const permissionError = await checkFinanceAction("contratos_editar");
  if (permissionError) return { error: permissionError };
  try {
    await requireFinanceAccess();
    const template = await getContractTemplateService(createSupabaseServerClient()).setTestMode(id, enabled);
    revalidateLists();
    return { ok: true, template };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

/** Aprovação jurídica da VERSÃO: somente administrador/proprietário, com nota e evidência. Não é o clique em "Ativar". */
export async function recordContractTemplateLegalApprovalAction(
  id: string, note: string, evidence: string,
): Promise<Result<{ template: ContractTemplate }>> {
  try {
    await requireFinanceAccess();
    const admin = await requireAdminOrOwner(createSupabaseServerClient());
    if (!admin.ok) return { error: "Somente administrador ou proprietário registra aprovação jurídica." };
    const template = await getContractTemplateService(createSupabaseServerClient()).recordLegalApproval(id, note, evidence);
    revalidateLists();
    return { ok: true, template };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

/** Revoga a aprovação (e desativa a produção na mesma transação). Motivo obrigatório e auditado. */
export async function revokeContractTemplateLegalApprovalAction(id: string, reason: string): Promise<Result<{ template: ContractTemplate }>> {
  try {
    await requireFinanceAccess();
    const admin = await requireAdminOrOwner(createSupabaseServerClient());
    if (!admin.ok) return { error: "Somente administrador ou proprietário revoga aprovação jurídica." };
    const template = await getContractTemplateService(createSupabaseServerClient()).revokeLegalApproval(id, reason);
    revalidateLists();
    return { ok: true, template };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

/**
 * Envia o PDF de um DOCUMENTO FIXO (licitação, órgão público...) para o bucket
 * privado, endereçado por hash. Valida os bytes (não confia no tipo enviado).
 * Não cria o modelo: devolve os metadados para o formulário salvar a versão.
 * Limite explícito: o PDF NÃO mescla variáveis — conferência manual.
 */
export async function uploadContractTemplateDocumentAction(
  formData: FormData,
): Promise<Result<{ attachment: { path: string; sha256: string; bytes: number } }>> {
  const permissionError = await checkFinanceAction("contratos_editar");
  if (permissionError) return { error: permissionError };
  try {
    await requireFinanceAccess();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "Selecione um arquivo PDF." };
    if (file.size > MAX_TEMPLATE_DOCUMENT_BYTES) return { error: "O PDF deve ter no máximo 10 MB." };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const inspected = inspectTemplatePdf(bytes);
    if (!inspected.ok) return { error: inspected.error };
    await uploadTemplateDocument(inspected.path, bytes);
    return { ok: true, attachment: { path: inspected.path, sha256: inspected.sha256, bytes: inspected.bytes } };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

/** URL assinada de 60 s do documento fixo — nunca pública. */
export async function getContractTemplateDocumentUrlAction(id: string): Promise<Result<{ url: string }>> {
  try {
    await requireFinanceAccess();
    const path = await getContractTemplateService(createSupabaseServerClient()).getAttachmentPath(id);
    if (!path) return { error: "Este modelo não tem documento fixo anexo." };
    return { ok: true, url: await createTemplateDocumentSignedUrl(path) };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}
