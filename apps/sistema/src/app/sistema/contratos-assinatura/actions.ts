"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { requireAdminOrOwner } from "../../../lib/auth/requireAdminOrOwner";
import { validateLayoutForSaving, type PlacedField } from "../../../lib/signatures/signaturePlacement";
import {
  cancelCompanyRound,
  changeRoundRepresentative,
  confirmCompanySignature,
  openCompanyRound,
  type ConfirmInput,
  type OpenRoundInput,
} from "../../../lib/signatures/companySigning";
import { createCompanySigningDeps } from "../../../lib/signatures/companySigningServer";

/**
 * Assinatura da EMPRESA (Etapa 3A) — fachada das Server Actions. Toda a regra
 * está em `lib/signatures/companySigning.ts` (testada); aqui só se liga o
 * banco/storage reais. Nada envia convite, mensagem ou cobrança.
 * Permissão: preparar/trocar/cancelar = revisor comercial (comercial) ou
 * `contratos_editar` do Financeiro (institucional); assinar = concessão
 * explícita (comercial) ou representante legal vinculado (institucional).
 */

type ActionResult<T = object> = { error: string } | ({ ok: true } & T);

function refresh(): void {
  revalidatePath("/sistema/publicidade/vendas/[id]", "page");
  revalidatePath("/sistema/financeiro/contratos/[id]", "page");
}

function failure(error: unknown): { error: string } {
  return { error: error instanceof Error ? error.message : "Não foi possível concluir a operação." };
}

export async function openCompanySignatureRoundAction(input: OpenRoundInput): Promise<ActionResult<{ roundId: string; reused: boolean }>> {
  try {
    const result = await openCompanyRound(input, createCompanySigningDeps());
    if (!result.ok) return { error: result.error };
    refresh();
    return { ok: true, roundId: result.round.id, reused: result.reused };
  } catch (error) {
    return failure(error);
  }
}

