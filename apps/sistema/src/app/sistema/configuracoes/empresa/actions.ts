"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { requireAdminOrOwner } from "../../../../lib/auth/requireAdminOrOwner";
import {
  validateCompanyProfile,
  validateLegalRepresentative,
  type CompanyProfileInput,
  type LegalRepresentativeInput,
} from "../../../../lib/contracts/companySettingsValidation";
import { MAX_SIGNATURE_PNG_BYTES, storeSignatureImage } from "../../../../lib/contracts/signatureImage";
import { createSignatureSignedUrl, uploadSignatureObject } from "../../../../lib/contracts/signatureImageStorage";

/**
 * Configurações → Dados da empresa e representante legal (Etapa 1 do plano
 * de Contratos, 08/11/2026). TODA ação exige administrador/proprietário (o
 * banco repete via RLS) e a auditoria é gravada por trigger no próprio banco
 * (audit_events, sem PII). Nada aqui envia contrato, cobra ou assina.
 */

const PATH = "/sistema/configuracoes/empresa";
type Result<T = object> = { error: string; fieldErrors?: Record<string, string> } | ({ ok: true } & T);

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function saveCompanyProfileAction(input: CompanyProfileInput): Promise<Result> {
  const client = createSupabaseServerClient();
  const guard = await requireAdminOrOwner(client);
  if (!guard.ok) return { error: guard.error };
  const checked = validateCompanyProfile(input);
  if (!checked.ok) return { error: "Revise os campos destacados.", fieldErrors: checked.errors };
  const v = checked.value;
  try {
    const { error } = await client.from("company_profile").upsert(
      {
        singleton: true,
        legal_name: v.legalName,
        trade_name: v.tradeName ?? null,
        cnpj: v.cnpj,
        state_registration: v.stateRegistration ?? null,
        municipal_registration: v.municipalRegistration ?? null,
        address_street: v.addressStreet,
        address_number: v.addressNumber ?? null,
        address_complement: v.addressComplement ?? null,
        address_district: v.addressDistrict ?? null,
        address_city: v.addressCity,
        address_state: v.addressState,
        address_zip: v.addressZip ?? null,
        email: v.email ?? null,
        phone: v.phone ?? null,
        website: v.website ?? null,
        updated_by: guard.actorId,
      },
      { onConflict: "singleton" },
    );
    if (error) return { error: "Não foi possível salvar os dados da empresa." };
    revalidatePath(PATH);
    return { ok: true };
  } catch (error) {
    return { error: toMessage(error) };
  }
}

export async function saveLegalRepresentativeAction(id: string | null, input: LegalRepresentativeInput): Promise<Result<{ id: string }>> {
  const client = createSupabaseServerClient();
  const guard = await requireAdminOrOwner(client);
  if (!guard.ok) return { error: guard.error };
  if (id !== null && !UUID_RE.test(id)) return { error: "Representante inválido." };
  const checked = validateLegalRepresentative(input);
  if (!checked.ok) return { error: "Revise os campos destacados.", fieldErrors: checked.errors };
  const v = checked.value;
  const row = {
    full_name: v.fullName,
    cpf: v.cpf,
    role_title: v.roleTitle,
    nationality: v.nationality ?? null,
    email: v.email ?? null,
    phone: v.phone ?? null,
    representation_rule: v.representationRule,
    powers_description: v.powersDescription,
    powers_evidence_note: v.powersEvidenceNote ?? null,
    powers_valid_from: v.powersValidFrom ?? null,
    powers_valid_until: v.powersValidUntil ?? null,
    is_default: v.isDefault,
    updated_by: guard.actorId,
  };
  try {
    // No máximo um representante padrão ativo (índice único parcial no banco).
    if (v.isDefault) {
      let clear = client.from("company_legal_representatives").update({ is_default: false, updated_by: guard.actorId }).eq("is_default", true);
      if (id) clear = clear.neq("id", id);
      const { error: clearError } = await clear;
      if (clearError) return { error: "Não foi possível definir o representante padrão." };
    }
    if (id) {
      const { data, error } = await client
        .from("company_legal_representatives")
        .update(row)
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error || !data) return { error: "Não foi possível salvar o representante." };
      revalidatePath(PATH);
      return { ok: true, id: data.id as string };
    }
    const { data, error } = await client
      .from("company_legal_representatives")
      .insert({ ...row, created_by: guard.actorId })
      .select("id")
      .single();
    if (error || !data) return { error: "Não foi possível cadastrar o representante." };
    revalidatePath(PATH);
    return { ok: true, id: data.id as string };
  } catch (error) {
    return { error: toMessage(error) };
  }
}

