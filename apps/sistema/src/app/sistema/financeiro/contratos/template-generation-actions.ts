"use server";

import { revalidatePath } from "next/cache";
import type { ContractDocument, ContractTemplateVariable } from "@ir/types";
import { resolveTemplateVariables } from "@ir/core";
import { getContractService, getContractTemplateService } from "../../../../composition/financeiro";
import { getClientService } from "../../../../composition/clientes";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { buildContractTemplatePdf } from "../../../../lib/contracts/contractTemplatePdf";

const CONTRACT_BUCKET = "contract-documents";
const MAX_GENERATED_PDF_BYTES = 4 * 1024 * 1024; // mesmo limite de uploadContractPdf (actions.ts) — cap de Server Action da Vercel.

type Result<T = never> = { error: string } | ({ ok: true } & T);

/** Mesmo primitivo de signature-actions.ts/modelos-contrato/actions.ts (staff_can_see_module). */
async function requireFinanceAccess(): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) throw new Error("Sessão expirada.");
  const { data: allowed, error } = await supabase.rpc("staff_can_see_module", { p_module: "financeiro" });
  if (error || allowed !== true) throw new Error("Sem permissão para gerar contratos a partir de modelo.");
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível processar a geração do contrato.";
}

/**
 * Pré-visualização (Item 5, Lote 3, Tarefa 4) — resolve os placeholders
 * com os dados REAIS do cliente/contrato já cadastrados, mas NUNCA
 * grava nada. Se faltar campo obrigatório, devolve a lista exata —
 * nunca um PDF com lacuna ou valor inventado.
 */
export async function previewContractFromTemplateAction(input: {
  contractId: string; templateId: string; customValues: Record<string, string>;
}): Promise<Result<{ missingRequired: ContractTemplateVariable[]; resolvedContent: string }>> {
  try {
    await requireFinanceAccess();
    const supabase = createSupabaseServerClient();
    const [contract, template] = await Promise.all([
      getContractService(supabase).getById(input.contractId),
      getContractTemplateService(supabase).getById(input.templateId),
    ]);
    const client = await getClientService(supabase).getById(contract.clientId);
    const result = resolveTemplateVariables({
      content: template.content, variables: template.variables, client, contract,
      customValues: input.customValues, generatedAt: new Date(),
    });
    return { ok: true, missingRequired: result.missingRequired, resolvedContent: result.resolvedContent };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

/**
 * Geração definitiva (Item 5, Lote 3, Tarefas 3/4) — monta o PDF e
 * SEMPRE cria um `contract_documents` NOVO (nunca atualiza/substitui
 * um documento já existente — mesmo princípio de
 * uploadContractDocumentAction em actions.ts: documento anexado nunca
 * é editado depois). Por isso regenerar o mesmo contrato (ex.: depois
 * de corrigir um dado) nunca apaga a versão anterior nem as evidências
 * de assinatura que já apontem pra ela.
 */
export async function generateContractFromTemplateAction(input: {
  contractId: string; templateId: string; customValues: Record<string, string>;
}): Promise<Result<{ document: ContractDocument }>> {
  try {
    await requireFinanceAccess();
    const supabase = createSupabaseServerClient();
    const [contract, template] = await Promise.all([
      getContractService(supabase).getById(input.contractId),
      getContractTemplateService(supabase).getById(input.templateId),
    ]);
    const client = await getClientService(supabase).getById(contract.clientId);
    const generatedAt = new Date();
    const result = resolveTemplateVariables({
      content: template.content, variables: template.variables, client, contract,
      customValues: input.customValues, generatedAt,
    });
    if (result.missingRequired.length > 0) {
      return { error: "Preencha os campos obrigatórios antes de gerar: " + result.missingRequired.map((v) => v.label).join(", ") + "." };
    }

    const pdfBytes = await buildContractTemplatePdf({
      title: template.title,
      content: result.resolvedContent,
      contractReference: contract.reference,
      templateTitle: template.title,
      templateVersion: template.version,
      generatedAt: generatedAt.toISOString(),
    });
    if (pdfBytes.byteLength > MAX_GENERATED_PDF_BYTES) {
      return { error: "O PDF gerado excedeu 4 MB — reduza o conteúdo do modelo antes de gerar." };
    }

    const fileReference = `contracts/${contract.id}/${crypto.randomUUID()}.pdf`;
    const { error: uploadError } = await supabase.storage.from(CONTRACT_BUCKET).upload(fileReference, pdfBytes, {
      contentType: "application/pdf", cacheControl: "0", upsert: false,
    });
    if (uploadError) return { error: "Falha ao armazenar o PDF gerado: " + uploadError.message };

    const document = await getContractService(supabase).addDocument(contract.id, {
      documentType: "contract",
      name: `${template.title} (gerado automaticamente — v${template.version})`,
      fileReference,
      documentDate: generatedAt.toISOString().slice(0, 10),
      templateId: template.id,
      templateVersion: template.version,
    });

    revalidatePath(`/sistema/financeiro/contratos/${contract.id}`);
    return { ok: true, document };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}
