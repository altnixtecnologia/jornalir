import "server-only";
import { createHash } from "node:crypto";
import type { createSupabaseAdminClient } from "../supabase/admin";

type Mode = "commercial" | "institutional";
type Admin = ReturnType<typeof createSupabaseAdminClient>;

export interface GoogleEvidenceSnapshot {
  provider: "google";
  subjectSha256: string;
  email: string;
  verifiedAt: string;
}

/**
 * Só lê prova vinculada ao MESMO convite e usuário que confirmou o OTP.
 * Não carrega token JWT (descartado) e nunca confunde login Google com
 * autorização para assinar.
 */
export async function googleEvidenceForSignature(
  admin: Admin, mode: Mode, invitationId: string, verifiedAuthUserId: string,
): Promise<GoogleEvidenceSnapshot | null> {
  const column = mode === "commercial" ? "commercial_invitation_id" : "institutional_invitation_id";
  const { data, error } = await admin.from("contract_signature_google_evidence")
    .select("provider_subject,verified_email,verified_at,google_auth_user_id")
    .eq(column, invitationId).maybeSingle();
  if (error) throw new Error("Não foi possível verificar a evidência Google da assinatura.");
  if (!data || data.google_auth_user_id !== verifiedAuthUserId) return null;
  return {
    provider: "google",
    subjectSha256: createHash("sha256").update(data.provider_subject).digest("hex"),
    email: data.verified_email,
    verifiedAt: data.verified_at,
  };
}
