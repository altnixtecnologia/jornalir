import "server-only";
import { createSupabaseAdminClient } from "../supabase/admin";
import { decodeVerificationCode, type VerificationKind } from "./publicVerification";

export interface PublicSignatureCheck {
  kind: VerificationKind;
  /** Hash EXATO do PDF da versão deste aceite. Não há acesso público ao PDF. */
  sha256: string;
  signedAt: string;
  /** Rodada concluída ou ainda existem outras assinaturas pendentes. */
  complete: boolean;
}

const HEX64 = /^[a-f0-9]{64}$/;

/**
 * Consulta pública sem PII. Só respostas relativas a aceites já concluídos.
 * O MAC protege UUIDs contra consultas arbitrárias; não devolver tokens de
 * assinatura, e-mails, CPF, nomes, arquivos ou links de Storage.
 */
export async function checkPublicSignatureCode(code: string): Promise<PublicSignatureCheck | null> {
  const secret = process.env.SIGNATURE_VERIFICATION_SECRET;
  if (!secret || secret.length < 32) return null;
  const parsed = decodeVerificationCode(code, secret);
  if (!parsed) return null;
  const admin = createSupabaseAdminClient();
  const table = parsed.kind === "commercial"
    ? "commercial_signature_invitations" : "contract_signature_invitations";
  const { data, error } = await admin.from(table)
    .select("status,signed_at,signed_sha256,request_id")
    .eq("id", parsed.invitationId).maybeSingle();
  if (error || !data || data.status !== "signed" ||
    !data.signed_at || !HEX64.test(String(data.signed_sha256 ?? ""))) return null;

  let complete = true;
  if (data.request_id) {
    const requestTable = parsed.kind === "commercial"
      ? "commercial_signature_requests" : "contract_signature_requests";
    const request = await admin.from(requestTable)
      .select("status").eq("id", data.request_id).maybeSingle();
    if (request.error || !request.data) return null;
    complete = request.data.status === "completed";
  }
  return {
    kind: parsed.kind,
    sha256: String(data.signed_sha256),
    signedAt: String(data.signed_at),
    complete,
  };
}
