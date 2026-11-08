import "server-only";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../supabase/server";
import { createSupabaseAdminClient } from "../supabase/admin";
import { getSupabasePublicEnv } from "../supabase/env";
import { checkModuleAction } from "../permissions/checkModuleAction";
import { checkFinanceAction } from "../permissions/checkFinanceAction";
import { checkContractSigningGrant } from "../permissions/checkContractSigningGrant";
import { recordAuditEventSupabase } from "../../providers/supabase/auditEvents.supabase";
import { evaluateRepresentative, type LegalRepresentativeRow } from "../contracts/contractorProfile";
import { SIGNATURE_BUCKET } from "../contracts/signatureImage";
import { persistCommercialEvidence } from "./commercialEvidenceStorage";
import { prepareSignaturePdf, stampCompanySignature } from "./companySignaturePdf";
import type { PlacedField, SignerSlot } from "./signaturePlacement";
import {
  selectRequiredRepresentatives,
  sha256Hex,
  type CompanyRound,
  type CompanySigningDeps,
  type NewRoundRow,
  type RoundReference,
  type RoundStatus,
  type SigningModality,
} from "./companySigning";

/**
 * Adaptadores REAIS da assinatura da empresa (Etapa 3A): banco (service role
 * para escrita, depois de a Server Action checar a permissão), storage privado
 * `contract-documents`, PNG em `signature-images` e reautenticação por senha.
 * Nada aqui envia mensagem, cria cobrança ou convida o cliente.
 */

const DOCS_BUCKET = "contract-documents";
const ROUND_COLUMNS =
  "id, modality, status, commercial_document_id, contract_id, source_document_id, representative_id, required_representative_ids, required_signatures, " +
  "signer_slots, layout_mode, layout_fields, document_title, original_path, original_sha256, prepared_path, prepared_sha256, final_path, final_sha256, " +
  "cancel_reason, contract_company_signatures(sequence, signer_key, signer_profile_id, representative_id, signed_path, signed_sha256, signed_at, signer_name)";

interface RoundRow {
  id: string;
  modality: SigningModality;
  status: RoundStatus;
  commercial_document_id: string | null;
  contract_id: string | null;
  source_document_id: string | null;
  representative_id: string | null;
  required_representative_ids: string[] | null;
  required_signatures: number;
  signer_slots: SignerSlot[];
  layout_mode: "automatic" | "manual";
  layout_fields: PlacedField[];
  document_title: string;
  original_path: string;
  original_sha256: string;
  prepared_path: string;
  prepared_sha256: string;
  final_path: string | null;
  final_sha256: string | null;
  cancel_reason: string | null;
  contract_company_signatures: Array<{
    sequence: number; signer_key: string; signer_profile_id: string; representative_id: string | null;
    signed_path: string; signed_sha256: string; signed_at: string; signer_name: string;
  }> | null;
}

export type CompanyRoundView = CompanyRound & { cancelReason?: string | null; signedNames: Record<string, string>; signedAt: Record<string, string> };

function mapRound(row: RoundRow): CompanyRoundView {
  const signatures = [...(row.contract_company_signatures ?? [])].sort((a, b) => a.sequence - b.sequence);
  return {
    id: row.id,
    modality: row.modality,
    status: row.status,
    commercialDocumentId: row.commercial_document_id,
    contractId: row.contract_id,
    sourceDocumentId: row.source_document_id,
    representativeId: row.representative_id,
    requiredRepresentativeIds: row.required_representative_ids ?? [],
    requiredSignatures: row.required_signatures,
    signerSlots: row.signer_slots,
    layoutMode: row.layout_mode,
    layoutFields: row.layout_fields,
    documentTitle: row.document_title,
    originalPath: row.original_path,
    originalSha256: row.original_sha256,
    preparedPath: row.prepared_path,
    preparedSha256: row.prepared_sha256,
    finalPath: row.final_path,
    finalSha256: row.final_sha256,
    cancelReason: row.cancel_reason,
    signatures: signatures.map((signature) => ({
      sequence: signature.sequence, signerKey: signature.signer_key, profileId: signature.signer_profile_id,
      representativeId: signature.representative_id, signedPath: signature.signed_path, signedSha256: signature.signed_sha256, signedAt: signature.signed_at,
    })),
    signedNames: Object.fromEntries(signatures.map((signature) => [signature.signer_key, signature.signer_name])),
    signedAt: Object.fromEntries(signatures.map((signature) => [signature.signer_key, signature.signed_at])),
  };
}

