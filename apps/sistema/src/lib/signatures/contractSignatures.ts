import "server-only";
import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "../supabase/admin";

export type SignatureInvitation = {
  id: string;
  contract_id: string;
  document_id: string;
  request_id: string | null;
  previous_invitation_id: string | null;
  signer_name: string;
  signer_email: string;
  signer_phone: string | null;
  status: "pending" | "signed" | "revoked" | "expired";
  expires_at: string;
  signed_at: string | null;
  receipt_document_id: string | null;
  signed_document_id: string | null;
  notification_channel?: "manual" | "whatsapp";
  notification_status?: "not_sent" | "accepted_by_meta" | "failed";
  notification_message_id?: string | null;
  created_at: string;
};

/** Rodada com múltiplos signatários (ver migration 20261029100600_contract_multi_signer.sql). */
export type SignatureRequest = {
  id: string;
  contract_id: string;
  document_id: string;
  status: "pending" | "completed" | "cancelled";
  final_document_id: string | null;
  created_at: string;
  completed_at: string | null;
};

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function findSignatureInvitation(token: string): Promise<SignatureInvitation | null> {
  if (!/^[a-f0-9]{64}$/i.test(token)) return null;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("contract_signature_invitations")
    .select("id,contract_id,document_id,request_id,previous_invitation_id,signer_name,signer_email,signer_phone,status,expires_at,signed_at,receipt_document_id,signed_document_id,created_at")
    .eq("token_sha256", hashInvitationToken(token)).maybeSingle();
  if (error || !data) return null;
  return data as SignatureInvitation;
}

export function invitationIsPending(invitation: SignatureInvitation): boolean {
  return invitation.status === "pending" && new Date(invitation.expires_at).getTime() > Date.now();
}

export async function findInvitationSource(invitation: SignatureInvitation): Promise<{
  filename: string;
  path: string;
  contractNumber: string;
} | null> {
  const admin = createSupabaseAdminClient();
  const [docResponse, contractResponse] = await Promise.all([
    admin.from("contract_documents").select("id,name,file_reference,contract_id").eq("id", invitation.document_id).eq("contract_id", invitation.contract_id).maybeSingle(),
    admin.from("institutional_contracts").select("contract_number").eq("id", invitation.contract_id).maybeSingle(),
  ]);
  if (docResponse.error || contractResponse.error || !docResponse.data || !contractResponse.data) return null;
  const path = String(docResponse.data.file_reference ?? "");
  if (!path.startsWith("contracts/" + invitation.contract_id + "/") || !path.endsWith(".pdf")) return null;
  return {
    filename: String(docResponse.data.name ?? "Documento contratual"),
    path,
    contractNumber: String(contractResponse.data.contract_number || "Sem número"),
  };
}

export class SignatureTurnClaimError extends Error {}

/**
 * Passo 1 da finalização (ver migration 20261029100600_contract_multi_signer.sql):
 * reivindica o mutex curto da rodada (se o convite pertencer a uma) e
 * devolve de onde esta assinatura deve partir — o PDF assinado do
 * signatário anterior da MESMA rodada (acumulando evidência) ou o
 * documento original, se for a primeira assinatura. Convites sem
 * request_id (fluxo individual legado) sempre recebem o original,
 * sem nenhum bloqueio — comportamento 100% preservado.
 */
export async function claimSignatureTurn(
  invitation: SignatureInvitation, tokenHash: string,
): Promise<{ filename: string; path: string; contractNumber: string }> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("claim_signature_turn", {
    p_invitation_id: invitation.id, p_token_hash: tokenHash,
  }).maybeSingle();
  if (error || !data) {
    throw new SignatureTurnClaimError(error?.message ?? "Não foi possível iniciar a assinatura.");
  }
  const row = data as { base_storage_path: string; base_document_name: string; contract_number: string };
  if (!row.base_storage_path.startsWith("contracts/" + invitation.contract_id + "/") || !row.base_storage_path.endsWith(".pdf")) {
    throw new SignatureTurnClaimError("Referência de documento base inválida.");
  }
  return { filename: row.base_document_name, path: row.base_storage_path, contractNumber: row.contract_number };
}

/** Libera o mutex da rodada sem concluir — chamar quando algo falha entre claimSignatureTurn e o finalize RPC. */
export async function releaseSignatureTurn(invitationId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  await admin.rpc("release_signature_turn", { p_invitation_id: invitationId });
}