export async function changeCompanySignatureRepresentativeAction(roundId: string, representativeId: string): Promise<ActionResult> {
  try {
    const result = await changeRoundRepresentative(roundId, representativeId, createCompanySigningDeps());
    if (!result.ok) return { error: result.error };
    refresh();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function cancelCompanySignatureRoundAction(roundId: string, reason: string): Promise<ActionResult> {
  try {
    const result = await cancelCompanyRound(roundId, reason, createCompanySigningDeps());
    if (!result.ok) return { error: result.error };
    refresh();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function confirmCompanySignatureAction(input: ConfirmInput): Promise<ActionResult<{ completed: boolean; remaining: number; signedSha256: string }>> {
  try {
    const result = await confirmCompanySignature(input, createCompanySigningDeps());
    if (!result.ok) return { error: result.error };
    refresh();
    return { ok: true, completed: result.completed, remaining: result.remaining, signedSha256: result.signedSha256 };
  } catch (error) {
    return failure(error);
  }
}

/** URL assinada de 90 s para CONFERIR o PDF (preparado ou versão mais recente) antes de assinar. Nunca URL pública. */
export async function getCompanySignatureDocumentUrlAction(roundId: string, which: "prepared" | "latest"): Promise<ActionResult<{ url: string; sha256: string }>> {
  try {
    const deps = createCompanySigningDeps();
    const round = await deps.getRound(roundId);
    if (!round) return { error: "Rodada de assinatura não encontrada." };
    const actor = await deps.actor();
    const canPrepare = (await deps.checkPrepare(round.modality)) === null;
    let canView = canPrepare;
    if (!canView && round.modality === "commercial") canView = (await deps.checkSigningGrant()) === null;
    if (!canView && round.modality === "institutional") {
      const reps = await deps.loadRepresentatives();
      canView = round.requiredRepresentativeIds.some((id) => reps.find((rep) => rep.id === id)?.profile_id === actor.profileId);
    }
    if (!canView) return { error: "Sem permissão para ver este documento." };

    const latest = [...round.signatures].sort((a, b) => b.sequence - a.sequence)[0];
    const target = which === "latest" && latest ? { path: latest.signedPath, sha256: latest.signedSha256 } : { path: round.preparedPath, sha256: round.preparedSha256 };
    const { data, error } = await createSupabaseAdminClient().storage.from("contract-documents").createSignedUrl(target.path, 90);
    if (error || !data?.signedUrl) return { error: "Não foi possível abrir o PDF agora." };
    return { ok: true, url: data.signedUrl, sha256: target.sha256 };
  } catch (error) {
    return failure(error);
  }
}

/** Retorna posições apenas ao administrador/proprietário que edita modelos. */
export async function getSignatureFieldLayoutAction(templateId: string): Promise<ActionResult<{ fields: PlacedField[] }>> {
  try {
    const client = createSupabaseServerClient();
    const guard = await requireAdminOrOwner(client);
    if (!guard.ok) return { error: guard.error };
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(templateId)) return { error: "Modelo inválido." };
    const { data, error } = await client.from("contract_signature_field_layouts")
      .select("fields").eq("template_id", templateId).maybeSingle();
    if (error) return { error: "Não foi possível carregar as posições salvas." };
    return { ok: true, fields: (data?.fields ?? []) as PlacedField[] };
  } catch (error) {
    return failure(error);
  }
}

/** Após a aprovação jurídica, a posição pertence à versão aprovada. */
async function canEditTemplateLayout(client: ReturnType<typeof createSupabaseServerClient>, templateId: string): Promise<string | null> {
  const { data, error } = await client.from("contract_templates")
    .select("document_mode,active,legal_approved_at").eq("id", templateId).maybeSingle();
  if (error || !data) return "Modelo não encontrado.";
  if (data.document_mode !== "fixed_pdf") return "Modelos de texto usam posicionamento automático.";
  if (data.active || data.legal_approved_at) return "O layout desta versão já foi aprovado. Crie nova versão do modelo para alterar.";
  return null;
}

/**
 * Posicionamento MANUAL de campos por versão de modelo (modelos especiais/PDFs
 * externos). Só administrador/proprietário (a RLS repete). Coordenadas
 * normalizadas; reutilizado automaticamente toda vez que um documento dessa
 * versão é preparado para assinatura. Não recria o editor de modelos.
 */
export async function saveSignatureFieldLayoutAction(templateId: string, fields: PlacedField[]): Promise<ActionResult> {
  try {
    const client = createSupabaseServerClient();
    const guard = await requireAdminOrOwner(client);
    if (!guard.ok) return { error: guard.error };
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(templateId)) return { error: "Modelo inválido." };
    const editDenied = await canEditTemplateLayout(client, templateId);
    if (editDenied) return { error: editDenied };
    const checked = validateLayoutForSaving(fields);
    if (!checked.ok) return { error: checked.errors.join(" ") };
    const { error } = await client.from("contract_signature_field_layouts").upsert({ template_id: templateId, fields: checked.fields, updated_by: guard.actorId });
    if (error) return { error: "Não foi possível salvar o posicionamento." };
    await client.from("audit_events").insert({ user_id: guard.actorId, entity_type: "contract_template", entity_id: templateId, action: "signature_field_layout_saved", metadata: { fieldCount: checked.fields.length } });
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function removeSignatureFieldLayoutAction(templateId: string): Promise<ActionResult> {
  try {
    const client = createSupabaseServerClient();
    const guard = await requireAdminOrOwner(client);
    if (!guard.ok) return { error: guard.error };
    const editDenied = await canEditTemplateLayout(client, templateId);
    if (editDenied) return { error: editDenied };
    const { error } = await client.from("contract_signature_field_layouts").delete().eq("template_id", templateId);
    if (error) return { error: "Não foi possível remover o posicionamento." };
    await client.from("audit_events").insert({ user_id: guard.actorId, entity_type: "contract_template", entity_id: templateId, action: "signature_field_layout_removed", metadata: {} });
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}