export function companyPathFor(round: { id: string; modality: SigningModality; contractId?: string }, kind: "prepared" | "signed", sequence: number, sha256: string): string {
  const base = round.modality === "commercial" ? `commercial-company-signatures/${round.id}` : `contracts/${round.contractId}/company-signing/${round.id}`;
  return `${base}/${kind}-${sequence}-${sha256.slice(0, 16)}.pdf`;
}

async function downloadPdf(admin: SupabaseClient, path: string): Promise<Uint8Array> {
  const { data, error } = await admin.storage.from(DOCS_BUCKET).download(path);
  if (error || !data) throw new Error("Não foi possível ler o PDF armazenado.");
  return new Uint8Array(await data.arrayBuffer());
}

function toDbJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

export function createCompanySigningDeps(): CompanySigningDeps {
  const client = createSupabaseServerClient();
  const admin = createSupabaseAdminClient();
  let cachedActor: { profileId: string; name: string; email: string } | null = null;

  async function currentActor(): Promise<{ profileId: string; name: string; email: string }> {
    if (cachedActor) return cachedActor;
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) throw new Error("Sessão inválida. Faça login novamente.");
    const { data: profile } = await client.from("profiles").select("name, active").eq("id", data.user.id).maybeSingle();
    if (!profile || profile.active !== true) throw new Error("Usuário sem acesso ativo ao sistema.");
    cachedActor = { profileId: data.user.id, name: String(profile.name ?? "").trim() || (data.user.email ?? "Usuário"), email: data.user.email ?? "" };
    return cachedActor;
  }

  async function fetchRound(column: string, value: string, activeOnly = false): Promise<CompanyRoundView | null> {
    let query = admin.from("contract_company_signature_rounds").select(ROUND_COLUMNS).eq(column, value);
    if (activeOnly) query = query.neq("status", "cancelled");
    const { data, error } = await query.limit(1);
    if (error) throw new Error("Não foi possível consultar a rodada de assinatura.");
    const row = (data as unknown as RoundRow[] | null)?.[0];
    return row ? mapRound(row) : null;
  }

  return {
    newId: () => randomUUID(),
    now: () => new Date(),
    checkPrepare: (modality) => (modality === "commercial" ? checkModuleAction("publicidade", "contratos_revisar") : checkFinanceAction("contratos_editar")),
    checkSigningGrant: () => checkContractSigningGrant(),

    loadSource: async (ref: RoundReference) => {
      if (ref.modality === "commercial") {
        const { data } = await admin.from("commercial_contract_documents")
          .select("id, title, file_reference, sha256, template_id, template_version, addendum_id")
          .eq("id", ref.commercialDocumentId as string).maybeSingle();
        if (!data) return null;
        return {
          title: String(data.title), path: String(data.file_reference), bytes: await downloadPdf(admin, String(data.file_reference)),
          recordedSha256: String(data.sha256), templateId: data.template_id as string, templateVersion: Number(data.template_version),
        };
      }
      const { data } = await admin.from("contract_documents").select("id, name, file_reference, contract_id")
        .eq("id", ref.documentId as string).eq("contract_id", ref.contractId as string).maybeSingle();
      if (!data || !String(data.file_reference ?? "").startsWith(`contracts/${ref.contractId}/`)) return null;
      return { title: String(data.name), path: String(data.file_reference), bytes: await downloadPdf(admin, String(data.file_reference)) };
    },

    loadRepresentatives: async () => {
      const { data, error } = await admin.from("company_legal_representatives")
        .select("id, full_name, cpf, role_title, nationality, representation_rule, powers_description, powers_valid_from, powers_valid_until, active, is_default, profile_id");
      if (error) throw new Error("Não foi possível consultar os representantes legais.");
      return (data ?? []) as Array<LegalRepresentativeRow & { profile_id: string | null }>;
    },

    loadManualLayout: async (templateId) => {
      const { data, error } = await admin.from("contract_signature_field_layouts").select("fields").eq("template_id", templateId).maybeSingle();
      if (error) return null; // tabela ainda não aplicada → layout automático
      return (data?.fields as PlacedField[] | undefined) ?? null;
    },

    preparePdf: async (input) => {
      const prepared = await prepareSignaturePdf(input);
      return { bytes: prepared.bytes, layoutMode: prepared.mode, layoutFields: prepared.layout.fields };
    },
    stampPdf: (input) => stampCompanySignature(input),
    pathFor: companyPathFor,

    writePdf: async (path, bytes, sha256) => {
      await persistCommercialEvidence(admin as never, { bucket: DOCS_BUCKET, path, format: "application/pdf", candidate: bytes, expectedSha256: sha256 });
    },
    readPdf: (path) => downloadPdf(admin, path),

    findActiveRound: (ref) =>
      ref.modality === "commercial"
        ? fetchRound("commercial_document_id", ref.commercialDocumentId as string, true)
        : fetchRound("source_document_id", ref.documentId as string, true),
    getRound: (roundId) => fetchRound("id", roundId),

    createRound: async (row: NewRoundRow, actorId: string) => {
      const { error } = await admin.from("contract_company_signature_rounds").insert({
        id: row.id,
        modality: row.modality,
        commercial_document_id: row.commercialDocumentId ?? null,
        contract_id: row.contractId ?? null,
        source_document_id: row.modality === "institutional" ? row.sourceDocumentId ?? null : null,
        representative_id: row.representativeId ?? null,
        required_representative_ids: row.requiredRepresentativeIds,
        required_signatures: row.requiredSignatures,
        signer_slots: toDbJson(row.signerSlots),
        layout_mode: row.layoutMode,
        layout_fields: toDbJson(row.layoutFields),
        document_title: row.documentTitle.slice(0, 300),
        original_path: row.originalPath,
        original_sha256: row.originalSha256,
        prepared_path: row.preparedPath,
        prepared_sha256: row.preparedSha256,
        created_by: actorId,
      });
      if (error) {
        if (/duplicate|unique/i.test(error.message)) throw new Error("Este documento já possui uma rodada de assinatura da empresa em andamento.");
        throw new Error("Não foi possível preparar o documento para assinatura.");
      }
      const created = await fetchRound("id", row.id);
      if (!created) throw new Error("Rodada criada, mas não encontrada.");
      return created;
    },

    reprepareRound: async (roundId, patch) => {
      const { error } = await admin.from("contract_company_signature_rounds").update({
        representative_id: patch.representativeId ?? null,
        required_representative_ids: patch.requiredRepresentativeIds,
        required_signatures: patch.requiredSignatures,
        signer_slots: toDbJson(patch.signerSlots),
        layout_mode: patch.layoutMode,
        layout_fields: toDbJson(patch.layoutFields),
        prepared_path: patch.preparedPath,
        prepared_sha256: patch.preparedSha256,
      }).eq("id", roundId);
      if (error) throw new Error(/iniciada|encerrada/i.test(error.message) ? "A assinatura já começou: o representante não pode ser trocado." : "Não foi possível trocar o representante.");
      const round = await fetchRound("id", roundId);
      if (!round) throw new Error("Rodada não encontrada.");
      return round;
    },

    cancelRound: async (roundId, actorId, reason) => {
      const { error } = await admin.rpc("cancel_company_signature_round", { p_round_id: roundId, p_actor: actorId, p_reason: reason });
      if (error) throw new Error("Não foi possível cancelar a rodada de assinatura.");
    },

    claimTurn: async (roundId, profileId, representativeId, signerKey) => {
      const { data, error } = await admin.rpc("claim_company_signature_turn", {
        p_round_id: roundId, p_profile_id: profileId, p_representative_id: representativeId ?? null, p_signer_key: signerKey,
      });
      if (error) {
        if (error.code === "55P03") throw new Error("Outra assinatura está sendo concluída. Tente novamente em instantes.");
        if (error.code === "23505") throw new Error("Esta assinatura já foi registrada neste documento.");
        throw new Error("Não foi possível iniciar a assinatura neste documento.");
      }
      const row = (Array.isArray(data) ? data[0] : data) as { base_path: string; base_sha256: string; next_sequence: number } | null;
      if (!row) throw new Error("Não foi possível iniciar a assinatura neste documento.");
      return { basePath: row.base_path, baseSha256: row.base_sha256, nextSequence: row.next_sequence };
    },
    releaseTurn: async (roundId, profileId) => {
      await admin.rpc("release_company_signature_turn", { p_round_id: roundId, p_profile_id: profileId });
    },
    finalize: async (params) => {
      const { data, error } = await admin.rpc("finalize_company_signature", {
        p_round_id: params.roundId, p_profile_id: params.profileId, p_representative_id: params.representativeId ?? null,
        p_signer_key: params.signerKey, p_signer_name: params.signerName, p_signer_title: params.signerTitle,
        p_powers_snapshot: params.powersSnapshot, p_representation_rule: params.representationRule, p_source_sha256: params.sourceSha256,
        p_signed_path: params.signedPath, p_signed_sha256: params.signedSha256, p_png_sha256: params.signaturePngSha256 ?? null, p_audit: toDbJson(params.audit),
      });
      if (error) throw new Error("Não foi possível registrar a assinatura. Nada foi assinado; tente novamente.");
      const row = (Array.isArray(data) ? data[0] : data) as { completed: boolean; final_document_id: string | null } | null;
      return { completed: row?.completed === true, finalDocumentId: row?.final_document_id ?? null };
    },

    loadSignaturePng: async (owner) => {
      const record = owner.kind === "profile"
        ? (await admin.from("staff_signature_images").select("storage_path, sha256").eq("profile_id", owner.id).maybeSingle()).data
        : (await admin.from("company_legal_representatives").select("signature_path, signature_sha256").eq("id", owner.id).maybeSingle()).data;
      if (!record) return null;
      const path = String((record as Record<string, unknown>).storage_path ?? (record as Record<string, unknown>).signature_path ?? "");
      const sha = String((record as Record<string, unknown>).sha256 ?? (record as Record<string, unknown>).signature_sha256 ?? "");
      if (!path || !sha) return null;
      const { data, error } = await admin.storage.from(SIGNATURE_BUCKET).download(path);
      if (error || !data) return null;
      const bytes = new Uint8Array(await data.arrayBuffer());
      // Se o arquivo não conferir com o hash cadastrado, NÃO usa a imagem (assina só com texto).
      return sha256Hex(bytes) === sha ? { bytes, sha256: sha } : null;
    },

    reauthenticate: async (password) => {
      const actor = await currentActor();
      if (!actor.email) return false;
      const { url, publishableKey } = getSupabasePublicEnv();
      const temporary = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
      const { data, error } = await temporary.auth.signInWithPassword({ email: actor.email, password });
      if (error || data.user?.id !== actor.profileId) return false;
      await temporary.auth.signOut({ scope: "local" }).catch(() => undefined);
      return true;
    },

    actor: async () => {
      const actor = await currentActor();
      return { profileId: actor.profileId, name: actor.name };
    },

    audit: async (entityId, action, metadata) => {
      const actor = await currentActor();
      await recordAuditEventSupabase(admin, { userId: actor.profileId, entityType: "contract_company_signature_round", entityId, action, metadata });
    },
  };
}

