"use server";

import { revalidatePath } from "next/cache";
import type { ContractTemplate, ContractTemplateVariable } from "@ir/types";
import { ContractTemplateNotFoundError, ContractTemplateValidationError } from "@ir/core";
import { getContractTemplateService } from "../../../../composition/financeiro";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

const LIST_PATH = "/sistema/financeiro/modelos-contrato";
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
}

export async function createContractTemplateAction(input: ContractTemplateFormInput): Promise<Result<{ template: ContractTemplate }>> {
  try {
    await requireFinanceAccess();
    const template = await getContractTemplateService(createSupabaseServerClient()).create(input);
    revalidatePath(LIST_PATH);
    return { ok: true, template };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

/** "Editar" — nunca sobrescreve a versão atual; sempre cria a próxima versão do mesmo grupo. */
export async function createContractTemplateVersionAction(
  groupId: string, input: ContractTemplateFormInput,
): Promise<Result<{ template: ContractTemplate }>> {
  try {
    await requireFinanceAccess();
    const template = await getContractTemplateService(createSupabaseServerClient()).createNewVersion(groupId, input);
    revalidatePath(LIST_PATH);
    return { ok: true, template };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

/** "Duplicar" — cria um modelo (grupo) independente, nunca uma versão do original. */
export async function duplicateContractTemplateAction(sourceId: string, titleOverride?: string): Promise<Result<{ template: ContractTemplate }>> {
  try {
    await requireFinanceAccess();
    const template = await getContractTemplateService(createSupabaseServerClient()).duplicate(sourceId, titleOverride);
    revalidatePath(LIST_PATH);
    return { ok: true, template };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export async function setContractTemplateActiveAction(id: string, active: boolean): Promise<Result<{ template: ContractTemplate }>> {
  try {
    await requireFinanceAccess();
    const template = await getContractTemplateService(createSupabaseServerClient()).setActive(id, active);
    revalidatePath(LIST_PATH);
    return { ok: true, template };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}