export async function setLegalRepresentativeActiveAction(id: string, active: boolean): Promise<Result> {
  const client = createSupabaseServerClient();
  const guard = await requireAdminOrOwner(client);
  if (!guard.ok) return { error: guard.error };
  if (!UUID_RE.test(id)) return { error: "Representante inválido." };
  try {
    const { data, error } = await client
      .from("company_legal_representatives")
      .update(active ? { active: true, updated_by: guard.actorId } : { active: false, is_default: false, updated_by: guard.actorId })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error || !data) return { error: "Não foi possível alterar o representante." };
    revalidatePath(PATH);
    return { ok: true };
  } catch (error) {
    return { error: toMessage(error) };
  }
}

/** FormData: `representativeId` + `file` (PNG). Valida os bytes (não confia no tipo enviado) e grava em bucket privado, versionado por hash. */
export async function uploadRepresentativeSignatureAction(formData: FormData): Promise<Result<{ sha256: string }>> {
  const client = createSupabaseServerClient();
  const guard = await requireAdminOrOwner(client);
  if (!guard.ok) return { error: guard.error };
  const representativeId = String(formData.get("representativeId") ?? "");
  const file = formData.get("file");
  if (!UUID_RE.test(representativeId)) return { error: "Representante inválido." };
  if (!(file instanceof File) || file.size === 0) return { error: "Selecione um arquivo PNG." };
  if (file.size > MAX_SIGNATURE_PNG_BYTES) return { error: "A imagem da assinatura deve ter no máximo 512 KB." };

  const { data: existing, error: lookupError } = await client
    .from("company_legal_representatives")
    .select("id")
    .eq("id", representativeId)
    .maybeSingle();
  if (lookupError || !existing) return { error: "Representante não encontrado." };

  const stored = await storeSignatureImage(
    { kind: "representative", ownerId: representativeId, bytes: new Uint8Array(await file.arrayBuffer()) },
    {
      upload: uploadSignatureObject,
      persist: async (meta) => {
        const { data, error } = await client
          .from("company_legal_representatives")
          .update({
            signature_path: meta.path,
            signature_sha256: meta.sha256,
            signature_bytes: meta.sizeBytes,
            signature_updated_at: new Date().toISOString(),
            signature_updated_by: guard.actorId,
            updated_by: guard.actorId,
          })
          .eq("id", representativeId)
          .select("id")
          .maybeSingle();
        if (error || !data) throw new Error("Não foi possível registrar a assinatura do representante.");
      },
    },
  );
  if (!stored.ok) return { error: stored.error };
  revalidatePath(PATH);
  return { ok: true, sha256: stored.sha256 };
}

export async function removeRepresentativeSignatureAction(representativeId: string): Promise<Result> {
  const client = createSupabaseServerClient();
  const guard = await requireAdminOrOwner(client);
  if (!guard.ok) return { error: guard.error };
  if (!UUID_RE.test(representativeId)) return { error: "Representante inválido." };
  try {
    const { data, error } = await client
      .from("company_legal_representatives")
      .update({
        signature_path: null,
        signature_sha256: null,
        signature_bytes: null,
        signature_updated_at: new Date().toISOString(),
        signature_updated_by: guard.actorId,
        updated_by: guard.actorId,
      })
      .eq("id", representativeId)
      .select("id")
      .maybeSingle();
    if (error || !data) return { error: "Não foi possível remover a assinatura." };
    revalidatePath(PATH);
    return { ok: true };
  } catch (error) {
    return { error: toMessage(error) };
  }
}

/** URL assinada de 60 s para conferir a assinatura (nunca pública, nunca guardada). */
export async function getRepresentativeSignatureUrlAction(representativeId: string): Promise<Result<{ url: string }>> {
  const client = createSupabaseServerClient();
  const guard = await requireAdminOrOwner(client);
  if (!guard.ok) return { error: guard.error };
  if (!UUID_RE.test(representativeId)) return { error: "Representante inválido." };
  try {
    const { data, error } = await client
      .from("company_legal_representatives")
      .select("signature_path")
      .eq("id", representativeId)
      .maybeSingle();
    if (error || !data?.signature_path) return { error: "Este representante não tem assinatura cadastrada." };
    return { ok: true, url: await createSignatureSignedUrl(data.signature_path as string) };
  } catch (error) {
    return { error: toMessage(error) };
  }
}