// --------------------------------------------------------------- dados do painel

export interface CompanySignatureSignerView {
  key: string;
  label: string;
  signedName?: string;
  signedAt?: string;
}

export interface CompanySignaturePanelItem {
  ref: { modality: SigningModality; commercialDocumentId?: string; contractId?: string; documentId?: string };
  title: string;
  round: null | {
    id: string;
    status: RoundStatus;
    layoutMode: "automatic" | "manual";
    representativeId?: string | null;
    signers: CompanySignatureSignerView[];
    preparedSha256: string;
    latestSha256: string;
    finalSha256?: string | null;
    cancelReason?: string | null;
  };
  /** O usuário atual pode confirmar a assinatura AGORA (com o motivo se não puder). */
  canSign: { allowed: boolean; reason?: string; signerName?: string };
}

export interface RepresentativeOption {
  id: string;
  label: string;
  rule: "individual" | "joint";
  usable: boolean;
  reason?: string;
}

export interface CompanySignaturePanelData {
  modality: SigningModality;
  canPrepare: boolean;
  representatives: RepresentativeOption[];
  items: CompanySignaturePanelItem[];
}

/** Carrega os dados do painel no servidor (página). Não escreve nada. */
export async function loadCompanySignaturePanel(modality: SigningModality, documents: Array<{ id: string; title: string; contractId?: string }>): Promise<CompanySignaturePanelData> {
  const deps = createCompanySigningDeps();
  const denied = await deps.checkPrepare(modality);
  const canPrepare = denied === null;
  const actor = await deps.actor().catch(() => null);
  const grantDenied = modality === "commercial" ? await deps.checkSigningGrant() : null;
  const today = new Date().toISOString().slice(0, 10);

  let representatives: RepresentativeOption[] = [];
  let allReps: Array<LegalRepresentativeRow & { profile_id?: string | null }> = [];
  if (modality === "institutional") {
    allReps = await deps.loadRepresentatives().catch(() => []);
    representatives = allReps.filter((rep) => rep.active).map((rep) => {
      const selection = selectRequiredRepresentatives(allReps, rep.id, today);
      return { id: rep.id, label: `${rep.full_name} — ${rep.role_title}`, rule: rep.representation_rule, usable: selection.ok, reason: selection.ok ? undefined : selection.error };
    });
  }

  const items: CompanySignaturePanelItem[] = [];
  for (const document of documents) {
    const ref = modality === "commercial"
      ? { modality, commercialDocumentId: document.id }
      : { modality, contractId: document.contractId, documentId: document.id };
    const round = (await deps.findActiveRound(ref).catch(() => null)) as CompanyRoundView | null;

    let canSign: CompanySignaturePanelItem["canSign"] = { allowed: false, reason: "Prepare o documento para assinatura primeiro." };
    if (round && (round.status === "preparing" || round.status === "signing")) {
      if (modality === "commercial") {
        canSign = grantDenied
          ? { allowed: false, reason: grantDenied }
          : round.signatures.some((signature) => signature.profileId === actor?.profileId)
            ? { allowed: false, reason: "Você já assinou este documento." }
            : { allowed: true, signerName: actor?.name };
      } else {
        const mine = round.requiredRepresentativeIds.map((id) => allReps.find((rep) => rep.id === id)).find((rep) => rep && rep.profile_id === actor?.profileId);
        if (!mine) canSign = { allowed: false, reason: "Apenas os representantes legais exigidos (vinculados ao usuário) podem assinar." };
        else if (!evaluateRepresentative(mine, today).valid) canSign = { allowed: false, reason: evaluateRepresentative(mine, today).reason };
        else if (round.signatures.some((signature) => signature.representativeId === mine.id)) canSign = { allowed: false, reason: "Você já assinou este documento." };
        else canSign = { allowed: true, signerName: mine.full_name };
      }
    } else if (round?.status === "completed") canSign = { allowed: false, reason: "Documento já assinado pela empresa." };

    items.push({
      ref,
      title: document.title,
      round: round
        ? {
            id: round.id,
            status: round.status,
            layoutMode: round.layoutMode,
            representativeId: round.representativeId,
            signers: round.signerSlots.filter((slot) => slot.role === "contratada").map((slot) => ({
              key: slot.key,
              label: modality === "institutional" && round.requiredRepresentativeIds.length > 0
                ? `${allReps.find((rep) => rep.id === round.requiredRepresentativeIds[Number(slot.key.split("-")[1]) - 1])?.full_name ?? slot.label}`
                : slot.label,
              signedName: round.signedNames[slot.key],
              signedAt: round.signedAt[slot.key],
            })),
            preparedSha256: round.preparedSha256,
            latestSha256: [...round.signatures].sort((a, b) => b.sequence - a.sequence)[0]?.signedSha256 ?? round.preparedSha256,
            finalSha256: round.finalSha256,
            cancelReason: round.cancelReason,
          }
        : null,
      canSign,
    });
  }
  return { modality, canPrepare, representatives, items };
}
