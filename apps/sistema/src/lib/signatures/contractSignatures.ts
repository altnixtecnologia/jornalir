import "server-only";
import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "../supabase/admin";

export type SignatureInvitation = {
  id: string;
  contract_id: string;
  document_id: string;
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

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function findSignatureInvitation(token: string): Promise<SignatureInvitation | null> {
  if (!/^[a-f0-9]{64}$/i.test(token)) return null;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("contract_signature_invitations")
    .select("id,contract_id,document_id,signer_name,signer_email,signer_phone,status,expires_at,signed_at,receipt_document_id,signed_document_id,created_at")
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
